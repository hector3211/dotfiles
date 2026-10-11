import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ObserverRuntime, type Observation } from './observer.ts';
import { atomic, defaults } from './store.ts';
import { startServer } from './server.ts';
const exec = promisify(execFile);

async function fixture(t: { after: (fn: () => Promise<void>) => void }, staleAfterMs?: number) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'factory-observer-'));
  const workspace = path.join(temp, 'workspace'); await fs.mkdir(workspace);
  const runtime = new ObserverRuntime(path.join(temp, 'state'), staleAfterMs); await runtime.init();
  t.after(() => fs.rm(temp, { recursive: true, force: true, maxRetries: 5 }));
  const job = await runtime.command({ action: 'start', cwd: workspace, description: 'Improve home-page navigation', runtime: 'pi' }) as Observation;
  return { temp, workspace, runtime, job };
}

test('start records work in any directory without Git, workers or project mutations', async t => {
  const { workspace, runtime, job } = await fixture(t);
  assert.equal(job.state, 'queued'); assert.equal(job.executionMode, 'agent');
  assert.deepEqual(await fs.readdir(workspace), []);
  for (let i = 0; i < 3; i++) await runtime.tick();
  assert.equal((await runtime.store.raw(job.id)).state, 'queued');
  assert.equal(runtime.active.size, 0);
  const reloaded = new ObserverRuntime(runtime.store.stateDir); await reloaded.init();
  assert.equal((await reloaded.store.resolve(job.id)).request, job.request);
});

test('progress, documents and supporting artifacts are durable and explicit', async t => {
  const { runtime, job } = await fixture(t);
  await runtime.command({ action: 'report', id: job.id, state: 'building', stage: 'build', activity: 'Implementing navigation', worktree: '/explicit/worktree' });
  await runtime.command({ action: 'document', id: job.id, name: 'spec.md', content: '# Navigation\n- Keyboard accessible' });
  await runtime.command({ action: 'artifact', id: job.id, name: 'tests.log', content: 'npm test: 4 passed' });
  const detail = await runtime.command({ action: 'inspect', id: job.id }) as any;
  assert.equal(detail.job.stage, 'build'); assert.match(detail.documents['spec.md'], /Keyboard/);
  assert.deepEqual(detail.artifacts, ['artifacts/tests.log']);
  assert.equal(await runtime.store.artifact(detail.job, 'artifacts/tests.log'), 'npm test: 4 passed');
  assert.ok(detail.events.some((event: any) => event.type === 'agent-report'));
  const evidence = await runtime.command({ action: 'report', id: job.id, checks: [{ name: 'tests', command: 'npm test', status: 'passed', exitCode: 0, artifact: 'artifacts/tests.log' }], review: { verdict: 'pass', summary: 'Independent review completed', findings: [] } }) as Observation;
  assert.equal(evidence.reportedChecks?.[0].status, 'passed');
  assert.equal(evidence.reportedReview?.verdict, 'pass');
  assert.equal(evidence.evidence, undefined, 'agent reports do not become server-certified evidence');
  await assert.rejects(runtime.command({ action: 'report', id: job.id, stage: 'unknown' }), /Invalid Factory report/);
  await assert.rejects(runtime.command({ action: 'artifact', id: job.id, name: '../../outside.log', content: 'bad' }), /simple/);
  await assert.rejects(runtime.store.artifact(detail.job, '../../outside.log'), /not available/);
});

