import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Effect } from 'effect';
import { NodeRuntime } from '@effect/platform-node';
import { ObserverRuntime } from './observer.ts';
import { startServer } from './server.ts';
import { atomic, readJSON } from './store.ts';

const stateDir = process.env.FACTORY_STATE_DIR || path.join(os.homedir(), '.local', 'state', 'software-factory');
const lock = path.join(stateDir, 'daemon.lock');
const descriptor = path.join(stateDir, 'daemon.json');

interface Owner { pid: number; token: string }
interface Descriptor { pid: number; url: string; token: string }

function ownerIsLive(owner: { pid: number } | null) {
  if (!owner || !Number.isInteger(owner.pid) || owner.pid <= 0) return false;
  try { process.kill(owner.pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH'; }
}
async function acquireGate(gate: string): Promise<Owner | undefined> {
  const owner = { pid: process.pid, token: randomBytes(32).toString('hex') };
  const create = async () => {
    await fs.mkdir(gate);
    try { await atomic(path.join(gate, 'owner.json'), owner); return owner; }
    catch (error) { await fs.rm(gate, { recursive: true, force: true }); throw error; }
  };
  try { return await create(); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  const original = await fs.stat(gate).catch(() => null);
  const current = await readJSON<Owner>(path.join(gate, 'owner.json')).catch(() => null);
  if (!original || ownerIsLive(current) || (!current && Date.now() - original.mtimeMs < 10_000)) return undefined;
  // Claim recovery inside the existing directory; only one contender can rename it.
  const claim = path.join(gate, 'recovery.lock');
  const claimOwner = await acquireGate(claim);
  if (!claimOwner) return undefined;
  try {
    const observed = await fs.stat(gate).catch(() => null);
    const latest = await readJSON<Owner>(path.join(gate, 'owner.json')).catch(() => null);
    if (!observed || observed.dev !== original.dev || observed.ino !== original.ino || ownerIsLive(latest)) return undefined;
    const quarantine = `${gate}.stale-${owner.token}`;
    await fs.rename(gate, quarantine);
    await fs.rm(quarantine, { recursive: true, force: true });
    try { return await create(); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; return undefined; }
  } finally {
    const claimed = await readJSON<Owner>(path.join(claim, 'owner.json')).catch(() => null);
    if (claimed?.token === claimOwner.token) await fs.rm(claim, { recursive: true, force: true });
  }
}
async function acquireLock(): Promise<Owner | undefined> {
  await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });
  const gate = path.join(stateDir, 'daemon-start.lock');
  // Serialize all startup/recovery decisions, not just normal lock creation.
  const gateOwner = await acquireGate(gate);
  if (!gateOwner) return undefined;
  try {
    const owner: Owner = { pid: process.pid, token: randomBytes(32).toString('hex') };
    try { await fs.mkdir(lock); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const current = await readJSON<{ pid: number }>(path.join(lock, 'owner.json')).catch(() => null);
      if (ownerIsLive(current)) return undefined;
      if (!current) {
        const stat = await fs.stat(lock).catch(() => null);
        if (!stat || Date.now() - stat.mtimeMs < 10_000) return undefined;
      }
      const stale = `${lock}.stale-${owner.token}`;
      await fs.rename(lock, stale);
      await fs.rm(stale, { recursive: true, force: true });
      await fs.mkdir(lock);
    }
    try { await atomic(path.join(lock, 'owner.json'), owner); return owner; }
    catch (error) { await fs.rm(lock, { recursive: true, force: true }); throw error; }
  } finally {
    const current = await readJSON<Owner>(path.join(gate, 'owner.json')).catch(() => null);
    if (current?.token === gateOwner.token) await fs.rm(gate, { recursive: true, force: true });
  }
}

const program = Effect.scoped(Effect.gen(function*() {
  let owner: Owner | undefined;
  let runtime: ObserverRuntime | undefined;
  let app: Awaited<ReturnType<typeof startServer>> | undefined;

  owner = yield* Effect.acquireRelease(
    Effect.promise(acquireLock),
    () => Effect.promise(async () => {
      // The server and observer are stopped before publishing the daemon as absent.
      try { if (app) await app.close(); }
      finally {
        try { if (runtime) await runtime.shutdown(); }
        finally {
          if (app) {
            const current = await readJSON<Descriptor>(descriptor).catch(() => null);
            if (current?.pid === process.pid && current.token === app.token) {
              await fs.rm(descriptor, { force: true }).catch(() => {});
            }
          }
          if (owner) {
            const current = await readJSON<Owner>(path.join(lock, 'owner.json')).catch(() => null);
            // If writing owner.json failed, this process still owns the directory it created.
            if (current && current.pid === owner.pid && current.token === owner.token) {
              await fs.rm(lock, { recursive: true, force: true }).catch(() => {});
            }
          }
        }
      }
    }),
  );
  if (!owner) return;

  runtime = new ObserverRuntime(stateDir);
  yield* Effect.promise(() => runtime!.init());
  app = yield* Effect.promise(() => startServer(runtime!, { port: process.env.FACTORY_DASHBOARD_PORT ? Number(process.env.FACTORY_DASHBOARD_PORT) : 0 }));
  const daemon: Descriptor = { pid: process.pid, url: app.url, token: app.token };
  yield* Effect.promise(() => atomic(descriptor, daemon));
  yield* Effect.sync(() => console.log(`Factory dashboard: ${app!.url}`));

  // An authenticated /api/restart closes the HTTP server. Its close event ends
  // the main effect, allowing the scope's normal finalizers to run exactly once.
  yield* Effect.promise(() => new Promise<void>(resolve => app!.server.once('close', resolve)));
}));

NodeRuntime.runMain(program);
