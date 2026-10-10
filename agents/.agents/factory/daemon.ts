import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Runtime } from './runtime.ts';
import { startServer } from './server.ts';
import { atomic, readJSON } from './store.ts';

const stateDir = process.env.FACTORY_STATE_DIR || path.join(os.homedir(), '.local', 'state', 'software-factory');
await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });
const lock = path.join(stateDir, 'daemon.lock');
try { await fs.mkdir(lock); }
catch {
  const pid = await readJSON<{ pid: number }>(path.join(lock, 'owner.json')).catch(() => null);
  if (pid) { try { process.kill(pid.pid, 0); process.exit(0); } catch {} }
  // Fresh incomplete locks may belong to a competing startup. Do not steal them.
  const age = Date.now() - (await fs.stat(lock)).mtimeMs;
  if (age < 10_000) process.exit(0);
  await fs.rm(lock, { recursive: true }); await fs.mkdir(lock);
}
await atomic(path.join(lock, 'owner.json'), { pid: process.pid });
const runtime = new Runtime(stateDir);
let app: Awaited<ReturnType<typeof startServer>> | undefined;
let closing = false;
const close = async () => {
  if (closing) return; closing = true;
  try { if (app) await app.close(); }
  finally { await fs.rm(path.join(stateDir, 'daemon.json'), { force: true }); await fs.rm(lock, { recursive: true, force: true }); }
};
try {
  await runtime.init(); app = await startServer(runtime);
  await atomic(path.join(stateDir, 'daemon.json'), { pid: process.pid, url: app.url, token: app.token });
  process.on('SIGTERM', () => { void close().then(() => process.exit(0)); });
  process.on('SIGINT', () => { void close().then(() => process.exit(0)); });
  console.log(`Factory dashboard: ${app.url}`);
} catch (error) { console.error(error); await close(); process.exitCode = 1; }
