import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { atomic, git, readJSON } from './store.ts';

export async function workspace(cwd: string) {
  const directory = await fs.realpath(cwd);
  const root = await git(directory, ['rev-parse', '--show-toplevel']).then(p => fs.realpath(p)).catch(() => '');
  // A home-directory repository must not capture unrelated projects beneath it.
  if (root && root !== await fs.realpath(os.homedir())) return { project: root };
  const choices: { label: string; cwd: string }[] = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const child = path.join(directory, entry.name);
    const childRoot = await git(child, ['rev-parse', '--show-toplevel']).then(p => fs.realpath(p)).catch(() => '');
    if (childRoot === child) choices.push({ label: entry.name, cwd: child });
  }
  return { needsSelection: true as const, workspace: directory, choices: choices.sort((a, b) => a.label.localeCompare(b.label)) };
}

export async function newProject(cwd: string, name: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(name)) throw new Error('Use a simple new directory name (letters, numbers, - or _)');
  const project = path.join(await fs.realpath(cwd), name);
  // Never initialize or commit existing user files.
  await fs.mkdir(project);
  await git(project, ['init', '-b', 'main']);
  await git(project, ['-c', 'user.name=Software Factory', '-c', 'user.email=factory@localhost', '-c', `core.hooksPath=${path.join(project, '.git', 'factory-no-hooks')}`, '-c', 'commit.gpgSign=false', 'commit', '--allow-empty', '-m', 'Initialize factory project']);
  return project;
}

export interface Draft { id: string; workspace: string; description: string; createdAt: string; attachedJob?: string; attachmentProject?: string }
export async function saveDraft(stateDir: string, cwd: string, description: string) {
  if (!description.trim() || description.length > 100_000) throw new Error('A non-empty planning request is required');
  const draft: Draft = { id: randomUUID(), workspace: await fs.realpath(cwd), description, createdAt: new Date().toISOString() };
  await atomic(path.join(stateDir, 'drafts', `${draft.id}.json`), draft);
  return { ...draft, activity: 'Draft saved without Git or worker execution. Attach it with /factory attach <id> <repository-path>.' };
}
export async function loadDraft(stateDir: string, id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('A full draft ID is required');
  const draft = await readJSON<Draft>(path.join(stateDir, 'drafts', `${id}.json`));
  if (draft.attachedJob) throw new Error(`Draft already attached to ${draft.attachedJob}`);
  return draft;
}