test('pause, resume and cancel remain requests until an agent acknowledges', async t => {
  const { runtime, job } = await fixture(t);
  await runtime.command({ action: 'report', id: job.id, state: 'building', stage: 'build', activity: 'Working' });
  const paused = await runtime.command({ action: 'pause', id: job.id }) as any;
  assert.equal(paused.job.state, 'building'); assert.equal(paused.pendingControls.length, 1);
  await runtime.command({ action: 'pause', id: job.id }); // repeat clicks are idempotent
  const checkpoint = await runtime.command({ action: 'checkpoint', id: job.id }) as any;
  assert.equal(checkpoint.pendingControls.length, 1);
  await assert.rejects(runtime.command({ action: 'ack', id: job.id, controlId: checkpoint.pendingControls[0].id, state: 'building' }), /stopping safely/);
  await runtime.command({ action: 'ack', id: job.id, controlId: checkpoint.pendingControls[0].id, state: 'paused' });
  assert.equal((await runtime.store.raw(job.id)).state, 'paused');
  const resumed = await runtime.command({ action: 'resume', id: job.id }) as any;
  assert.equal(resumed.job.state, 'paused'); assert.equal(runtime.active.size, 0);
  const cancelled = await runtime.command({ action: 'cancel', id: job.id }) as any;
  const cancel = cancelled.pendingControls.find((control: any) => control.action === 'cancel');
  await runtime.command({ action: 'ack', id: job.id, controlId: cancel.id });
  assert.equal((await runtime.store.raw(job.id)).state, 'cancelled');
  assert.equal((await runtime.command({ action: 'inspect', id: job.id }) as any).pendingControls.length, 0);
  await assert.rejects(runtime.command({ action: 'ack', id: job.id, controlId: resumed.pendingControls[0].id }), /finished/);
});

test('answers are preserved and blockers remain until the agent actually responds', async t => {
  const { runtime, job } = await fixture(t);
  await runtime.command({ action: 'report', id: job.id, state: 'needs-human', activity: 'Choose retention', decision: { blockedOn: 'Retention unclear', alreadyTried: ['Read policy'], recommendation: 'Keep records', needFromYou: 'Choose retention' } });
  const response = await runtime.command({ action: 'answer', id: job.id, answer: 'Keep records\n\nFor 30 days.' }) as any;
  assert.equal(response.job.state, 'needs-human');
  await runtime.command({ action: 'ack', id: job.id, controlId: response.pendingControls[0].id, state: 'building' });
  const detail = await runtime.command({ action: 'inspect', id: job.id }) as any;
  assert.match(detail.documents['decisions.md'], /Keep records\n\nFor 30 days\./);
});

test('inactivity is derived from agent reports, not server ticks or human controls', async t => {
  const { runtime, job } = await fixture(t, 1000);
  job.state = 'building'; job.heartbeatAt = new Date(Date.now() - 10_000).toISOString();
  await atomic(path.join(runtime.store.directory(job.id), 'job.json'), job);
  const pending = await runtime.command({ action: 'pause', id: job.id }) as any;
  assert.equal(pending.job.state, 'interrupted'); assert.equal(pending.job.reportedState, 'building');
  await runtime.tick();
  assert.equal((await runtime.store.raw(job.id)).state, 'building');
  const checkpoint = await runtime.command({ action: 'checkpoint', id: job.id }) as any;
  assert.equal(checkpoint.job.state, 'building'); assert.equal(checkpoint.pendingControls.length, 1);
});

test('legacy records stay read-only and are never resumed or claimed active', async t => {
  const { runtime, workspace, job } = await fixture(t);
  const legacy = { ...job, id: 'old-job', project: workspace, config: defaults('main'), state: 'building' };
  delete (legacy as any).executionMode;
  const record = path.join(workspace, '.factory', 'jobs', legacy.id, 'job.json'); await atomic(record, legacy);
  await atomic(path.join(runtime.store.stateDir, 'projects.json'), [workspace]);
  const loaded = new ObserverRuntime(runtime.store.stateDir); await loaded.init();
  const view = await loaded.store.resolve(legacy.id);
  assert.equal(view.executionMode, 'legacy'); assert.equal(view.state, 'interrupted');
  await assert.rejects(loaded.command({ action: 'resume', id: legacy.id }), /read-only/);
  assert.equal(JSON.parse(await fs.readFile(record, 'utf8')).state, 'building');
});

