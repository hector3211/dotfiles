import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { readJSON } from './store.ts';

interface Descriptor { pid: number; url: string; token: string }
export const stateDirectory = () => process.env.FACTORY_STATE_DIR || path.join(os.homedir(), '.local', 'state', 'software-factory');
async function alive(dir: string): Promise<Descriptor | null> {
  const d = await readJSON<Descriptor>(path.join(dir, 'daemon.json')).catch(() => null);
  if (!d || !/^http:\/\/127\.0\.0\.1:\d+$/.test(d.url)) return null;
  try {
    process.kill(d.pid, 0);
    const response = await fetch(d.url + '/api/session', { signal: AbortSignal.timeout(1000) });
    const session = await response.json() as { token: string };
    return session.token === d.token ? d : null;
  } catch { return null; }
}
export async function ensureDaemon(): Promise<Descriptor> {
  const dir = stateDirectory(); const current = await alive(dir); if (current) return current;
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const log = await fs.open(path.join(dir, 'daemon.log'), 'a', 0o600);
  const proc = spawn(process.execPath, [path.join(import.meta.dirname, 'daemon.ts')], { cwd: os.homedir(), detached: true, stdio: ['ignore', log.fd, log.fd], env: process.env });
  let spawnError: Error | undefined; proc.on('error', e => { spawnError = e; }); proc.unref(); await log.close();
  for (let i = 0; i < 100; i++) {
    if (spawnError) throw spawnError;
    await new Promise(r => setTimeout(r, 150));
    const next = await alive(dir); if (next) return next;
  }
  throw new Error(`Factory could not start. Inspect ${path.join(dir, 'daemon.log')}`);
}
export async function callFactory(args: Record<string, unknown>) {
  const d = await ensureDaemon();
  const response = await fetch(d.url + '/api/command', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Factory-Token': d.token }, body: JSON.stringify(args), signal: AbortSignal.timeout(120_000) });
  const result = await response.json() as { error?: string };
  if (!response.ok) throw new Error(result.error || 'Factory request failed');
  return result;
}
export function parseCommand(text: string, cwd: string, runtime?: string, model?: string, worker?: string): Record<string, unknown> {
  if (worker && !['pi', 'opencode', 'claude', 'codex'].includes(worker)) throw new Error('Worker must be pi, opencode, claude or codex');
  // T3 is a host, not a headless worker binary. Use its underlying provider.
  if (runtime === 't3') runtime = worker || 'codex';
  else if (worker) runtime = worker;
  const [verb = '', ...rest] = text.trim().split(/\s+/); const tail = rest.join(' ');
  const common = { cwd, ...(runtime ? { runtime } : {}), ...(model ? { model } : {}) };
  if (!verb || verb === 'help') return { action: 'help' };
  if (['status', 'dashboard'].includes(verb)) return { ...common, action: verb };
  if (['inspect', 'pause', 'resume', 'cancel'].includes(verb)) return { ...common, action: verb, id: tail };
  if (verb === 'answer') return { ...common, action: 'answer', id: rest[0], answer: rest.slice(1).join(' ') };
  if (verb === 'issue') return { ...common, action: 'issue', issue: tail };
  if (verb === 'config') {
    if (!tail) return { ...common, action: 'config' };
    let [key, ...values] = rest; let raw = values.join(' ');
    if (key === 'publish') key = 'publishPullRequests';
    if (key === 'profile' && !['work', 'personal'].includes(raw)) throw new Error('Profile must be work or personal');
    if (key === 'runtime' && !['pi', 'opencode', 'claude', 'codex'].includes(raw)) throw new Error('Runtime must be pi, opencode, claude or codex');
    let value: unknown = raw;
    if (raw === 'true' || raw === 'false') value = raw === 'true';
    else if (/^\d+(?:\.\d+)?$/.test(raw)) value = Number(raw);
    else if (key === 'requiredChecks') value = JSON.parse(raw);
    return { ...common, action: 'config', key, value };
  }
  return { ...common, action: 'start', description: text.trim() };
}
export const help = `/factory <feature description>\n/factory issue #123\n/factory status | dashboard | inspect <id>\n/factory pause | resume | cancel <id>\n/factory answer <id> <response>\n/factory config\n/factory config profile work|personal\n/factory config runtime pi|opencode|claude|codex\n/factory config publish true|false\n\nWork: human-only merging. Personal: eligible PRs can merge automatically.\nPR publication is opt-in once per project. Existing skills remain untouched.`;
