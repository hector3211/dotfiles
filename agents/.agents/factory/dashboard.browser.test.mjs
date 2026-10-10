import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Runtime } from './runtime.ts';
import { startServer } from './server.ts';
import { git } from './store.ts';

// Optional browser verification. Runtime and installation have no Playwright dependency.
// FACTORY_PLAYWRIGHT_MODULE must point to playwright's index.mjs when not installed nearby.
test('dashboard: inspect, pause, answer, live-update preservation and mobile layout', { skip: !process.env.FACTORY_PLAYWRIGHT_MODULE }, async t => {
  const { chromium } = await import(process.env.FACTORY_PLAYWRIGHT_MODULE);
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'factory-browser-'));
  const project = path.join(tmp, 'repo'); await fs.mkdir(project);
  const exec = promisify(execFile);
  await exec('git', ['init', '-b', 'main'], { cwd: project });
  await git(project, ['config', 'user.name', 'Browser Test']); await git(project, ['config', 'user.email', 'test@example.invalid']);
  await fs.writeFile(path.join(project, 'README.md'), 'Fixture'); await git(project, ['add', '.']); await git(project, ['commit', '-m', 'fixture']);
  const runtime = new Runtime(path.join(tmp, 'state')); await runtime.init(); await runtime.store.register(project);
  runtime.tick = async () => {}; // Exercise UI/state actions, never start paid workers in a browser test.
  const ready = await runtime.store.create(project, 'Invoice export'); ready.state = 'ready'; ready.stage = 'deliver'; ready.pr = 'https://github.com/example/repo/pull/1'; ready.activity = 'Ready for human merge'; await runtime.store.save(ready);
  const building = await runtime.store.create(project, 'Dark mode'); building.state = 'building'; building.activity = 'Implementing'; await runtime.store.save(building);
  const needs = await runtime.store.create(project, 'Billing choice'); needs.state = 'needs-human'; needs.decision = { blockedOn: 'Unresolved retention choice', alreadyTried: ['Read repository policy', 'Considered both alternatives'], recommendation: 'Keep records', needFromYou: 'Choose retention' }; await runtime.store.save(needs);
  const app = await startServer(runtime);
  const browser = await chromium.launch({ headless: true, ...(process.env.FACTORY_CHROMIUM ? { executablePath: process.env.FACTORY_CHROMIUM } : {}) });
  t.after(async () => { await browser.close(); await app.close(); await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5 }); });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(app.url);
  await page.getByRole('button', { name: 'Invoice export', exact: true }).waitFor();
  assert.equal(await page.locator('#empty').isVisible(), false);
  await page.getByRole('button', { name: 'Invoice export', exact: true }).click();
  await page.getByRole('heading', { name: 'Invoice export', exact: true }).waitFor();
  assert.equal(await page.getByRole('dialog').getByRole('button', { name: /merge/i }).count(), 0);
  await page.keyboard.press('Escape'); assert.equal(await page.getByRole('dialog').isVisible(), false);
  await page.getByRole('button', { name: 'Dark mode', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Resume', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  const answer = page.getByRole('textbox', { name: 'Your answer for Billing choice' });
  await answer.fill('Keep records');
  const change = page.waitForResponse(r => r.url().endsWith('/api/jobs'));
  runtime.onChange(); await change;
  assert.equal(await answer.inputValue(), 'Keep records');
  await page.getByRole('button', { name: 'Send answer', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('needs').hidden);
  assert.equal((await runtime.store.resolve(needs.id)).state, 'queued');
  await page.setViewportSize({ width: 375, height: 812 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  assert.deepEqual(errors, []);
  if (process.env.FACTORY_SCREENSHOT_PATH) await page.screenshot({ path: process.env.FACTORY_SCREENSHOT_PATH, fullPage: true });
});
