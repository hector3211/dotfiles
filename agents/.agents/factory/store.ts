import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Config, Event, Job, JobDetail } from './types.ts';
import { safeRead } from './safe-files.ts';

export async function atomic(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${randomUUID()}.tmp`;
  const handle = await fs.open(temp, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(value, null, 2) + '\n'); await handle.sync(); }
  finally { await handle.close(); }
  try { await fs.rename(temp, file); } catch (error) { await fs.rm(temp, { force: true }); throw error; }
}
export async function exists(file: string) { try { await fs.access(file); return true; } catch { return false; } }
export async function readJSON<T>(file: string): Promise<T> { return JSON.parse(await fs.readFile(file, 'utf8')); }
// Retained display fields for legacy dashboard records, not execution policy.
export function defaults(targetBranch: string): Config {
  return { profile: 'work', publishPullRequests: false, targetBranch, maxActiveJobs: 2, maxRounds: 6,
    budgetMinutes: 120, workerTimeoutMinutes: 20, maxCostUSD: 15, requiredChecks: [] };
}
export function jobDir(job: Job) { return path.join(job.project, '.factory', 'jobs', job.id); }

/** Read-only compatibility for records created by the retired worker runtime. */
export class Store {
  projects: string[] = [];
  readonly stateDir: string;
  constructor(stateDir: string) { this.stateDir = stateDir; }
  async init() {
    await fs.mkdir(this.stateDir, { recursive: true, mode: 0o700 });
    if (await exists(path.join(this.stateDir, 'projects.json'))) this.projects = await readJSON(path.join(this.stateDir, 'projects.json'));
  }
  async list() {
    const jobs: Job[] = []; const errors: string[] = [];
    for (const project of this.projects) {
      try {
        for (const id of (await fs.readdir(path.join(project, '.factory', 'jobs'))).filter(id => /^[a-zA-Z0-9_-]+$/.test(id))) {
          try {
            const job = JSON.parse(await safeRead(project, `.factory/jobs/${id}/job.json`)) as Job;
            if (job.id !== id || job.project !== project) throw new Error('Job identity mismatch');
            jobs.push(job);
          } catch { errors.push(`Could not read legacy record ${path.basename(project)}/${id}`); }
        }
      } catch { errors.push(`Could not read legacy project ${path.basename(project)}`); }
    }
    return { jobs: jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)), projects: this.projects, errors };
  }
  async detail(job: Job): Promise<JobDetail> {
    const documents: Record<string, string> = {};
    for (const name of ['spec.md', 'build.md', 'decisions.md', 'approval.md']) documents[name] = await safeRead(job.project, `.factory/jobs/${job.id}/${name}`).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; return ''; });
    const events: Event[] = (await safeRead(job.project, `.factory/jobs/${job.id}/events.jsonl`, 10_000_000).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; return ''; })).split('\n').filter(Boolean).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
    const artifacts: string[] = [];
    for (const round of (await fs.readdir(path.join(jobDir(job), 'rounds')).catch(() => [])).filter(round => /^\d+$/.test(round))) {
      for (const name of await fs.readdir(path.join(jobDir(job), 'rounds', round))) if (/^[\w.-]+\.(md|json|log)$/.test(name) && !name.endsWith('.pid.json') && !name.endsWith('.stderr.log')) artifacts.push(`rounds/${round}/${name}`);
    }
    return { job, documents, events: events.slice(-200), artifacts };
  }
  async artifact(job: Job, relative: string) {
    if (!(await this.detail(job)).artifacts.includes(relative)) throw new Error('Artifact not available');
    const root = await fs.realpath(jobDir(job)); const file = await fs.realpath(path.join(root, relative));
    if (!file.startsWith(root + path.sep) || (await fs.stat(file)).size > 2_000_000) throw new Error('Artifact escapes the job directory or is too large');
    return safeRead(job.project, `.factory/jobs/${job.id}/${relative}`);
  }
}
