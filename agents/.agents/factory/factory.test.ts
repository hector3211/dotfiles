import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Store, atomic, defaults, git, jobDir, validateConfig } from './store.ts';
import { Pipeline, hash, mergeAllowed, runCheck } from './pipeline.ts';
import { Runtime } from './runtime.ts';
import { startServer } from './server.ts';
import { parseReport, runAgent } from './agent.ts';
import { parseCommand } from './client.ts';
import { shellInvocation, resolveProgram } from './process.ts';
import type { AgentRunner, Job } from './types.ts';
const exec = promisify(execFile);

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'factory-test-'));
  const project = path.join(temp, 'repo'); await fs.mkdir(project);
  await exec('git', ['init', '-b', 'main'], { cwd: project });
  await git(project, ['config', 'user.name', 'Factory Test']); await git(project, ['config', 'user.email', 'test@example.invalid']);
  await git(project, ['config', 'core.hooksPath', path.join(temp, 'no-hooks')]);
  await fs.writeFile(path.join(project, 'README.md'), '# Test repository\n');
  await git(project, ['add', '.']); await git(project, ['commit', '-m', 'initial']);
  const store = new Store(path.join(temp, 'state')); await store.init(); await store.register(project);
  await store.configure(project, 'requiredChecks', [{ name: 'verification', command: 'node -e "process.exit(0)"' }]);
  t.after(async () => { await fs.rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); });
  return { temp, project, store };
}
const passing: AgentRunner = async input => {
  if (input.role === 'builder') await fs.writeFile(path.join(input.cwd, 'feature.txt'), 'Implemented\n');
  return { costUSD: 0.01, report: { verdict: 'pass', summary: 'Implemented and inspected', findings: [], ...(input.role === 'planner' ? { spec: '# Feature\n\n## Acceptance\n- Feature file exists.\n' } : {}) } };
};

