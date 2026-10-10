#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { callFactory, ensureDaemon, help, parseCommand } from './client.ts';

export function openBrowser(url: string) {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.on('error', () => {}); child.unref();
}
const words = process.argv.slice(2);
let caller: string | undefined; let model: string | undefined; let worker: string | undefined; let cwd = process.cwd();
for (const option of ['--caller', '--worker', '--model', '--cwd']) {
  const index = words.indexOf(option);
  if (index !== -1) {
    const value = words[index + 1]; if (!value) throw new Error(`${option} requires a value`);
    if (option === '--caller') caller = value; else if (option === '--worker') worker = value; else if (option === '--model') model = value; else cwd = value;
    words.splice(index, 2);
  }
}
try {
  const args = parseCommand(words.join(' '), path.resolve(cwd), caller, model, worker);
  if (args.action === 'help') console.log(help);
  else if (args.action === 'dashboard') { const d = await ensureDaemon(); openBrowser(d.url); console.log(d.url); }
  else {
    const result = await callFactory(args);
    console.log(JSON.stringify(result, null, 2));
    if (['start', 'issue', 'new', 'attach'].includes(String(args.action)) && !(result as { needsSelection?: boolean }).needsSelection) { const d = await ensureDaemon(); console.log(`\nDashboard: ${d.url}`); openBrowser(d.url); }
  }
} catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
