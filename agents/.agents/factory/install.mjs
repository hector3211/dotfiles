#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = path.dirname(fileURLToPath(import.meta.url));
const home = process.env.FACTORY_INSTALL_HOME || os.homedir();
if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Factory requires Node.js 24 or newer (native TypeScript support).');
async function link(from, to, directory = false) {
  await fs.mkdir(path.dirname(to), { recursive: true });
  try {
    const stat = await fs.lstat(to);
    if (await fs.realpath(to) === await fs.realpath(from)) { console.log(`Already linked: ${to}`); return; }
    if (!directory && stat.isFile() && (await fs.readFile(to)).equals(await fs.readFile(from))) { console.log(`Already installed: ${to}`); return; }
    throw new Error(`Refusing to replace existing path: ${to}`);
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (process.platform === 'win32' && !directory) {
    // Windows file symlinks may need admin/developer mode. Tiny adapter copies are regenerated on install.
    await fs.copyFile(from, to, fs.constants.COPYFILE_EXCL);
    console.log(`Installed adapter: ${to}`);
  } else { await fs.symlink(from, to, process.platform === 'win32' ? 'junction' : directory ? 'dir' : 'file'); console.log(`Linked: ${to}`); }
}
await link(source, path.join(home, '.agents', 'factory'), true);
// T3's Codex provider discovers ~/.agents/skills; its Claude provider uses ~/.claude/skills.
await link(path.join(source, 'skill'), path.join(home, '.agents', 'skills', 'factory'), true);
await link(path.join(source, 'skill'), path.join(home, '.claude', 'skills', 'factory'), true);
const dotfiles = path.resolve(source, '../../..');
await link(path.join(dotfiles, 'pi', '.pi', 'agent', 'extensions', 'factory.ts'), path.join(home, '.pi', 'agent', 'extensions', 'factory.ts'));
await link(path.join(dotfiles, 'claude', '.claude', 'commands', 'factory.md'), path.join(home, '.claude', 'commands', 'factory.md'));
await link(path.join(dotfiles, 'opencode', '.config', 'opencode', 'commands', 'factory.md'), path.join(home, '.config', 'opencode', 'commands', 'factory.md'));
const bin = path.join(home, '.local', 'bin'); await fs.mkdir(bin, { recursive: true });
const launcher = process.platform === 'win32' ? 'factory.cmd' : 'factory';
const content = process.platform === 'win32' ? '@echo off\r\nnode "%USERPROFILE%\\.agents\\factory\\cli.ts" %*\r\n' : '#!/bin/sh\nexec node "$HOME/.agents/factory/cli.ts" "$@"\n';
const target = path.join(bin, launcher);
try { await fs.writeFile(target, content, { flag: 'wx', mode: 0o755 }); }
catch (e) { if (e.code !== 'EEXIST') throw e; if (await fs.readFile(target, 'utf8') !== content) throw new Error(`Refusing to overwrite ${target}`); }
console.log(`Factory installed. Reload your agent client, then /factory help. Optional terminal command: ${target}`);
console.log('Existing skills were not changed. No projects were registered and no agents were started.');