test('symlinked documents, events, artifacts and record directories never expose or overwrite outside files', { skip: process.platform === 'win32' }, async t => {
  const { temp, workspace, runtime, job } = await fixture(t);
  const secret = path.join(temp, 'secret.txt'); await fs.writeFile(secret, 'PRIVATE');
  const spec = path.join(runtime.store.directory(job.id), 'spec.md'); await fs.rm(spec); await fs.symlink(secret, spec);
  await assert.rejects(runtime.command({ action: 'inspect', id: job.id }), /Symlinked/);
  await assert.rejects(runtime.command({ action: 'document', id: job.id, name: 'spec.md', content: 'replacement' }), /Symlinked/);
  assert.equal(await fs.readFile(secret, 'utf8'), 'PRIVATE');
  await fs.rm(spec); await fs.writeFile(spec, 'safe');
  const legacy = { ...job, id: 'legacy-symlink', project: workspace }; delete (legacy as any).executionMode;
  await atomic(path.join(workspace, '.factory', 'jobs', legacy.id, 'job.json'), legacy);
  await fs.symlink(secret, path.join(workspace, '.factory', 'jobs', legacy.id, 'spec.md'));
  await atomic(path.join(runtime.store.stateDir, 'projects.json'), [workspace]);
  const reloaded = new ObserverRuntime(runtime.store.stateDir); await reloaded.init();
  await assert.rejects(reloaded.command({ action: 'inspect', id: legacy.id }), /Symlinked/);
  const eventFile = path.join(runtime.store.directory(job.id), 'events.jsonl'); await fs.rm(eventFile); await fs.symlink(secret, eventFile);
  await assert.rejects(runtime.command({ action: 'checkpoint', id: job.id }), /Symlinked/);
  assert.equal(await fs.readFile(secret, 'utf8'), 'PRIVATE');
});

test('FIFO records fail promptly instead of blocking reads and shutdown', { skip: process.platform === 'win32' }, async t => {
  const { runtime, job } = await fixture(t);
  const spec = path.join(runtime.store.directory(job.id), 'spec.md');
  await fs.rm(spec); await exec('mkfifo', [spec]);
  await assert.rejects(runtime.command({ action: 'inspect', id: job.id }), /bounded regular file/);
});

test('HTTP guards and actual CLI reporting preserve large Unicode requests', async t => {
  const { temp, runtime, workspace } = await fixture(t);
  const app = await startServer(runtime); t.after(app.close);
  await atomic(path.join(runtime.store.stateDir, 'daemon.json'), { pid: process.pid, url: app.url, token: app.token });
  const denied = await fetch(app.url + '/api/command', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(denied.status, 403);
  const origin = await fetch(app.url + '/api/jobs', { headers: { Origin: 'https://outside.invalid' } }); assert.equal(origin.status, 403);
  const description = '🚀 Navigation\n\t'.repeat(5000); // exceeds Windows argv limits; temp-file transport does not
  const file = path.join(temp, 'request.json'); await atomic(file, { action: 'start', cwd: workspace, description });
  const result = await exec(process.execPath, [path.join(import.meta.dirname, 'cli.ts'), '--request-file', file], { env: { ...process.env, FACTORY_STATE_DIR: runtime.store.stateDir, FACTORY_OPEN_BROWSER: '0' }, maxBuffer: 2_000_000 });
  const created = JSON.parse(result.stdout);
  assert.equal(created.request, description); assert.equal(created.dashboardUrl, app.url);
  assert.equal(created.executionMode, 'agent'); assert.equal(runtime.active.size, 0);
  for (const invalid of [{ action: 'start', description: 'Work', cwd: null }, { action: 'start', description: 'Work' }]) {
    await atomic(file, invalid);
    await assert.rejects(exec(process.execPath, [path.join(import.meta.dirname, 'cli.ts'), '--request-file', file], { env: { ...process.env, FACTORY_STATE_DIR: runtime.store.stateDir, FACTORY_OPEN_BROWSER: '0' } }), /cwd/);
  }
  assert.equal((await runtime.store.list()).jobs.length, 2);
  assert.deepEqual(await fs.readdir(workspace), []);
  const dashboard = await fetch(app.url); assert.equal(dashboard.status, 200); assert.match(dashboard.headers.get('content-security-policy')!, /frame-ancestors 'none'/);
});
