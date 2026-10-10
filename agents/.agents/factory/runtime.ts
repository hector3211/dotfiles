import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Store, atomic, git, jobDir, readJSON } from './store.ts';
import { workspace, newProject, saveDraft, loadDraft } from './workspace.ts';
import { Pipeline, gh } from './pipeline.ts';
import { processIdentity, terminateTree } from './process.ts';
import type { AgentRunner, Config, Job } from './types.ts';

export class Runtime {
  readonly store: Store;
  readonly pipeline: Pipeline;
  readonly active = new Map<string, { job: Job; controller: AbortController; done: Promise<void> }>();
  onChange: () => void = () => {};
  private ticking = false;
  private stopped = false;
  private lastObserve = 0;
  constructor(stateDir: string, agent?: AgentRunner) { this.store = new Store(stateDir); this.pipeline = new Pipeline({
    save: async (job, type) => { await this.store.save(job, type); this.onChange(); },
    config: project => this.store.config(project), detail: job => this.store.detail(job),
  }, agent); }
  async init() {
    await this.store.init();
    for (const job of (await this.store.list()).jobs) {
      if (job.state === 'building' || job.state === 'reviewing') {
        const rounds = await fs.readdir(path.join(jobDir(job), 'rounds')).catch(() => []);
        for (const round of rounds.filter(r => /^\d+$/.test(r))) {
          const directory = path.join(jobDir(job), 'rounds', round);
          for (const artifact of (await fs.readdir(directory)).filter(a => a.endsWith('.pid.json'))) {
            const record = await readJSON<{ pid: number; identity: string }>(path.join(directory, artifact)).catch(() => null);
            if (record && await processIdentity(record.pid) === record.identity) terminateTree(record.pid, 'SIGKILL');
            await fs.rm(path.join(directory, artifact), { force: true });
          }
        }
        // Let terminated workers release handles before a user can resume (especially on Windows).
        await new Promise(resolve => setTimeout(resolve, 250));
        job.state = 'interrupted'; job.activity = 'Interrupted runtime — worktree preserved; resume to reconcile';
        await this.store.save(job, 'recovery');
      }
    }
  }
  async tick() {
    if (this.ticking || this.stopped) return;
    this.ticking = true;
    try {
      const snapshot = await this.store.list();
      // Two global workers initially. Each job runs its specialists sequentially, so this also bounds worker processes.
      for (const job of snapshot.jobs.slice().reverse()) {
        if (this.active.size >= 2) break;
        if (job.state !== 'queued' || this.active.has(job.id)) continue;
        if ([...this.active.values()].filter(a => a.job.project === job.project).length >= job.config.maxActiveJobs) continue;
        // Shared metadata operations on a repository are kept out of overlapping worktree setup/delivery stages.
        if ([...this.active.values()].some(a => a.job.project === job.project && (a.job.stage === 'plan' || a.job.stage === 'deliver'))) continue;
        const controller = new AbortController();
        job.state = job.stage === 'review' || job.stage === 'verify' ? 'reviewing' : 'building';
        await this.store.save(job, 'started'); this.onChange();
        const done = this.pipeline.work(job, controller.signal).catch(async error => {
          if (controller.signal.aborted) return;
          job.error = String(error); job.failureCount = (job.failureCount || 0) + 1;
          // Try a different repair pass before requiring a person for ordinary execution failures.
          if (job.stage !== 'deliver' && job.failureCount < 3 && job.round < job.config.maxRounds && job.activeMs < job.config.budgetMinutes * 60_000 && job.costUSD < job.config.maxCostUSD) {
            job.lastSummary = `Runtime failure requiring investigation: ${job.error}. Inspect prior logs and choose a materially different repair strategy.`;
            if (job.stage !== 'plan') { job.round++; job.stage = 'build'; }
            job.state = 'queued'; job.activity = 'Investigating a failed attempt before escalating';
          } else {
            job.state = 'needs-human'; job.activity = 'Execution could not complete within its permissions or budget';
            job.decision = { blockedOn: job.error, alreadyTried: [`${job.failureCount} execution attempts`, job.lastSummary || 'See preserved round evidence'], recommendation: 'Inspect the concrete failure and supply only the missing access, decision, or budget.', needFromYou: 'Resolve the reported blocker, then answer or resume this job.' };
          }
        }).finally(async () => {
          await this.store.save(job, 'settled'); this.active.delete(job.id); this.onChange();
        });
        this.active.set(job.id, { job, controller, done });
      }
      if (Date.now() - this.lastObserve > 30_000) {
        this.lastObserve = Date.now();
        // Single observer/merge path, and no delivery observer while repo workers are active.
        for (const job of snapshot.jobs.filter(j => j.state === 'ready' && j.pr && ![...this.active.values()].some(a => a.job.project === j.project))) {
          try { await this.pipeline.observe(job); }
          catch (error) {
            // Network/gh failures must not turn a previously ready card into a bogus merge approval.
            job.error = String(error); job.activity = 'PR monitoring paused: inspect the latest error';
            if (/stale|changed|verification/i.test(String(error))) {
              job.config = await this.store.config(job.project);
              job.evidence = undefined; job.state = 'queued'; job.stage = 'verify'; job.round++;
              job.activity = 'Revalidating changed evidence';
            }
            await this.store.save(job, 'monitor');
          }
          this.onChange();
        }
      }
    } finally { this.ticking = false; }
  }
  async command(args: { action: string; cwd?: string; id?: string; description?: string; answer?: string; key?: string; value?: unknown; runtime?: Config['runtime']; model?: string; issue?: string; name?: string; repository?: string }) {
    if (args.action === 'plan') {
      if (!args.cwd) throw new Error('Workspace directory required');
      return saveDraft(this.store.stateDir, args.cwd, args.description || '');
    }
    if (args.action === 'new') {
      if (!args.cwd || !args.description?.trim()) throw new Error('Use /factory new <directory-name> <feature description>');
      const project = await newProject(args.cwd, args.name || '');
      return this.command({ ...args, action: 'start', cwd: project });
    }
    if (args.action === 'attach') {
      if (!args.cwd || !args.repository) throw new Error('Use /factory attach <draft-id> <repository-path>');
      const draft = await loadDraft(this.store.stateDir, args.id || '');
      const selected = await workspace(path.resolve(args.cwd, args.repository));
      if (!selected.project) throw new Error('Attach requires a project repository, not a workspace');
      if (draft.attachmentProject && draft.attachmentProject !== selected.project) throw new Error('Attachment already started in another repository; retry with that repository');
      const draftFile = path.join(this.store.stateDir, 'drafts', `${draft.id}.json`);
      draft.attachmentProject = selected.project;
      await atomic(draftFile, draft);
      const project = await this.store.register(selected.project);
      const job = await this.store.create(project, draft.description.slice(0, 500), draft.description, undefined, args.model, args.runtime, `draft-${draft.id}`);
      draft.attachedJob = job.id;
      await atomic(draftFile, draft);
      this.onChange(); return job;
    }
    if (args.action === 'status') return this.store.list();
    if (args.action === 'inspect') return this.store.detail(await this.store.resolve(args.id || ''));
    if (args.action === 'start' || args.action === 'issue' || args.action === 'config') {
      if (!args.cwd) throw new Error('Project directory required');
      const selected = await workspace(args.cwd);
      if (!selected.project) return selected;
      const project = await this.store.register(selected.project);
      if (args.action === 'config') {
        if (args.key) {
          const config = await this.store.configure(project, args.key, args.value);
          this.onChange(); return config;
        }
        return this.store.config(project);
      }
      let request = args.description || ''; let title = request; let issue: string | undefined;
      if (args.action === 'issue') {
        const number = (args.issue || '').replace(/^#/, '');
        if (!/^\d+$/.test(number)) throw new Error('Use /factory issue #123');
        const data = JSON.parse(await gh(project, ['issue', 'view', number, '--json', 'title,body,url,comments']));
        title = data.title; issue = data.url;
        request = `${data.title}\n\n${data.body}\n\nIssue discussion:\n${(data.comments || []).map((c: { body: string }) => c.body).join('\n\n')}`;
      }
      const config = await this.store.config(project);
      // Caller runtime is detected on first use; explicit persisted configuration wins thereafter.
      const existing = (await this.store.list()).jobs.some(j => j.project === project);
      const job = await this.store.create(project, title, request, issue, existing ? undefined : args.model, existing ? config.runtime : args.runtime);
      this.onChange(); return job;
    }
    const job = await this.store.resolve(args.id || '');
    const running = this.active.get(job.id);
    if (args.action === 'pause' || args.action === 'cancel') {
      if (['completed', 'cancelled'].includes(job.state)) throw new Error('Job is already finished');
      if (running) { running.controller.abort(); await running.done; }
      const latest = running?.job || job;
      latest.state = args.action === 'pause' ? 'paused' : 'cancelled';
      latest.activity = args.action === 'pause' ? 'Paused — changes preserved' : 'Cancelled — worktree and changes retained';
      await this.store.save(latest, args.action); this.onChange(); return latest;
    }
    if (args.action === 'resume' || args.action === 'answer') {
      if (running) throw new Error('Job is already running');
      if (['completed', 'cancelled', 'queued', 'building', 'reviewing'].includes(job.state)) throw new Error('Job cannot be resumed from this state');
      if (args.action === 'answer') {
        if (job.state !== 'needs-human' || !args.answer?.trim()) throw new Error('A pending decision and non-empty answer are required');
        await fs.appendFile(path.join(jobDir(job), 'decisions.md'), `\n## ${new Date().toISOString()}\n\n${job.decision?.blockedOn}\n\nHuman decision: ${args.answer}\n`);
      }
      const config = await this.store.config(job.project);
      if (JSON.stringify(config) !== JSON.stringify(job.config)) {
        job.config = config; job.evidence = undefined;
        if (job.stage === 'deliver' || job.stage === 'review') job.stage = 'verify';
      }
      if (job.round > config.maxRounds || (job.round === config.maxRounds && !['plan', 'deliver'].includes(job.stage))) throw new Error('Increase maxRounds before resuming further repairs');
      if (job.activeMs >= config.budgetMinutes * 60_000 || job.costUSD >= config.maxCostUSD) throw new Error('Increase the exhausted budget before resuming');
      if (await fs.access(job.worktree).then(() => true, () => false)) {
        if (await git(job.worktree, ['branch', '--show-current']) !== job.branch) throw new Error('Worktree is on another branch; refusing to overwrite it');
      }
      if (job.round > 0 && !['plan', 'deliver'].includes(job.stage)) job.round++;
      if (job.stage !== 'plan' && await git(job.worktree, ['status', '--porcelain']).catch(() => '')) job.stage = 'build';
      job.state = 'queued'; job.decision = undefined; job.error = undefined; job.failureCount = 0;
      job.activity = 'Queued to continue autonomously'; await this.store.save(job, args.action); this.onChange(); return job;
    }
    throw new Error('Unknown action');
  }
  async shutdown() {
    this.stopped = true;
    for (const a of this.active.values()) a.controller.abort();
    await Promise.all([...this.active.values()].map(a => a.done));
    for (const job of (await this.store.list()).jobs) if (['building', 'reviewing'].includes(job.state)) {
      job.state = 'interrupted'; job.activity = 'Runtime stopped; resume to continue'; await this.store.save(job, 'shutdown');
    }
  }
}
