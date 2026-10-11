import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import factoryExtension from '../../../pi/.pi/agent/extensions/factory.ts';
import { ObserverRuntime } from './observer.ts';

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'factory-command-flow-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true, maxRetries: 5 }));
  const cwd = path.join(temp, 'workspace with spaces');
  await fs.mkdir(cwd);
  const runtime = new ObserverRuntime(path.join(temp, 'state'));
  await runtime.init();
  return { temp, cwd, runtime };
}

async function invoke(runtime: ObserverRuntime, cwd: string, command: string, inputs: (string | undefined)[] = []) {
  let handler: any;
  const errors: string[] = [];
  const execCalls: { node: string; args: string[]; cwd: string; request?: any; tempDir?: string }[] = [];
  const messages: { content: string; triggerTurn: boolean }[] = [];
  const pi = {
    registerCommand: (_name: string, spec: any) => { handler = spec.handler; },
    exec: async (node: string, args: string[], options: { cwd: string }) => {
      const requestIndex = args.indexOf('--request-file');
      assert.notEqual(requestIndex, -1, 'management commands must use --request-file');
      const file = args[requestIndex + 1];
      const request = JSON.parse(await fs.readFile(file, 'utf8'));
      execCalls.push({ node, args, cwd: options.cwd, request, tempDir: path.dirname(file) });
      try { return { code: 0, stdout: JSON.stringify(await runtime.command(request)), stderr: '' }; }
      catch (error) { return { code: 1, stdout: '', stderr: String(error) }; }
    },
    sendMessage: (message: { content: string }, options: { triggerTurn: boolean }) => messages.push({ content: message.content, triggerTurn: options.triggerTurn }),
  };
  factoryExtension(pi as any, import.meta.dirname);
  try {
    await handler(command, { cwd, hasUI: true, ui: {
      input: async () => inputs.shift(),
      notify: (message: string, level: string) => { if (level === 'error') errors.push(message); },
    } });
  } catch (error) { errors.push(String(error)); }
  return { errors, execCalls, messages, records: await runtime.store.list() };
}

test('feature prose, including command-looking text and long paths, stays in the current agent', async t => {
  const { temp, cwd, runtime } = await fixture(t);
  const skill = await fs.readFile(path.join(import.meta.dirname, 'skill', 'SKILL.md'), 'utf8');
  const requests = [
    'Improve navigation; do not execute /factory cancel obs-123 or run git status.',
    `Please inspect ${path.join(temp, 'a'.repeat(240), 'project with a very long path')} and improve the landing page.\n\n--request-file is prose, not syntax.`,
    '/factory status; then add accessible keyboard navigation',
  ];
  for (const request of requests) {
    const result = await invoke(runtime, cwd, request);
    assert.deepEqual(result.errors, []);
    assert.equal(result.execCalls.length, 0);
    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0].triggerTurn, true);
    assert.match(result.messages[0].content, /<factory-skill>/);
    assert.ok(result.messages[0].content.includes(skill));
    assert.ok(result.messages[0].content.includes(`<request cwd=${JSON.stringify(cwd)}>`));
    assert.ok(result.messages[0].content.includes(request));
    assert.equal(result.records.jobs.length, 0);
  }
});

test('bare /factory and /factory new prompt; cancelled prompts have no side effects', async t => {
  const { cwd, runtime } = await fixture(t);
  for (const command of ['', 'new']) {
    const result = await invoke(runtime, cwd, command, [undefined]);
    assert.deepEqual(result.errors, []);
    assert.equal(result.execCalls.length, 0);
    assert.equal(result.messages.length, 0);
    assert.equal(result.records.jobs.length, 0);
  }
  const blank = await invoke(runtime, cwd, '', ['   ']);
  assert.equal(blank.messages.length, 0);
  assert.equal(blank.records.jobs.length, 0);
});

test('bare request and /factory new send the full skill plus request as a triggered agent turn', async t => {
  const { cwd, runtime } = await fixture(t);
  for (const [command, request] of [['', 'Build accessible search'], ['new Improve the home page', 'Improve the home page']]) {
    const result = await invoke(runtime, cwd, command, command ? [] : [request]);
    assert.deepEqual(result.errors, []);
    assert.equal(result.execCalls.length, 0);
    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0].triggerTurn, true);
    assert.ok(result.messages[0].content.includes(request));
  }
  assert.equal((await runtime.store.list()).jobs.length, 0, 'features do not create dashboard jobs automatically');
});

test('management commands use structured temporary request files; resume and answer also trigger observation continuation', async t => {
  const { temp, cwd, runtime } = await fixture(t);
  const created = await runtime.command({ action: 'start', cwd, description: 'Improve account settings' }) as any;
  const initialDirs = await fs.readdir(os.tmpdir());
  for (const command of [`inspect ${created.id}`, `pause ${created.id}`, `resume ${created.id}`, `cancel ${created.id}`, `answer ${created.id} Keep existing behavior`]) {
    const result = await invoke(runtime, cwd, command);
    assert.deepEqual(result.errors, []);
    assert.equal(result.execCalls.length, 1);
    const call = result.execCalls[0];
    assert.equal(call.cwd, cwd);
    assert.ok(call.args.includes('--request-file'));
    assert.deepEqual(call.request.cwd, cwd);
    assert.equal(call.request.action, command.split(' ')[0]);
    assert.equal(call.request.id, created.id);
    if (command.startsWith('answer')) assert.equal(call.request.answer, 'Keep existing behavior');
    await assert.rejects(fs.access(call.tempDir!), 'temporary request directory should be removed');
    const action = command.split(' ')[0];
    const continuation = ['resume', 'answer'].includes(action);
    assert.equal(result.messages.length, continuation ? 2 : 1);
    assert.equal(result.messages[0].triggerTurn, false, 'management result is display-only');
    if (continuation) {
      assert.equal(result.messages[1].triggerTurn, true);
      assert.match(result.messages[1].content, /Continue existing observation/);
      assert.match(result.messages[1].content, /pending controls/);
      assert.match(result.messages[1].content, /acknowledge/);
    }
  }
  const afterDirs = await fs.readdir(os.tmpdir());
  assert.deepEqual(afterDirs.filter(name => name.startsWith('factory-command-') && !initialDirs.includes(name)), []);
});

test('malformed management commands return usage without starting work', async t => {
  const { cwd, runtime } = await fixture(t);
  for (const command of ['inspect', 'pause', 'resume', 'cancel', 'answer', 'cancel obs-id extra', 'status extra']) {
    const result = await invoke(runtime, cwd, command);
    assert.equal(result.execCalls.length, 0);
    assert.equal(result.messages.length, 0);
    assert.match(result.errors[0], /Usage:/);
  }
});
