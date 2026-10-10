import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { workspace, newProject } from './workspace.ts';
import { Runtime } from './runtime.ts';
import { atomic, git } from './store.ts';
import { parseCommand } from './client.ts';

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'factory-workspace-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true, maxRetries: 5 }));
  const runtime = new Runtime(path.join(temp, 'state'));
  await runtime.init();
  return { temp, runtime };
}

test('workspace selection is read-only and lists direct child repositories', async t => {
  const { temp, runtime } = await fixture(t);
  const parent = path.join(temp, 'workspace'); await fs.mkdir(parent);
  const project = await newProject(parent, 'app');
  await fs.mkdir(path.join(parent, 'not-a-repo'));
  const selection = await runtime.command({ action: 'start', cwd: parent, description: 'Feature' }) as any;
  assert.equal(selection.needsSelection, true);
  assert.deepEqual(selection.choices, [{ label: 'app', cwd: project }]);
  assert.equal(runtime.store.projects.length, 0);
  assert.equal(await fs.access(path.join(parent, '.factory')).then(() => true, () => false), false);
});

test('new projects create an empty base commit and isolated queued jobs', async t => {
  const { temp, runtime } = await fixture(t);
  const job = await runtime.command({ action: 'new', cwd: temp, name: 'app', description: 'Build a website' }) as any;
  assert.equal(job.state, 'queued');
  assert.equal(job.targetBranch, 'main');
  assert.equal(await git(job.project, ['ls-tree', '--name-only', 'HEAD']), '');
  assert.equal(await git(job.project, ['rev-parse', 'HEAD']), job.baseSha);
  assert.equal(job.project, path.join(temp, 'app'));
  await assert.rejects(newProject(temp, 'app'), /EEXIST/);
  await assert.rejects(newProject(temp, '../escape'), /simple/);
});

test('drafts require no Git and can attach exactly once', async t => {
  const { temp, runtime } = await fixture(t);
  const draft = await runtime.command({ action: 'plan', cwd: temp, description: 'Explore search' }) as any;
  assert.equal((await runtime.store.list()).jobs.length, 0);
  assert.equal(await fs.access(path.join(temp, '.git')).then(() => true, () => false), false);
  await newProject(temp, 'app');
  const job = await runtime.command({ action: 'attach', cwd: temp, id: draft.id, repository: 'app' }) as any;
  assert.equal(job.request, 'Explore search');
  await assert.rejects(runtime.command({ action: 'attach', cwd: temp, id: draft.id, repository: 'app' }), /already attached/);
  await assert.rejects(runtime.command({ action: 'attach', cwd: temp, id: '../../secret', repository: 'app' }), /full draft ID/);
});

test('long draft attachment recovers without duplicating a persisted job', async t => {
  const { temp, runtime } = await fixture(t);
  const description = 'Detailed request. '.repeat(100);
  const draft = await runtime.command({ action: 'plan', cwd: temp, description }) as any;
  const project = await newProject(temp, 'app');
  await runtime.store.register(project);
  draft.attachmentProject = project;
  await atomic(path.join(runtime.store.stateDir, 'drafts', `${draft.id}.json`), draft);
  // Simulate interruption after job persistence but before the draft records completion.
  const first = await runtime.store.create(project, description.slice(0, 500), description, undefined, undefined, undefined, `draft-${draft.id}`);
  const recovered = await runtime.command({ action: 'attach', cwd: temp, id: draft.id, repository: 'app' }) as any;
  assert.equal(recovered.id, first.id);
  assert.equal(recovered.request, description);
  assert.equal((await runtime.store.list()).jobs.length, 1);
});

test('home parent repository does not capture project container', async t => {
  const directory = await fs.mkdtemp(path.join(os.homedir(), 'factory-workspace-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const homeResult = await workspace(os.homedir());
  assert.equal(homeResult.project, undefined);
  const result = await workspace(directory);
  assert.equal(result.needsSelection, true);
  assert.equal(result.project, undefined);
});

test('workspace commands parse and unborn targets have actionable errors', async t => {
  assert.deepEqual(parseCommand('new app Build search', '/tmp'), { cwd: '/tmp', action: 'new', name: 'app', description: 'Build search' });
  assert.equal(parseCommand('plan Explore search', '/tmp').action, 'plan');
  assert.equal(parseCommand('attach abc app', '/tmp').repository, 'app');
  const { temp, runtime } = await fixture(t);
  const project = await newProject(temp, 'app');
  await runtime.store.register(project);
  await runtime.store.configure(project, 'targetBranch', 'missing');
  await assert.rejects(runtime.command({ action: 'start', cwd: project, description: 'Feature' }), /no local commit/);
});
