import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { atomic } from './store.ts';
import { ensureDaemon, callFactory } from './client.ts';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
import { sourceVersion } from './version.ts';
import { ObserverRuntime } from './observer.ts';
import { startServer } from './server.ts';

test('outdated idle daemon is automatically replaced before commands run', async t => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'factory-lifecycle-'));
  const previous = process.env.FACTORY_STATE_DIR; process.env.FACTORY_STATE_DIR = stateDir;
  let fresh: Awaited<ReturnType<typeof ensureDaemon>> | undefined;
  let restarted = false;
  const token = 'test-only-token';
  const old = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/session') { res.end(JSON.stringify({ token, version: 'outdated', protocol: 'observer-v1' })); return; }
    if (req.url === '/api/restart' && req.headers['x-factory-token'] === token) {
      restarted = true; res.end('{"ok":true}');
      void fs.rm(path.join(stateDir, 'daemon.json'), { force: true }).then(() => old.close());
      return;
    }
    res.writeHead(404); res.end('{}');
  });
  t.after(async () => {
    if (fresh) {
      await fetch(fresh.url + '/api/restart', { method: 'POST', headers: { 'X-Factory-Token': fresh.token } }).catch(() => {});
      for (let i = 0; i < 100; i++) {
        if (!await fs.access(path.join(stateDir, 'daemon.lock')).then(() => true, () => false)) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    old.close();
    if (previous === undefined) delete process.env.FACTORY_STATE_DIR; else process.env.FACTORY_STATE_DIR = previous;
    await fs.rm(stateDir, { recursive: true, force: true, maxRetries: 5 });
  });
  await new Promise<void>(resolve => old.listen(0, '127.0.0.1', resolve));
  const address = old.address() as { port: number };
  await atomic(path.join(stateDir, 'daemon.json'), { pid: process.pid, url: `http://127.0.0.1:${address.port}`, token });
  fresh = await ensureDaemon();
  assert.equal(restarted, true);
  assert.notEqual(fresh.pid, process.pid);
  assert.equal(fresh.url, `http://127.0.0.1:${address.port}`, 'existing dashboard tabs keep their URL');
  assert.equal(fresh.version, await sourceVersion());
  const status = await fetch(fresh.url + '/api/jobs').then(r => r.json()) as { jobs: unknown[] };
  assert.deepEqual(status.jobs, []);
});

test('legacy worker daemons never receive observer management commands', async t => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'factory-legacy-protocol-'));
  const previous = process.env.FACTORY_STATE_DIR; process.env.FACTORY_STATE_DIR = stateDir;
  let mutations = 0;
  const old = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/session') res.end(JSON.stringify({ token: 'test-token' }));
    else if (req.url === '/api/jobs') res.end(JSON.stringify({ jobs: [{ state: 'building' }] }));
    else { mutations++; res.writeHead(404); res.end('{}'); }
  });
  t.after(async () => {
    old.close();
    if (previous === undefined) delete process.env.FACTORY_STATE_DIR; else process.env.FACTORY_STATE_DIR = previous;
    await fs.rm(stateDir, { recursive: true, force: true });
  });
  await new Promise<void>(resolve => old.listen(0, '127.0.0.1', resolve));
  await atomic(path.join(stateDir, 'daemon.json'), { pid: process.pid, url: `http://127.0.0.1:${(old.address() as { port: number }).port}`, token: 'test-token' });
  for (const action of ['status', 'pause', 'cancel']) await assert.rejects(callFactory({ action, id: 'old-job' }), /migrate/);
  assert.equal(mutations, 0);
});

test('concurrent startup reclaims an aged stale lock without deleting the winner', async t => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'factory-concurrent-'));
  let daemon: { url: string; token: string; pid: number } | undefined;
  t.after(async () => {
    if (daemon) await fetch(daemon.url + '/api/restart', { method: 'POST', headers: { 'X-Factory-Token': daemon.token } }).catch(() => {});
    for (let i = 0; i < 100; i++) { if (!await fs.access(path.join(stateDir, 'daemon.lock')).then(() => true, () => false)) break; await new Promise(resolve => setTimeout(resolve, 50)); }
    await fs.rm(stateDir, { recursive: true, force: true, maxRetries: 5 });
  });
  await atomic(path.join(stateDir, 'daemon.lock', 'owner.json'), { pid: 2147483647, token: 'stale' });
  await atomic(path.join(stateDir, 'daemon-start.lock', 'owner.json'), { pid: 2147483647, token: 'orphaned-startup' });
  await atomic(path.join(stateDir, 'daemon-start.lock', 'recovery.lock', 'owner.json'), { pid: 2147483647, token: 'orphaned-recovery' });
  const source = `import {ensureDaemon} from ${JSON.stringify(new URL('./client.ts', import.meta.url).href)}; console.log(JSON.stringify(await ensureDaemon()));`;
  const results = await Promise.all(Array.from({ length: 4 }, () => exec(process.execPath, ['--input-type=module', '-e', source], { env: { ...process.env, FACTORY_STATE_DIR: stateDir } })));
  const descriptors = results.map(result => JSON.parse(result.stdout)); daemon = descriptors[0];
  assert.equal(new Set(descriptors.map(value => value.pid)).size, 1);
  assert.equal(JSON.parse(await fs.readFile(path.join(stateDir, 'daemon.lock', 'owner.json'), 'utf8')).pid, daemon!.pid);
});

test('Effect-managed SIGTERM cleans ownership before exit', { skip: process.platform === 'win32' }, async t => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'factory-signal-'));
  const previous = process.env.FACTORY_STATE_DIR; process.env.FACTORY_STATE_DIR = stateDir;
  let daemon: Awaited<ReturnType<typeof ensureDaemon>> | undefined;
  t.after(async () => {
    if (daemon) await fetch(daemon.url + '/api/restart', { method: 'POST', headers: { 'X-Factory-Token': daemon.token }, signal: AbortSignal.timeout(1000) }).catch(() => {});
    if (previous === undefined) delete process.env.FACTORY_STATE_DIR; else process.env.FACTORY_STATE_DIR = previous;
    await fs.rm(stateDir, { recursive: true, force: true, maxRetries: 5 });
  });
  daemon = await ensureDaemon();
  assert.notEqual(daemon.pid, process.pid);
  process.kill(daemon.pid, 'SIGTERM');
  for (let i = 0; i < 100; i++) {
    if (!await fs.access(path.join(stateDir, 'daemon.lock')).then(() => true, () => false)) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(await fs.access(path.join(stateDir, 'daemon.json')).then(() => true, () => false), false);
  assert.equal(await fs.access(path.join(stateDir, 'daemon.lock')).then(() => true, () => false), false);
});

test('restart is authenticated and does not interrupt active jobs', async t => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'factory-restart-'));
  const runtime = new ObserverRuntime(stateDir); await runtime.init(); runtime.tick = async () => {};
  const app = await startServer(runtime);
  t.after(async () => { runtime.active.clear(); await app.close(); await fs.rm(stateDir, { recursive: true, force: true }); });
  const denied = await fetch(app.url + '/api/restart', { method: 'POST' });
  assert.equal(denied.status, 403);
  runtime.active.set('test', {} as any);
  const busy = await fetch(app.url + '/api/restart', { method: 'POST', headers: { 'X-Factory-Token': app.token } });
  assert.equal(busy.status, 409);
  assert.match((await busy.json() as { error: string }).error, /pause running jobs/);
  assert.equal(runtime.active.size, 1);
  const session = await fetch(app.url + '/api/session').then(r => r.json()) as { version: string };
  assert.equal(session.version, await sourceVersion());
});
