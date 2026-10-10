import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runAgent } from './agent.ts';

const exec = promisify(execFile);
test('all four worker adapters launch without shell interpolation and normalize evidence', async t => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'factory-adapter-'));
  t.after(async () => { await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5 }); });
  const mock = path.join(tmp, 'mock.mjs');
  await fs.writeFile(mock, `#!/usr/bin/env node
const args = process.argv.slice(2);
const report = {verdict:'pass',summary:JSON.stringify(args),findings:[]};
const text = JSON.stringify(report);
const emit = event => console.log(JSON.stringify(event));
if(args.includes('exec')) { emit({type:'item.completed',item:{type:'agent_message',text}}); emit({type:'turn.completed',usage:{input_tokens:10,output_tokens:5}}); }
else if(args[0] === 'run') { emit({type:'text',part:{text}}); emit({type:'step_finish',part:{cost:0.1}}); }
else if(args.includes('--output-format')) emit({type:'result',result:text,total_cost_usd:0.1});
else emit({type:'message_end',message:{role:'assistant',content:[{type:'text',text}],usage:{cost:{total:0.1}},stopReason:'end'}});
`, { mode: 0o755 });
  for (const runtime of ['pi', 'opencode', 'claude', 'codex'] as const) {
    const key = `FACTORY_${runtime.toUpperCase()}_BIN`;
    const previous = process.env[key]; process.env[key] = mock;
    try {
      const input = 'Inspect text; echo SHOULD_NOT_EXECUTE & quoted "value"';
      const result = await runAgent({ runtime, role: 'reviewer', cwd: tmp, outputDir: path.join(tmp, runtime), prompt: input, signal: new AbortController().signal, timeoutMs: 10_000 });
      assert.equal(result.report.verdict, 'pass'); assert.equal(result.costUSD, runtime === 'codex' ? 0 : 0.1);
      const args = JSON.parse(result.report.summary) as string[];
      assert.ok(args.some(arg => arg.includes(input)));
      assert.equal((await fs.readdir(path.join(tmp, runtime))).some(f => f.endsWith('.pid.json')), false);
      if (runtime === 'pi') assert.equal(args[args.indexOf('--tools') + 1].includes('bash'), false);
      if (runtime === 'claude') assert.equal(args[args.indexOf('--tools') + 1].includes('Bash'), false);
      if (runtime === 'opencode') assert.ok(args.includes('--pure'));
      if (runtime === 'codex') {
        assert.equal(args[args.indexOf('--sandbox') + 1], 'read-only');
        assert.ok(args.includes('--ephemeral')); assert.ok(args.includes('--output-schema'));
        assert.equal(args.includes('--dangerously-bypass-approvals-and-sandbox'), false);
      }
    } finally { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; }
  }
});
test('installation is repeatable and preserves existing resources', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'factory-install-'));
  t.after(async () => { await fs.rm(home, { recursive: true, force: true, maxRetries: 5 }); });
  const sentinel = path.join(home, '.agents', 'skills', 'keep-existing', 'SKILL.md');
  await fs.mkdir(path.dirname(sentinel), { recursive: true }); await fs.writeFile(sentinel, 'Leave existing skills untouched');
  const env = { ...process.env, FACTORY_INSTALL_HOME: home };
  const installer = path.join(import.meta.dirname, 'install.mjs');
  await exec(process.execPath, [installer], { env }); await exec(process.execPath, [installer], { env });
  assert.equal(await fs.realpath(path.join(home, '.agents', 'factory')), await fs.realpath(import.meta.dirname));
  assert.match(await fs.readFile(path.join(home, '.claude', 'commands', 'factory.md'), 'utf8'), /--caller.*claude/s);
  assert.match(await fs.readFile(path.join(home, '.config', 'opencode', 'commands', 'factory.md'), 'utf8'), /opencode/);
  assert.equal(await fs.readFile(sentinel, 'utf8'), 'Leave existing skills untouched');
  for (const root of ['.agents', '.claude']) {
    assert.equal(await fs.realpath(path.join(home, root, 'skills', 'factory')), await fs.realpath(path.join(import.meta.dirname, 'skill')));
  }
});
