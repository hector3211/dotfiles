import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as Effect from 'effect/Effect';
import { decodeCommand, type ObserverCommand } from './observation-schema.ts';
import { safePath, safeRead, safeWrite, safeAppend } from './safe-files.ts';
import { Store, defaults } from './store.ts';
import type { Job, JobDetail, State, Stage, Event, Decision } from './types.ts';

const states = new Set<State>(['queued', 'building', 'reviewing', 'ready', 'needs-human', 'paused', 'cancelled', 'completed', 'interrupted']);
const stages = new Set<Stage>(['plan', 'build', 'verify', 'review', 'deliver']);
const documents = new Set(['spec.md', 'build.md', 'decisions.md', 'approval.md']);
export interface Control {
  id: string; action: 'pause' | 'resume' | 'cancel' | 'answer'; status: 'pending' | 'acknowledged' | 'superseded';
  createdAt: string; acknowledgedAt?: string; answer?: string;
}
export interface Observation extends Job {
  executionMode: 'agent' | 'legacy'; heartbeatAt?: string; reportedState?: State; controls?: Control[];
  reportedChecks?: Extract<ObserverCommand, { action: 'report' }>['checks'];
  reportedReview?: Extract<ObserverCommand, { action: 'report' }>['review'];
}
function text(value: unknown, name: string, max = 100_000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${name} must be non-empty text of at most ${max} characters`);
  return value;
}
function observerId(id: string) { if (!/^obs-[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid observation ID'); return id; }

export class ObservationStore {
  readonly legacy: Store;
  readonly stateDir: string;
  readonly staleAfterMs: number;
  constructor(stateDir: string, staleAfterMs = 5 * 60_000) { this.stateDir = stateDir; this.staleAfterMs = staleAfterMs; this.legacy = new Store(stateDir); }
  async init() { await this.legacy.init(); await fs.mkdir(path.join(this.stateDir, 'observations'), { recursive: true, mode: 0o700 }); await safePath(this.stateDir, 'observations'); }
  directory(id: string) { return path.join(this.stateDir, 'observations', observerId(id)); }
  async raw(id: string): Promise<Observation> { return JSON.parse(await safeRead(this.stateDir, `observations/${observerId(id)}/job.json`)); }
  async save(job: Observation, type: string, message = job.activity) {
    job.updatedAt = new Date().toISOString();
    const record = JSON.stringify(job, null, 2) + '\n';
    if (Buffer.byteLength(record) > 2_000_000) throw new Error('Observation record is too large; keep detailed output in artifacts');
    await safeWrite(this.stateDir, `observations/${observerId(job.id)}/job.json`, record);
    await safeAppend(this.stateDir, `observations/${job.id}/events.jsonl`, JSON.stringify({ at: job.updatedAt, type, message }) + '\n');
  }
  view(job: Observation): Observation {
    if (['queued', 'building', 'reviewing'].includes(job.state) && Date.now() - Date.parse(job.heartbeatAt || job.updatedAt) > this.staleAfterMs) {
      return { ...job, reportedState: job.state, state: 'interrupted', activity: `Inactive: no agent report for ${Math.round(this.staleAfterMs / 60_000)} minutes. Last report: ${job.activity}` };
    }
    return job;
  }
  async list() {
    const jobs: Observation[] = []; const errors: string[] = [];
    for (const id of await fs.readdir(path.join(this.stateDir, 'observations'))) {
      try { const job = await this.raw(id); if (job.id !== id || job.executionMode !== 'agent') throw new Error('Record identity mismatch'); jobs.push(this.view(job)); }
      catch { errors.push(`Could not read observation ${id}`); }
    }
    const legacy = await this.legacy.list();
    for (const job of legacy.jobs) jobs.push({ ...job, executionMode: 'legacy', state: ['queued', 'building', 'reviewing'].includes(job.state) ? 'interrupted' : job.state,
      activity: `Legacy record (read-only; no background execution): ${job.activity}` });
    return { jobs: jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)), projects: [...new Set(jobs.map(job => job.project))], errors: [...errors, ...legacy.errors] };
  }
  async resolve(id: string): Promise<Observation> {
    if (!id) throw new Error('A job ID is required');
    const jobs = (await this.list()).jobs;
    const exact = jobs.find(job => job.id === id); if (exact) return exact;
    const matches = jobs.filter(job => job.id.startsWith(id));
    if (matches.length !== 1) throw new Error(matches.length ? 'Ambiguous ID; use the full job ID' : 'Job not found');
    return matches[0];
  }
  async detail(job: Observation): Promise<JobDetail & { pendingControls: Control[] }> {
    if (job.executionMode === 'legacy') return { ...await this.legacy.detail(job), pendingControls: [] };
    const directory = this.directory(job.id); const content: Record<string, string> = {};
    for (const name of documents) content[name] = await safeRead(this.stateDir, `observations/${job.id}/${name}`).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; return ''; });
    const events: Event[] = (await safeRead(this.stateDir, `observations/${job.id}/events.jsonl`, 10_000_000).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; return ''; })).split('\n').filter(Boolean).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
    const artifacts = (await fs.readdir(path.join(directory, 'artifacts')).catch(() => [])).filter(name => /^[\w.-]+\.(md|json|log)$/.test(name)).map(name => `artifacts/${name}`);
    return { job: this.view(job), documents: content, events: events.slice(-200), artifacts, pendingControls: (job.controls || []).filter(control => control.status === 'pending') };
  }
  async artifact(job: Observation, relative: string) {
    if (job.executionMode === 'legacy') return this.legacy.artifact(job, relative);
    if (!(await this.detail(job)).artifacts.includes(relative)) throw new Error('Artifact not available');
    const root = await fs.realpath(this.directory(job.id));
    const file = await fs.realpath(path.join(root, relative));
    if (!file.startsWith(root + path.sep) || (await fs.stat(file)).size > 2_000_000) throw new Error('Artifact is outside the job record or too large');
    return safeRead(this.stateDir, `observations/${job.id}/${relative}`);
  }
}

/** An observer only: never invokes Git, workers, shell commands, or a delivery pipeline. */
export class ObserverRuntime {
  readonly store: ObservationStore;
  readonly active = new Map();
  onChange: () => void = () => {};
  private lastRefresh = 0;
  constructor(stateDir: string, staleAfterMs?: number) { this.store = new ObservationStore(stateDir, staleAfterMs); }
  async init() { await this.store.init(); }
  async shutdown() { /* The dashboard does not own or terminate agent sessions. */ }
  async tick() { if (Date.now() - this.lastRefresh > 10_000) { this.lastRefresh = Date.now(); this.onChange(); } }
  async command(args: Record<string, unknown>): Promise<unknown> {
    const decoded = await Effect.runPromise(decodeCommand(args));
    args = { ...decoded };
    const action = String(args.action || '');
    if (action === 'status') return this.store.list();
    if (action === 'start' || action === 'new') {
      const request = text(args.description, 'Feature request');
      const workspace = await fs.realpath(text(args.cwd, 'Workspace directory', 4096));
      if (!(await fs.stat(workspace)).isDirectory()) throw new Error('Workspace must be a directory');
      const now = new Date().toISOString();
      const job: Observation = { id: `obs-${randomUUID()}`, title: request.trim().split('\n')[0].slice(0, 500), request, project: workspace, projectName: path.basename(workspace),
        worktree: '', branch: '', baseSha: '', targetBranch: '', state: 'queued', stage: 'plan', activity: 'Recorded; waiting for the current agent to report progress',
        round: 0, createdAt: now, updatedAt: now, heartbeatAt: now, activeMs: 0, costUSD: 0,
        config: { ...defaults('unattached'), ...(args.runtime && ['pi', 'claude', 'opencode', 'codex'].includes(String(args.runtime)) ? { runtime: args.runtime as Job['config']['runtime'] } : {}), ...(typeof args.model === 'string' ? { model: args.model } : {}) },
        executionMode: 'agent', controls: [] };
      await safePath(this.store.stateDir, `observations/${job.id}`);
      await fs.mkdir(this.store.directory(job.id), { recursive: true, mode: 0o700 });
      for (const name of documents) await safeWrite(this.store.stateDir, `observations/${job.id}/${name}`, '');
      await this.store.save(job, 'created'); this.onChange();
      return { ...job, notice: 'Observation created. The current agent must execute the work; the dashboard does not start workers.' };
    }
    const selected = await this.store.resolve(String(args.id || ''));
    if (action === 'inspect') return this.store.detail(selected);
    if (selected.executionMode === 'legacy') throw new Error('Legacy jobs are read-only. Continue the work in your current agent session and create a new observation.');
    const job = await this.store.raw(selected.id);
    if (['pause', 'resume', 'cancel', 'answer'].includes(action)) {
      if (['cancelled', 'completed'].includes(job.state)) throw new Error('Job is finished');
      const answer = action === 'answer' ? text(args.answer, 'Answer') : undefined;
      const existing = (job.controls || []).find(control => control.status === 'pending' && control.action === action && control.answer === answer);
      if (!existing) (job.controls ||= []).push({ id: randomUUID(), action: action as Control['action'], createdAt: new Date().toISOString(), status: 'pending', ...(answer ? { answer } : {}) });
      await this.store.save(job, 'control-requested', `${action} requested; waiting for the agent to acknowledge at a safe checkpoint`);
      this.onChange(); return { job: this.store.view(job), pendingControls: job.controls!.filter(control => control.status === 'pending'), notice: 'Request recorded; it does not interrupt or launch an agent.' };
    }
    if (action === 'checkpoint') {
      job.heartbeatAt = new Date().toISOString();
      await this.store.save(job, 'checkpoint', 'Agent checked for control requests'); this.onChange();
      return this.store.detail(job);
    }
    if (action === 'ack') {
      const control = (job.controls || []).find(control => control.id === args.controlId);
      if (!control) throw new Error('Control request not found');
      if (control.status === 'acknowledged') return this.store.detail(job);
      if (control.status === 'superseded' || ['cancelled', 'completed'].includes(job.state)) throw new Error('This control request can no longer change a finished job');
      const state = args.state || ({ pause: 'paused', cancel: 'cancelled', resume: 'queued', answer: job.state } as const)[control.action];
      if (!states.has(state as State)) throw new Error('Invalid acknowledged state');
      if ((control.action === 'pause' && state !== 'paused') || (control.action === 'cancel' && state !== 'cancelled')) throw new Error('Acknowledge pause/cancel only after stopping safely');
      control.status = 'acknowledged'; control.acknowledgedAt = new Date().toISOString();
      job.state = state as State; job.heartbeatAt = control.acknowledgedAt;
      if (job.state === 'cancelled' || job.state === 'completed') for (const other of job.controls || []) if (other.status === 'pending') other.status = 'superseded';
      job.activity = typeof args.activity === 'string' ? text(args.activity, 'Activity', 10_000) : `Agent acknowledged ${control.action}`;
      if (control.action === 'answer') await safeAppend(this.store.stateDir, `observations/${job.id}/decisions.md`, `\n## Human answer (${control.createdAt})\n\n${control.answer}\n`);
      await this.store.save(job, 'control-acknowledged'); this.onChange(); return this.store.detail(job);
    }
    if (action === 'report') {
      if (decoded.action === 'report') {
        if (decoded.checks) job.reportedChecks = decoded.checks;
        if (decoded.review) job.reportedReview = decoded.review;
      }
      if (args.state !== undefined && !states.has(args.state as State)) throw new Error('Invalid state');
      if (args.stage !== undefined && !stages.has(args.stage as Stage)) throw new Error('Invalid stage');
      if (['completed', 'cancelled'].includes(job.state) && args.state && args.state !== job.state) throw new Error('A finished job cannot be restarted by a progress report');
      if (args.decision !== undefined && args.decision !== null) {
        const decision = args.decision as Decision;
        text(decision.blockedOn, 'Blocker', 10_000); text(decision.recommendation, 'Recommendation', 10_000); text(decision.needFromYou, 'Need from you', 10_000);
        if (!Array.isArray(decision.alreadyTried) || decision.alreadyTried.some(value => typeof value !== 'string')) throw new Error('Invalid already-tried list');
        job.decision = decision;
      } else if (args.decision === null) delete job.decision;
      for (const key of ['activity', 'project', 'worktree', 'branch', 'baseSha', 'targetBranch', 'lastSummary', 'pr', 'error'] as const) {
        if (args[key] !== undefined) job[key] = text(args[key], key, key === 'lastSummary' ? 100_000 : 10_000);
      }
      if (args.project) job.projectName = path.basename(job.project);
      if (args.state) job.state = args.state as State;
      if (job.state === 'cancelled' || job.state === 'completed') for (const control of job.controls || []) if (control.status === 'pending') control.status = 'superseded';
      if (args.stage) job.stage = args.stage as Stage;
      job.heartbeatAt = new Date().toISOString();
      await this.store.save(job, 'agent-report'); this.onChange(); return this.store.view(job);
    }
    if (action === 'document' || action === 'artifact') {
      const name = text(args.name, 'Artifact name', 200);
      if (action === 'document' ? !documents.has(name) : !/^[\w][\w.-]*\.(md|json|log)$/.test(name)) throw new Error('Use an approved document name or a simple .md/.json/.log artifact filename');
      const content = text(args.content, 'Content', 1_000_000);
      await safeWrite(this.store.stateDir, `observations/${job.id}/${action === 'artifact' ? 'artifacts/' : ''}${name}`, content);
      job.heartbeatAt = new Date().toISOString(); await this.store.save(job, action, `Agent saved ${name}`); this.onChange();
      return { id: job.id, name, notice: 'Recorded as agent-provided evidence, not independently verified by the dashboard.' };
    }
    throw new Error('Unknown observer action. Use start, report, document, artifact, checkpoint, ack, inspect, status, pause, resume, cancel, or answer.');
  }
}
