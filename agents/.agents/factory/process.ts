import { spawn, execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
const exec = promisify(execFile);

// npm Windows .cmd shims cannot be spawned directly. Resolve the JS entry instead of
// passing arbitrary feature prompts through cmd.exe (which would risk shell injection).
export async function resolveProgram(command: string, args: string[], platform = process.platform): Promise<{ command: string; args: string[] }> {
  if (platform !== 'win32') return { command, args };
  if (/\.(?:m?js|ts)$/i.test(command)) return { command: process.execPath, args: [command, ...args] };
  const paths = path.isAbsolute(command) ? [command] : (await exec('where.exe', [command])).stdout.trim().split(/\r?\n/);
  const native = paths.find(p => /\.exe$/i.test(p));
  if (native) return { command: native, args };
  const shim = paths.find(p => /\.cmd$/i.test(p));
  if (shim) {
    const content = await fs.readFile(shim, 'utf8');
    const target = /"%(?:dp0|~dp0)%?\\([^"\r\n]+\.(?:m?js))"/i.exec(content)?.[1];
    if (target) return { command: process.execPath, args: [path.resolve(path.dirname(shim), target), ...args] };
  }
  throw new Error(`Cannot safely launch ${command} on Windows. Set FACTORY_${path.basename(command).toUpperCase()}_BIN to its .exe or JavaScript entry file.`);
}
export function terminateTree(pid: number | undefined, signal: NodeJS.Signals) {
  if (!pid) return;
  if (process.platform === 'win32') {
    const child = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    child.on('error', () => { try { process.kill(pid, signal); } catch {} });
  } else { try { process.kill(-pid, signal); } catch {} }
}
export async function processIdentity(pid: number): Promise<string | null> {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    if (process.platform === 'linux') {
      const stat = await fs.readFile(`/proc/${pid}/stat`, 'utf8');
      // field 22 is process start time; comm can contain spaces and parentheses.
      return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
    }
    if (process.platform === 'win32') return (await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().Ticks`], { timeout: 5000 })).stdout.trim();
  } catch {}
  return null;
}
export function shellInvocation(command: string, platform = process.platform) {
  return platform === 'win32'
    ? { command: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', command] }
    : { command: '/bin/sh', args: ['-c', command] };
}