test('default work policy is conservative and validates concurrency', () => {
  const c = defaults('main'); assert.equal(c.profile, 'work'); assert.equal(c.publishPullRequests, false);
  assert.throws(() => validateConfig({ ...c, maxActiveJobs: 100 }));
  assert.throws(() => validateConfig({ ...c, runtime: 't3' as never }));
});
test('command parsing preserves features, answers, and JSON policy', () => {
  assert.equal(parseCommand('Add dark mode', '/repo', 'claude').action, 'start');
  assert.deepEqual(parseCommand('answer abc Exclude emails', '/repo'), { cwd: '/repo', action: 'answer', id: 'abc', answer: 'Exclude emails' });
  assert.equal(parseCommand('config publish true', '/repo').value, true);
  assert.equal(parseCommand('Add export', '/repo', 't3').runtime, 'codex');
  assert.equal(parseCommand('Add export', '/repo', 't3', undefined, 'claude').runtime, 'claude');
  assert.equal(parseCommand('config runtime codex', '/repo').value, 'codex');
  assert.throws(() => parseCommand('Add export', '/repo', 't3', undefined, 'unsupported'), /Worker/);
  assert.deepEqual(parseCommand('config requiredChecks [{"name":"test","command":"node --test"}]', '/repo').value, [{ name: 'test', command: 'node --test' }]);
});
test('malformed agent verdicts fail closed', () => {
  assert.throws(() => parseReport('{"verdict":"pass","summary":"ok"}'));
  assert.throws(() => parseReport('{"verdict":"blocked","summary":"help","findings":[]}'));
  assert.deepEqual(parseReport('{"verdict":"pass","summary":"ok","findings":[{"severity":"info","explanation":"noted","location":null,"suggestedFix":null}],"spec":null,"checks":null,"decision":null}'), { verdict: 'pass', summary: 'ok', findings: [{ severity: 'info', explanation: 'noted' }] });
  assert.equal(parseReport('```json\n{"verdict":"pass","summary":"ok","findings":[]}\n```').verdict, 'pass');
});
test('platform shell selection and direct Linux invocation', async () => {
  assert.equal(shellInvocation('node --test', 'win32').args[3], 'node --test');
  assert.equal(shellInvocation('node --test', 'linux').command, '/bin/sh');
  assert.deepEqual(await resolveProgram('pi', ['prompt'], 'linux'), { command: 'pi', args: ['prompt'] });
});
test('registered jobs are ignored, durable, uniquely named and never tracked', async t => {
  const { store, project } = await fixture(t);
  const first = await store.create(project, 'Invoice export'); const second = await store.create(project, 'Invoice export');
  assert.notEqual(first.id, second.id); assert.equal((await store.list()).jobs.length, 2);
  assert.equal(await git(project, ['check-ignore', '.factory/jobs/test']), '.factory/jobs/test');
  assert.equal(await git(project, ['ls-files', '.factory']), '');
  assert.equal((await store.detail(first)).documents['decisions.md'], '# Decisions\n');
  await assert.rejects(store.resolve('invoice-export'), /Ambiguous/);
});
test('complete local flow creates isolated commit and SHA-bound evidence without publication', async t => {
  const { store, project } = await fixture(t);
  const job = await store.create(project, 'Implement feature'); const original = await git(project, ['rev-parse', 'HEAD']);
  const pipeline = new Pipeline(store, passing);
  await pipeline.work(job, new AbortController().signal);
  assert.equal(job.state, 'ready'); assert.equal(job.stage, 'deliver');
  assert.equal(await git(project, ['rev-parse', 'HEAD']), original);
  assert.notEqual(job.evidence?.sha, original); assert.equal(job.evidence?.checks[0].status, 'passed');
  assert.equal(await git(project, ['ls-files', '.factory']), '');
  assert.match(job.activity, /not authorized/);
  await fs.appendFile(path.join(job.worktree, 'feature.txt'), 'Changed after review');
  await assert.rejects(pipeline.validateEvidence(job), /stale/);
});
test('failed check triggers a different implementation round before readiness', async t => {
  const { store, project } = await fixture(t);
  await store.configure(project, 'requiredChecks', [{ name: 'feature exists', command: 'node -e "process.exit(require(\'fs\').existsSync(\'fixed.txt\')?0:1)"' }]);
  let builds = 0;
  const agent: AgentRunner = async input => {
    if (input.role === 'builder') {
      builds++; await fs.writeFile(path.join(input.cwd, 'feature.txt'), `Attempt ${builds}`);
      if (builds === 2) await fs.writeFile(path.join(input.cwd, 'fixed.txt'), 'Fixed');
    }
    return { costUSD: 0, report: { verdict: 'pass', summary: 'Inspected', findings: [], ...(input.role === 'planner' ? { spec: 'Implement a verified feature' } : {}) } };
  };
  const job = await store.create(project, 'Fix feature'); await new Pipeline(store, agent).work(job, new AbortController().signal);
  assert.equal(builds, 2); assert.equal(job.round, 2); assert.equal(job.state, 'ready');
});
test('work policy cannot merge even when GitHub reports eligible', async t => {
  const { store, project } = await fixture(t); const job = await store.create(project, 'Work feature');
  await new Pipeline(store, passing).work(job, new AbortController().signal);
  const calls: string[][] = [];
  job.pr = 'https://github.com/example/repo/pull/1';
  const pipeline = new Pipeline(store, passing, async (_cwd, args) => { calls.push(args); return JSON.stringify({ state: 'OPEN', headRefOid: job.evidence!.sha, baseRefName: 'main', statusCheckRollup: [], mergeStateStatus: 'CLEAN', isDraft: false, reviewDecision: 'APPROVED' }); });
  await pipeline.observe(job);
  assert.equal(calls.length, 1); assert.equal(calls[0][1], 'view');
  assert.equal(mergeAllowed('work', job.evidence!.sha, job), false);
  assert.equal(mergeAllowed('personal', job.evidence!.sha, job), true);
  assert.equal(mergeAllowed('personal', 'different', job), false);
});
test('personal mode merges only the reviewed SHA and current policy', async t => {
  const { store, project, temp } = await fixture(t);
  const remote = path.join(temp, 'remote.git'); await exec('git', ['init', '--bare', remote]);
  await git(project, ['remote', 'add', 'origin', remote]); await git(project, ['push', 'origin', 'main']);
  await store.configure(project, 'profile', 'personal');
  const job = await store.create(project, 'Personal feature'); await new Pipeline(store, passing).work(job, new AbortController().signal);
  job.pr = 'https://github.com/example/repo/pull/1'; const calls: string[][] = [];
  const pipeline = new Pipeline(store, passing, async (_cwd, args) => {
    calls.push(args); return args[1] === 'view' ? JSON.stringify({ state: 'OPEN', headRefOid: job.evidence!.sha, baseRefName: 'main', statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }], mergeStateStatus: 'CLEAN', isDraft: false, reviewDecision: 'APPROVED' }) : '';
  });
  await pipeline.observe(job);
  assert.equal(job.state, 'completed'); assert.deepEqual(calls[1].slice(-2), ['--match-head-commit', job.evidence!.sha]);
});
test('no required checks means unavailable, never verified', async t => {
  const { store, project } = await fixture(t); await store.configure(project, 'requiredChecks', []);
  const job = await store.create(project, 'No tests'); await new Pipeline(store, passing).work(job, new AbortController().signal);
  assert.equal(job.state, 'needs-human'); assert.match(job.decision!.blockedOn, /verification command/);
});
test('policy changes invalidate technical approval', async t => {
  const { store, project } = await fixture(t); const job = await store.create(project, 'Policy feature');
  const pipeline = new Pipeline(store, passing); await pipeline.work(job, new AbortController().signal);
  await store.configure(project, 'profile', 'personal'); await assert.rejects(pipeline.validateEvidence(job), /stale/);
});
test('interrupted work is preserved and recovered without declaring completion', async t => {
  const { store, project, temp } = await fixture(t); const job = await store.create(project, 'Interrupted feature');
  job.state = 'building'; await store.save(job);
  const runtime = new Runtime(path.join(temp, 'state'), passing); await runtime.init();
  assert.equal((await runtime.store.resolve(job.id)).state, 'interrupted'); await runtime.shutdown();
});
test('check failure and cancellation are explicit', async () => {
  const result = await runCheck(process.cwd(), 'node -e "process.exit(7)"', new AbortController().signal, 5000);
  assert.equal(result.exitCode, 7);
  const control = new AbortController(); control.abort();
  await assert.rejects(runCheck(process.cwd(), 'node -e "0"', control.signal, 5000), /interrupted/);
});
test('HTTP serves dashboard, guards actions and rejects cross-site requests', async t => {
  const { temp } = await fixture(t);
  const runtime = new Runtime(path.join(temp, 'empty-state'), passing); await runtime.init();
  const app = await startServer(runtime); t.after(() => app.close());
  assert.equal((await fetch(app.url)).status, 200);
  assert.match(await (await fetch(app.url)).text(), /Operations board/);
  assert.equal((await fetch(app.url + '/api/jobs', { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await fetch(app.url + '/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"action":"pause","id":"x"}' })).status, 403);
  assert.equal((await fetch(app.url + '/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Factory-Token': app.token }, body: '{"action":"merge","id":"x"}' })).status, 400);
  assert.equal((await fetch(app.url + '/api/jobs')).status, 200);
});
test('artifact traversal is rejected', async t => {
  const { store, project } = await fixture(t); const job = await store.create(project, 'Artifact feature');
  await assert.rejects(store.artifact(job, '../../.git/config'), /not available/);
});
