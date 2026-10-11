import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ObserverRuntime } from './observer.ts';
import { startServer } from './server.ts';

// Optional browser verification. No Playwright dependency is added to the factory.
// Set FACTORY_PLAYWRIGHT_MODULE to an installed Playwright entry point to opt in.
test('dashboard: observer reports, pending controls, answer preservation and mobile layout', { skip: !process.env.FACTORY_PLAYWRIGHT_MODULE }, async t => {
  const { chromium } = await import(process.env.FACTORY_PLAYWRIGHT_MODULE);
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'factory-observer-browser-'));
  const project = path.join(tmp, 'workspace with spaces');
  await fs.mkdir(project);
  const runtime = new ObserverRuntime(path.join(tmp, 'state'));
  await runtime.init();
  const app = await startServer(runtime);
  const browser = await chromium.launch({ headless: true, ...(process.env.FACTORY_CHROMIUM ? { executablePath: process.env.FACTORY_CHROMIUM } : {}) });
  t.after(async () => { await browser.close(); await app.close(); await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5 }); });

  const ready = await runtime.command({ action: 'start', cwd: project, description: 'Invoice export' });
  const building = await runtime.command({ action: 'start', cwd: project, description: 'Dark mode' });
  const needs = await runtime.command({ action: 'start', cwd: project, description: 'Billing choice' });
  await runtime.command({ action: 'report', id: ready.id, state: 'ready', stage: 'deliver', activity: 'Ready for human review', pr: 'https://github.com/example/repo/pull/1' });
  await runtime.command({ action: 'report', id: building.id, state: 'building', stage: 'build', activity: 'Implementing' });
  await runtime.command({ action: 'report', id: needs.id, state: 'needs-human', stage: 'build', activity: 'Waiting for a retention choice', decision: {
    blockedOn: 'Unresolved retention choice', alreadyTried: ['Read repository policy', 'Considered both alternatives'], recommendation: 'Keep records', needFromYou: 'Choose retention',
  } });

  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(app.url);
  await page.getByRole('button', { name: 'Invoice export', exact: true }).waitFor();
  assert.equal(await page.locator('#empty').isVisible(), false);

  await page.getByRole('button', { name: 'Invoice export', exact: true }).click();
  await page.getByRole('heading', { name: 'Invoice export', exact: true }).waitFor();
  assert.equal(await page.getByRole('dialog').getByRole('button', { name: /merge/i }).count(), 0);
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').isVisible(), false);

  await page.getByRole('button', { name: 'Dark mode', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Request pause', exact: true }).click();
  await dialog.getByText('Waiting for agent checkpoint').waitFor();
  assert.equal((await runtime.store.resolve(building.id)).state, 'building', 'a request does not change agent-reported state');
  let detail = await runtime.store.detail(await runtime.store.resolve(building.id));
  assert.equal(detail.pendingControls.length, 1);
  assert.equal(detail.pendingControls[0].action, 'pause');
  await runtime.command({ action: 'ack', id: building.id, controlId: detail.pendingControls[0].id, state: 'paused', activity: 'Paused at a safe checkpoint' });
  await page.getByText('Paused', { exact: true }).waitFor();
  await page.keyboard.press('Escape');

  const answer = page.getByRole('textbox', { name: 'Your answer for Billing choice' });
  await answer.fill('Keep records');
  runtime.onChange();
  await page.waitForFunction(() => document.querySelector('[aria-label="Your answer for Billing choice"]')?.value === 'Keep records');
  assert.equal(await answer.inputValue(), 'Keep records', 'live report refresh preserves an in-progress answer');
  await page.getByRole('button', { name: 'Send answer', exact: true }).click();
  await page.getByRole('button', { name: 'Billing choice', exact: true }).click();
  await page.getByRole('dialog').getByText('answer request', { exact: true }).waitFor();
  assert.equal((await runtime.store.resolve(needs.id)).state, 'needs-human', 'answer remains pending until agent acknowledgement');
  detail = await runtime.store.detail(await runtime.store.resolve(needs.id));
  assert.equal(detail.pendingControls.length, 1);
  assert.equal(detail.pendingControls[0].action, 'answer');
  assert.equal(detail.pendingControls[0].answer, 'Keep records');
  await runtime.command({ action: 'ack', id: needs.id, controlId: detail.pendingControls[0].id, state: 'needs-human', activity: 'Answer received; continuing' });
  assert.equal((await runtime.store.resolve(needs.id)).state, 'needs-human');
  assert.equal((await runtime.store.detail(await runtime.store.resolve(needs.id))).pendingControls.length, 0);

  await page.setViewportSize({ width: 375, height: 812 });
  const layout = await page.evaluate(() => ({ ok: document.documentElement.scrollWidth <= window.innerWidth,
    overflow: [...document.querySelectorAll('body *')].filter(element => element.getBoundingClientRect().right > window.innerWidth + 1).map(element => ({ tag: element.tagName, class: element.className, width: element.getBoundingClientRect().width })).slice(0, 15) }));
  assert.equal(layout.ok, true, JSON.stringify(layout.overflow));
  assert.deepEqual(errors, []);
  if (process.env.FACTORY_SCREENSHOT_PATH) await page.screenshot({ path: process.env.FACTORY_SCREENSHOT_PATH, fullPage: true });
});
