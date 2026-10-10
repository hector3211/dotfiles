import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Config, Event, Job, JobDetail, Snapshot } from './types.ts';

const exec = promisify(execFile);
export async function git(cwd: string, args: string[]): Promise<string> {
  return (await exec('git', args, { cwd, maxBuffer: 8 * 1024 * 1024 })).stdout.trim();
}
export async function atomic(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${randomUUID()}.tmp`;
  const handle = await fs.open(temp, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(value, null, 2) + '\n'); await handle.sync(); }
  finally { await handle.close(); }
  await fs.rename(temp, file);
}
export async function exists(file: string) { try { await fs.access(file); return true; } catch { return false; } }
export async function readJSON<T>(file: string): Promise<T> { return JSON.parse(await fs.readFile(file, 'utf8')); }
export function defaults(targetBranch: string): Config {
  return { profile: 'work', publishPullRequests: false, targetBranch, maxActiveJobs: 2, maxRounds: 6,
    budgetMinutes: 120, workerTimeoutMinutes: 20, maxCostUSD: 15, requiredChecks: [] };
}
export function validateConfig(value: Config): Config {
  if (!value || (value.runtime !== undefined && !['pi', 'opencode', 'claude', 'codex'].includes(value.runtime)) || !['work', 'personal'].includes(value.profile) || typeof value.publishPullRequests !== 'boolean' ||
      typeof value.targetBranch !== 'string' || !value.targetBranch || value.targetBranch.startsWith('-')) throw new Error('Invalid project policy');
  for (const key of ['maxActiveJobs', 'maxRounds', 'budgetMinutes', 'workerTimeoutMinutes', 'maxCostUSD'] as const) {
    if (!Number.isFinite(value[key]) || value[key] <= 0) throw new Error(`Invalid ${key}`);
  }
  if (!Number.isInteger(value.maxActiveJobs) || value.maxActiveJobs > 8 || !Number.isInteger(value.maxRounds)) throw new Error('Concurrency must be 1–8; rounds must be an integer');
  if (!Array.isArray(value.requiredChecks) || value.requiredChecks.some(c => !c || typeof c.name !== 'string' || !c.name || typeof c.command !== 'string' || !c.command)) throw new Error('Invalid required checks');
  if (value.model !== undefined && typeof value.model !== 'string') throw new Error('Invalid model');
  return value;
}
export function jobDir(job: Job) { return path.join(job.project, '.factory', 'jobs', job.id); }
export function roundDir(job: Job) { return path.join(jobDir(job), 'rounds', String(job.round).padStart(3, '0')); }

export class Store {
  projects: string[] = [];
  readonly errors: string[] = [];
  readonly stateDir: string;
  constructor(stateDir: string) { this.stateDir = stateDir; }
  async init() {
    await fs.mkdir(this.stateDir, { recursive: true, mode: 0o700 });
    if (await exists(path.join(this.stateDir, 'projects.json'))) this.projects = await readJSON(path.join(this.stateDir, 'projects.json'));
  }
  async register(cwd: string): Promise<string> {
    const root = await fs.realpath(await git(cwd, ['rev-parse', '--show-toplevel']));
    if (await exists(path.join(root, '.factory', 'worktree-marker'))) throw new Error('Start factory commands in the main checkout, not a job worktree');
    // Refuse tracked factory content; ignoring does not untrack it.
    if (await git(root, ['ls-files', '.factory'])) throw new Error('.factory contains tracked files. Untrack them before starting the factory.');
    const ignore = path.join(root, '.gitignore');
    const content = await fs.readFile(ignore, 'utf8').catch(() => '');
    if (!content.split(/\r?\n/).some(line => line.trim() === '.factory/' || line.trim() === '/.factory/')) {
      await fs.appendFile(ignore, `${content && !content.endsWith('\n') ? '\n' : ''}\n# Local software factory jobs and worktrees\n.factory/\n`);
    }
    await fs.mkdir(path.join(root, '.factory', 'jobs'), { recursive: true, mode: 0o700 });
    const configFile = path.join(root, '.factory', 'config.json');
    if (!await exists(configFile)) {
      let target = await git(root, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']).catch(() => '');
      target = target.replace(/^origin\//, '') || await git(root, ['branch', '--show-current']);
      if (!target) throw new Error('A named target branch is required');
      const config = defaults(target);
      // Only standard test/lint/typecheck scripts; do not run lifecycle build/deploy scripts automatically.
      const pkg = await readJSON<{ scripts?: Record<string, string>; packageManager?: string }>(path.join(root, 'package.json')).catch(() => null);
      if (pkg?.scripts) {
        const runner = await exists(path.join(root, 'pnpm-lock.yaml')) ? 'pnpm' : await exists(path.join(root, 'yarn.lock')) ? 'yarn' : await exists(path.join(root, 'bun.lock')) || await exists(path.join(root, 'bun.lockb')) ? 'bun' : 'npm';
        for (const name of ['test', 'lint', 'typecheck']) if (pkg.scripts[name]) config.requiredChecks.push({ name, command: `${runner} run ${name}` });
      }
      await atomic(configFile, config);
    }
    if (!this.projects.includes(root)) {
      this.projects.push(root);
      await atomic(path.join(this.stateDir, 'projects.json'), this.projects);
    }
    return root;
  }
  async config(project: string) { return validateConfig(await readJSON<Config>(path.join(project, '.factory', 'config.json'))); }
  async configure(project: string, key: string, value: unknown) {
    const allowed = ['runtime', 'profile', 'publishPullRequests', 'targetBranch', 'maxActiveJobs', 'maxRounds', 'budgetMinutes', 'workerTimeoutMinutes', 'maxCostUSD', 'model', 'requiredChecks'];
    if (!allowed.includes(key)) throw new Error(`Unknown policy field: ${key}`);
    const previous = await this.config(project);
    const config = validateConfig({ ...previous, [key]: value });
    if (key === 'runtime' && value !== previous.runtime) delete config.model;
    await atomic(path.join(project, '.factory', 'config.json'), config);
    return config;
  }
  async list(): Promise<Snapshot> {
    const jobs: Job[] = []; const errors: string[] = [];
    for (const project of this.projects) {
      try {
        const entries = await fs.readdir(path.join(project, '.factory', 'jobs'));
        for (const id of entries.filter(id => /^[a-zA-Z0-9_-]+$/.test(id))) {
          try { const job = await readJSON<Job>(path.join(project, '.factory', 'jobs', id, 'job.json'));
            if (job.id !== id || job.project !== project) throw new Error('Job identity mismatch');
            jobs.push(job);
          } catch (e) { errors.push(`${path.basename(project)}/${id}: ${String(e)}`); }
        }
      } catch (e) { errors.push(`${path.basename(project)}: ${String(e)}`); }
    }
    return { jobs: jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)), projects: this.projects, errors };
  }
  async resolve(id: string, project?: string): Promise<Job> {
    if (!id) throw new Error('A job ID or unique feature name is required');
    const jobs = (await this.list()).jobs.filter(j => !project || j.project === project);
    const exact = jobs.find(j => j.id === id);
    if (exact) return exact;
    const matches = jobs.filter(j => j.id.startsWith(id) || j.id.endsWith(`-${id}`) || j.title.toLowerCase() === id.toLowerCase());
    if (matches.length !== 1) throw new Error(matches.length ? 'Ambiguous job; use its full ID' : 'Job not found');
    return matches[0];
  }
  async save(job: Job, type = 'update') {
    job.updatedAt = new Date().toISOString();
    await atomic(path.join(jobDir(job), 'job.json'), job);
    const event: Event = { at: job.updatedAt, type, message: job.activity };
    await fs.appendFile(path.join(jobDir(job), 'events.jsonl'), JSON.stringify(event) + '\n', { mode: 0o600 });
  }
  async create(project: string, title: string, request = title, issue?: string, model?: string, runtime?: Config['runtime']): Promise<Job> {
    if (!title.trim() || title.length > 500 || request.length > 100_000) throw new Error('Feature request is empty or too large');
    const config = await this.config(project);
    if (model && !config.model) config.model = model;
    if (!config.runtime) config.runtime = runtime || 'pi';
    validateConfig(config);
    // Remember detected caller/model once; later policy is stable and shared by every host.
    await atomic(path.join(project, '.factory', 'config.json'), config);
    const baseSha = await git(project, ['rev-parse', `${config.targetBranch}^{commit}`]);
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 45) || 'feature';
    const id = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}-${slug}`;
    const now = new Date().toISOString();
    const job: Job = { id, title, request, project, projectName: path.basename(project), branch: `factory/${id}`,
      worktree: path.join(project, '.factory', 'worktrees', id), baseSha, targetBranch: config.targetBranch,
      config, state: 'queued', stage: 'plan', activity: 'Queued for investigation', round: 0,
      createdAt: now, updatedAt: now, activeMs: 0, costUSD: 0, ...(issue ? { issue } : {}) };
    await fs.mkdir(path.join(jobDir(job), 'rounds'), { recursive: true, mode: 0o700 });
    await fs.writeFile(path.join(jobDir(job), 'spec.md'), `# ${title}\n\n${request}\n\nInvestigation pending.\n`, { mode: 0o600 });
    await fs.writeFile(path.join(jobDir(job), 'build.md'), '# Build\n\nImplementation pending.\n', { mode: 0o600 });
    await fs.writeFile(path.join(jobDir(job), 'decisions.md'), '# Decisions\n', { mode: 0o600 });
    await fs.writeFile(path.join(jobDir(job), 'approval.md'), '# Delivery\n\nNo verification or delivery authorization yet.\n', { mode: 0o600 });
    await this.save(job, 'created');
    return job;
  }
  async detail(job: Job): Promise<JobDetail> {
    const documents: Record<string, string> = {};
    for (const name of ['spec.md', 'build.md', 'decisions.md', 'approval.md']) documents[name] = await fs.readFile(path.join(jobDir(job), name), 'utf8').catch(() => '');
    const events = (await fs.readFile(path.join(jobDir(job), 'events.jsonl'), 'utf8').catch(() => '')).split('\n').filter(Boolean).flatMap(line => { try { return [JSON.parse(line) as Event]; } catch { return []; } });
    const artifacts: string[] = [];
    const rounds = await fs.readdir(path.join(jobDir(job), 'rounds')).catch(() => []);
    for (const round of rounds) {
      if (!/^\d+$/.test(round)) continue;
      const dir = path.join(jobDir(job), 'rounds', round);
      for (const name of await fs.readdir(dir)) if (/^[\w.-]+\.(md|json|log)$/.test(name) && !name.endsWith('events.jsonl') && !name.endsWith('.pid.json') && !name.endsWith('.stderr.log')) artifacts.push(`rounds/${round}/${name}`);
    }
    return { job, documents, events: events.slice(-200), artifacts };
  }
  async artifact(job: Job, relative: string) {
    if (!(await this.detail(job)).artifacts.includes(relative)) throw new Error('Artifact not available');
    const root = await fs.realpath(jobDir(job));
    const file = await fs.realpath(path.join(root, relative));
    if (!file.startsWith(root + path.sep)) throw new Error('Artifact escapes the job directory');
    if ((await fs.stat(file)).size > 2 * 1024 * 1024) throw new Error('Artifact too large; inspect it locally');
    return fs.readFile(file, 'utf8');
  }
}
