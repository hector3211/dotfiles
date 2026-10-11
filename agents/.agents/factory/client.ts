import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { readJSON } from './store.ts';
import { sourceVersion } from './version.ts';

interface Descriptor { pid: number; url: string; token: string; version?: string; protocol?: string }
export const stateDirectory = () => process.env.FACTORY_STATE_DIR || path.join(os.homedir(), '.local', 'state', 'software-factory');
async function alive(dir: string): Promise<Descriptor | null> {
  const d = await readJSON<Descriptor>(path.join(dir, 'daemon.json')).catch(() => null);
  if (!d || !Number.isInteger(d.pid) || d.pid <= 0 || !/^http:\/\/127\.0\.0\.1:\d+$/.test(d.url)) return null;
  try {
    process.kill(d.pid, 0);
    const response = await fetch(d.url + '/api/session', { signal: AbortSignal.timeout(1000) });
    const session = await response.json() as { token: string; version?: string; protocol?: string };
    return session.token === d.token ? { ...d, version: session.version, protocol: session.protocol } : null;
  } catch { return null; }
}
async function restartOutdated(current: Descriptor, dir: string, stopLegacy = false) {
  if (current.protocol !== 'observer-v1' && !stopLegacy) {
    const snapshot = await fetch(current.url + '/api/jobs', { signal: AbortSignal.timeout(5000) }).then(r => r.json()) as { jobs?: { state: string }[] };
    if (!Array.isArray(snapshot.jobs) || snapshot.jobs.some(job => ['building', 'reviewing'].includes(job.state))) throw new Error('Legacy worker daemon is still running. Use /factory migrate to explicitly stop it and preserve its records/worktrees before using the observer.');
  }
  const response = await fetch(current.url + '/api/restart', { method: 'POST', headers: { 'X-Factory-Token': current.token }, signal: AbortSignal.timeout(5000) });
  if (!response.ok) {
    if (response.status !== 404 && !(stopLegacy && current.protocol !== 'observer-v1' && response.status === 409)) {
      const result = await response.json() as { error?: string };
      throw new Error(result.error || 'Factory could not apply its update');
    }
    // One-time migration from daemons predating the authenticated restart endpoint.
    const exec = promisify(execFile);
    const commandLine = process.platform === 'linux' ? await fs.readFile(`/proc/${current.pid}/cmdline`, 'utf8').catch(() => '')
      : process.platform === 'win32' ? (await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId = ${current.pid}").CommandLine`], { timeout: 5000 })).stdout
      : (await exec('ps', ['-p', String(current.pid), '-o', 'command='], { timeout: 5000 })).stdout;
    const expected = [path.join(import.meta.dirname, 'daemon.ts'), path.join(os.homedir(), '.agents', 'factory', 'daemon.ts')];
    if (!expected.some(file => process.platform === 'linux' ? commandLine.split('\0').includes(file) : commandLine.replace(/\\/g, '/').includes(file.replace(/\\/g, '/')))) throw new Error('An older Factory daemon needs a one-time restart before this update can run.');
    process.kill(current.pid, 'SIGTERM');
  }
  for (let i = 0; i < 100; i++) {
    await new Promise(resolve => setTimeout(resolve, 50));
    const running = await alive(dir);
    const owner = await readJSON<{ pid: number }>(path.join(dir, 'daemon.lock', 'owner.json')).catch(() => null);
    if ((!running || running.pid !== current.pid) && owner?.pid !== current.pid) return;
  }
  throw new Error('Factory is still shutting down; retry shortly. Jobs have been preserved.');
}
export async function ensureDaemon(options: { allowOutdated?: boolean } = {}): Promise<Descriptor> {
  const dir = stateDirectory(); const current = await alive(dir);
  if (current) {
    if (current.protocol === 'observer-v1' && (options.allowOutdated || current.version === await sourceVersion())) return current;
    await restartOutdated(current, dir);
  }
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const log = await fs.open(path.join(dir, 'daemon.log'), 'a', 0o600);
  const proc = spawn(process.execPath, [path.join(import.meta.dirname, 'daemon.ts')], { cwd: os.homedir(), detached: true, stdio: ['ignore', log.fd, log.fd], env: { ...process.env, ...(current ? { FACTORY_DASHBOARD_PORT: new URL(current.url).port } : {}) } });
  let spawnError: Error | undefined; proc.on('error', e => { spawnError = e; }); proc.unref(); await log.close();
  for (let i = 0; i < 100; i++) {
    if (spawnError) throw spawnError;
    await new Promise(r => setTimeout(r, 150));
    const next = await alive(dir); if (next) return next;
  }
  throw new Error(`Factory could not start. Inspect ${path.join(dir, 'daemon.log')}`);
}
export async function migrateLegacy(): Promise<Descriptor> {
  const dir = stateDirectory(); const current = await alive(dir);
  if (current && current.protocol !== 'observer-v1') await restartOutdated(current, dir, true);
  return ensureDaemon();
}
export async function callFactory(args: Record<string, unknown>) {
  const d = await ensureDaemon({ allowOutdated: ['pause', 'cancel', 'status', 'inspect'].includes(String(args.action)) });
  const response = await fetch(d.url + '/api/command', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Factory-Token': d.token }, body: JSON.stringify(args), signal: AbortSignal.timeout(120_000) });
  const result = await response.json() as { error?: string };
  if (!response.ok) throw new Error(result.error || 'Factory request failed');
  return result;
}
function firstArgument(text: string): { word: string; tail: string } {
  const match = /^\s*(?:"((?:\\.|[^"\\])*)"|'([^']*)'|(\S+))([\s\S]*)$/.exec(text);
  if (!match) return { word: '', tail: '' };
  return { word: (match[1] ?? match[2] ?? match[3]).replace(/\\"/g, '"'), tail: match[4].replace(/^\s/, '') };
}
export function parseCommand(text: string, cwd: string, runtime?: string, model?: string): Record<string, unknown> {
  const head = firstArgument(text); const verb = head.word.toLowerCase(); const tail = head.tail;
  const common = { cwd, ...(runtime ? { runtime } : {}), ...(model ? { model } : {}) };
  if (!verb || verb === 'help') return { action: 'help' };
  if (['status', 'dashboard'].includes(verb)) return { ...common, action: verb };
  if (['inspect', 'pause', 'resume', 'cancel', 'checkpoint'].includes(verb)) return { ...common, action: verb, id: tail.trim() };
  if (verb === 'answer') { const args = firstArgument(tail); return { ...common, action: 'answer', id: args.word, answer: args.tail }; }
  if (['start', 'new'].includes(verb)) return { ...common, action: 'start', description: tail };
  if (['report', 'ack', 'document', 'artifact'].includes(verb)) throw new Error('Use --request-file with a JSON object for structured reporting actions.');
  if (['config', 'attach', 'issue'].includes(verb)) throw new Error('Factory execution is now skill-driven. Ask your agent to handle project setup, policy, or issue intake.');
  return { ...common, action: 'start', description: text };
}
export const help = `Factory: skill-driven execution, observer-only dashboard.\n\nIn your agent: /factory <request>, or /factory new to describe the work.\n/factory dashboard | status | inspect <id>\n/factory pause | resume | cancel <id>\n/factory answer <id> <response>\n\nReporting helper: node cli.ts --request-file <JSON-file>\nActions: start, report, document, artifact, checkpoint, ack.\nThe helper records progress; it does not launch workers, run Git, or implement features.\nPause/cancel/resume are requests until the agent acknowledges them.`;
