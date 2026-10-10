import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { atomic, exists, git, jobDir, roundDir } from './store.ts';
import { runAgent } from './agent.ts';
import { shellInvocation, terminateTree, processIdentity } from './process.ts';
import type { AgentReport, AgentRunner, CheckResult, Config, Job, RuntimeHost } from './types.ts';

const exec = promisify(execFile);
export function hash(value: string | Config) { return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex'); }
export async function gh(cwd: string, args: string[]) { return (await exec('gh', args, { cwd, timeout: 60_000, maxBuffer: 8 * 1024 * 1024 })).stdout.trim(); }
export function mergeAllowed(profile: Config['profile'], currentSha: string, job: Job): boolean {
  const e = job.evidence;
  return profile === 'personal' && !!e && e.sha === currentSha && e.review.verdict === 'pass' &&
    !e.review.findings.some(f => f.severity === 'blocking') && e.checks.length > 0 && e.checks.every(c => c.status === 'passed');
}
export async function runCheck(cwd: string, command: string, signal: AbortSignal, timeoutMs: number, recordFile?: string): Promise<{ exitCode: number | null; output: string }> {
  if (signal.aborted) throw new Error('Check interrupted');
  const invocation = shellInvocation(command);
  const proc = spawn(invocation.command, invocation.args, { cwd, detached: process.platform !== 'win32', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const recorded = new Promise<void>(resolve => {
    proc.once('spawn', async () => {
      if (recordFile && proc.pid) {
        const identity = await processIdentity(proc.pid);
        if (identity) await fs.writeFile(recordFile, JSON.stringify({ pid: proc.pid, identity }), { mode: 0o600 }).catch(() => {});
      }
      resolve();
    }); proc.once('error', () => resolve());
  });
  let output = ''; let aborted = false;
  const append = (data: Buffer) => { output = (output + data.toString()).slice(-200_000); };
  proc.stdout.on('data', append); proc.stderr.on('data', append);
  const kill = (s: NodeJS.Signals) => terminateTree(proc.pid, s);
  let hard: ReturnType<typeof setTimeout> | undefined;
  const abort = () => { aborted = true; kill('SIGTERM'); hard = setTimeout(() => kill('SIGKILL'), 1500); };
  signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    const code = await new Promise<number | null>((resolve, reject) => { proc.once('error', reject); proc.once('close', resolve); });
    if (signal.aborted) throw new Error('Check interrupted');
    return { exitCode: aborted ? null : code, output: aborted ? output + '\nCheck timed out.' : output };
  } finally { if (aborted) kill('SIGKILL'); await recorded; if (recordFile) await fs.rm(recordFile, { force: true }); clearTimeout(timer); if (hard) clearTimeout(hard); signal.removeEventListener('abort', abort); }
}
export class Pipeline {
  readonly host: RuntimeHost;
  readonly agent: AgentRunner;
  readonly github: typeof gh;
  constructor(host: RuntimeHost, agent: AgentRunner = runAgent, github: typeof gh = gh) { this.host = host; this.agent = agent; this.github = github; }
  async blocked(job: Job, blockedOn: string, tried: string[], recommendation: string, need: string) {
    job.state = 'needs-human'; job.activity = blockedOn;
    job.decision = { blockedOn, alreadyTried: tried, recommendation, needFromYou: need };
    await this.host.save(job, 'needs-human');
  }
  async step(job: Job, activity: string) { job.activity = activity; await this.host.save(job, 'progress'); }
  async work(job: Job, signal: AbortSignal) {
    const started = Date.now();
    const remaining = () => job.config.budgetMinutes * 60_000 - job.activeMs - (Date.now() - started);
    const guard = () => {
      if (signal.aborted) throw new Error('Job interrupted');
      if (remaining() <= 0) throw new Error('Job exhausted its active-time budget');
      if (job.costUSD >= job.config.maxCostUSD) throw new Error('Job exhausted its reported-cost budget');
    };
    const agent = async (role: 'planner' | 'builder' | 'reviewer' | 'ui' | 'security', prompt: string): Promise<AgentReport> => {
      guard();
      let result;
      try { result = await this.agent({ role, prompt, cwd: job.worktree, outputDir: roundDir(job), model: job.config.model, runtime: job.config.runtime,
        timeoutMs: Math.max(1, Math.min(job.config.workerTimeoutMinutes * 60_000, remaining())), signal }); }
      catch (error) { job.costUSD += Number((error as { costUSD?: number }).costUSD || 0); throw error; }
      job.costUSD += result.costUSD;
      await this.host.save(job, 'agent-result'); guard(); return result.report;
    };
    try {
      guard();
      if (!await exists(job.worktree)) {
        await fs.mkdir(path.dirname(job.worktree), { recursive: true, mode: 0o700 });
        await git(job.project, ['worktree', 'add', '-b', job.branch, job.worktree, job.baseSha]);
        // Nested worktrees have their own ignore rules; protect their scratch directory too.
        const exclude = await git(job.worktree, ['rev-parse', '--git-path', 'info/exclude']);
        await fs.appendFile(path.resolve(job.worktree, exclude), '\n.factory/\n');
        await fs.mkdir(path.join(job.worktree, '.factory'), { recursive: true });
        await fs.writeFile(path.join(job.worktree, '.factory', 'worktree-marker'), job.id);
      }
      if (await git(job.worktree, ['branch', '--show-current']) !== job.branch) throw new Error('Worktree branch identity changed; refusing to overwrite it');
      if (job.stage === 'plan') {
        job.round = Math.max(1, job.round + 1); job.state = 'building';
        await fs.mkdir(roundDir(job), { recursive: true });
        await this.step(job, 'Investigating conventions and acceptance criteria');
        let plan = await agent('planner', `Feature request:\n${job.request}\n\nInspect this repository. Produce an implementable spec with acceptance criteria, scope exclusions, assumptions, environment setup, relevant checks, and any UI/security review needs. If configured checks are empty, return checks:[{name,command}] with executable verification commands discovered from this repository; never invent a passing placeholder. Resolve ordinary uncertainty yourself. This job's configured checks: ${JSON.stringify(job.config.requiredChecks)}. Previously recorded decisions:\n${(await this.host.detail(job)).documents['decisions.md']}`);
        if (plan.verdict === 'blocked') {
          // A second independent look is required before escalating a planning ambiguity.
          job.round++; await fs.mkdir(roundDir(job), { recursive: true });
          await this.step(job, 'Investigating an alternative before requesting a decision');
          const second = await agent('planner', `Request:\n${job.request}\nThe first investigation hit this problem:\n${JSON.stringify(plan)}\nInvestigate alternative solutions and existing patterns. Resolve it if possible; escalate only if genuinely unavoidable.`);
          if (second.verdict === 'blocked') { job.decision = second.decision; job.state = 'needs-human'; job.activity = second.decision!.blockedOn; await this.host.save(job, 'needs-human'); return; }
          if (!second.spec?.trim()) throw new Error('Planner returned no specification');
          plan = second;
          await fs.writeFile(path.join(jobDir(job), 'spec.md'), second.spec, { mode: 0o600 });
        } else {
          if (!plan.spec?.trim()) throw new Error('Planner returned no specification');
          await fs.writeFile(path.join(jobDir(job), 'spec.md'), plan.spec, { mode: 0o600 });
        }
        if (!job.config.requiredChecks.length && plan.checks?.length) {
          const current = await this.host.config(job.project);
          job.config = { ...current, requiredChecks: current.requiredChecks.length ? current.requiredChecks : plan.checks };
          await atomic(path.join(job.project, '.factory', 'config.json'), job.config);
        }
        job.stage = 'build'; await this.host.save(job, 'planned');
      }
      let feedback = job.lastSummary || '';
      while (job.round <= job.config.maxRounds) {
        guard(); await fs.mkdir(roundDir(job), { recursive: true });
        const docs = (await this.host.detail(job)).documents;
        if (job.stage === 'build') {
          job.evidence = undefined; job.state = 'building';
          await this.step(job, `Implementing and resolving findings — round ${job.round}`);
          const build = await agent('builder', `Implement this spec:\n${docs['spec.md']}\n\nOriginal request: ${job.request}\nDecisions:\n${docs['decisions.md']}\nPrevious findings / failures:\n${feedback}\n\nUse local project conventions and set up dependencies as necessary without copying credentials. This is round ${job.round}; change strategy if previous attempts failed. Do not commit; the runtime does that. Required checks: ${JSON.stringify(job.config.requiredChecks)}`);
          job.lastSummary = build.summary; feedback = JSON.stringify(build);
          await fs.appendFile(path.join(jobDir(job), 'build.md'), `\n## Round ${job.round}\n\n${build.summary}\n`);
          if (build.verdict === 'blocked') {
            if (job.round < Math.min(2, job.config.maxRounds)) { job.round++; await this.host.save(job, 'retry'); continue; }
            job.state = 'needs-human'; job.decision = build.decision; job.activity = build.decision!.blockedOn;
            await this.host.save(job, 'needs-human'); return;
          }
          // Do not commit unresolved merge markers, credentials, or scratch state.
          await git(job.worktree, ['diff', '--check']);
          const untracked = await git(job.worktree, ['ls-files', '--others', '--exclude-standard']);
          if (untracked.split('\n').some(f => /(^|\/)(\.env(?:\..*)?|.*\.pem|id_rsa|auth\.json)$/.test(f))) throw new Error('Potential credential file found; refusing to stage it');
          await git(job.worktree, ['add', '-A']);
          await git(job.worktree, ['diff', '--cached', '--check']);
          const merging = await git(job.worktree, ['rev-parse', '--verify', 'MERGE_HEAD']).then(() => true, () => false);
          if (merging || await git(job.worktree, ['diff', '--cached', '--name-only'])) await git(job.worktree, ['commit', '-m', `factory: ${job.title.slice(0, 120)} (round ${job.round})`]);
          job.stage = 'verify'; await this.host.save(job, 'implemented');
        }
        if (job.stage === 'verify' || job.stage === 'review') {
          job.state = 'reviewing'; job.evidence = undefined;
          await this.step(job, `Running required checks — round ${job.round}`);
          const sha = await git(job.worktree, ['rev-parse', 'HEAD']);
          const checks: CheckResult[] = [];
          for (const [index, check] of job.config.requiredChecks.entries()) {
            guard(); await this.step(job, `Running ${check.name} — round ${job.round}`);
            const result = await runCheck(job.worktree, check.command, signal, Math.max(1, Math.min(job.config.workerTimeoutMinutes * 60_000, remaining())), path.join(roundDir(job), 'check-worker.pid.json'));
            const artifact = `rounds/${String(job.round).padStart(3, '0')}/check-${index}.log`;
            await fs.writeFile(path.join(jobDir(job), artifact), result.output, { mode: 0o600 });
            checks.push({ ...check, exitCode: result.exitCode, status: result.exitCode === 0 ? 'passed' : result.exitCode === null || result.exitCode === 127 ? 'unavailable' : 'failed', artifact });
          }
          await atomic(path.join(roundDir(job), 'checks.json'), checks);
          await git(job.worktree, ['diff', '--check']);
          if (await git(job.worktree, ['status', '--porcelain'])) throw new Error('Checks modified worktree files; reconcile and rerun before approval');
          job.stage = 'review'; await this.step(job, `Independent code and specification review — round ${job.round}`);
          const diff = await git(job.worktree, ['diff', `${job.baseSha}...HEAD`]);
          const review = await agent('reviewer', `Independently review the specification against the code diff. Inspect surrounding code, assess correctness, tests, maintainability, code smells, and relevant security/UI concerns. No implementer narrative is supplied.\nSpec:\n${docs['spec.md']}\n\nCheck results:\n${JSON.stringify(checks)}\n\nDiff (truncated if large; inspect changed files):\n${diff.slice(0, 100_000)}\n\nIf checks are empty, verification is unavailable, not passed. Identify concrete additional specialist needs in findings.`);
          const specialistReports: AgentReport[] = [];
          const uiRelevant = /\.(tsx|jsx|vue|svelte|html|css)(?:\s|$)/m.test(await git(job.worktree, ['diff', '--name-only', `${job.baseSha}...HEAD`]));
          if (uiRelevant) {
            await this.step(job, 'Reviewing UI and accessibility');
            specialistReports.push(await agent('ui', `Review UI/accessibility and acceptance criteria.\n${docs['spec.md']}\n${diff.slice(0, 80_000)}\nRead-only source review: no browser execution is available in this MVP. If visual or interactive browser evidence is necessary for acceptance, report a blocking finding; never mark it verified without evidence. Look for existing UI/e2e test coverage.`));
          }
          if (/auth|permission|payment|credential|encrypt|migration/i.test(job.request + diff.slice(0, 20_000))) {
            await this.step(job, 'Reviewing sensitive change risks');
            specialistReports.push(await agent('security', `Review sensitive changes for concrete exploitable defects, authorization mistakes, secret exposure and irreversible behavior.\nSpec:\n${docs['spec.md']}\nDiff:\n${diff.slice(0, 80_000)}`));
          }
          review.findings.push(...specialistReports.flatMap(r => r.findings));
          if (specialistReports.length) review.summary += '\n\nSpecialist reviews:\n' + specialistReports.map(r => r.summary).join('\n');
          if (specialistReports.some(r => r.verdict !== 'pass')) review.verdict = 'changes';
          const stable = sha === await git(job.worktree, ['rev-parse', 'HEAD']) && !(await git(job.worktree, ['status', '--porcelain']));
          const accepted = stable && checks.length > 0 && checks.every(c => c.status === 'passed') && review.verdict === 'pass' && !review.findings.some(f => f.severity === 'blocking');
          const spec = await fs.readFile(path.join(jobDir(job), 'spec.md'), 'utf8');
          job.evidence = { sha, specHash: hash(spec), configHash: hash(job.config), checks, review, round: job.round, reviewedAt: new Date().toISOString() };
          await atomic(path.join(roundDir(job), 'verification.json'), job.evidence);
          if (accepted) { job.stage = 'deliver'; job.state = 'ready'; job.lastSummary = review.summary; await this.host.save(job, 'verified'); break; }
          feedback = JSON.stringify({ checks, review, stable });
          job.lastSummary = feedback;
          if (!checks.length) {
            await this.blocked(job, 'No executable verification command is configured', ['Inspected standard package scripts', 'Independent source review completed'], 'Configure the repository’s actual test or verification command.', 'Set requiredChecks through /factory config, then resume this job.');
            job.stage = 'verify'; await this.host.save(job); return;
          }
          if (job.round >= job.config.maxRounds) {
            await this.blocked(job, 'Verification remains blocked after repair rounds', [review.summary, ...checks.filter(c => c.status !== 'passed').map(c => `${c.name}: ${c.status}`)], 'Inspect the latest findings and choose whether to increase the repair budget or clarify the spec.', 'Provide the missing decision or adjust the repair budget, then resume.');
            job.stage = 'build'; await this.host.save(job); return;
          }
          job.round++; job.stage = 'build'; job.state = 'building'; await this.host.save(job, 'repair');
        }
        if (job.stage === 'deliver') break;
      }
      guard();
      if (job.stage !== 'deliver') throw new Error('Job exhausted its iteration budget');
      await this.deliver(job, signal);
    } finally { job.activeMs += Date.now() - started; }
  }
  async validateEvidence(job: Job) {
    const config = await this.host.config(job.project);
    const e = job.evidence;
    if (!e || e.configHash !== hash(config) || e.specHash !== hash(await fs.readFile(path.join(jobDir(job), 'spec.md'), 'utf8')) ||
        e.sha !== await git(job.worktree, ['rev-parse', 'HEAD']) || await git(job.worktree, ['status', '--porcelain'])) throw new Error('Specification, policy, or commit changed; verification is stale');
    if (e.review.verdict !== 'pass' || e.review.findings.some(f => f.severity === 'blocking') || !e.checks.length || e.checks.some(c => c.status !== 'passed')) throw new Error('Required verification has not passed');
    return config;
  }
  async deliver(job: Job, signal: AbortSignal) {
    if (signal.aborted) throw new Error('Delivery interrupted');
    const config = await this.validateEvidence(job);
    const e = job.evidence!;
    const body = `## Factory delivery report\n\n${job.lastSummary || job.title}\n\n${job.issue ? `Related: ${job.issue}\n\n` : ''}Verified commit: \`${e.sha}\`\n\n${e.checks.map(c => `- [${c.status === 'passed' ? 'x' : ' '}] ${c.name}: ${c.status}`).join('\n')}\n- [x] Independent specification and code review\n- [x] No unresolved blocking findings\n\n${config.profile === 'work' ? '**Human merge required. The factory will not merge this PR.**' : 'Automatic merge is permitted only while verification and GitHub checks remain current.'}\n\nLocal reports are in the ignored factory job directory; raw transcripts are not published.\n`;
    await fs.writeFile(path.join(jobDir(job), 'approval.md'), body, { mode: 0o600 });
    if (!config.publishPullRequests) {
      job.state = 'ready'; job.activity = 'Verified locally — PR publication is not authorized'; await this.host.save(job, 'ready'); return;
    }
    // Publish only the feature branch, never the target branch.
    await this.step(job, 'Publishing verified feature branch');
    await git(job.worktree, ['push', '-u', 'origin', `HEAD:refs/heads/${job.branch}`]);
    if (signal.aborted) throw new Error('Delivery interrupted');
    const prs = JSON.parse(await this.github(job.worktree, ['pr', 'list', '--head', job.branch, '--state', 'all', '--json', 'url,state,headRefOid,baseRefName'])) as { url: string; state: string; headRefOid: string; baseRefName: string }[];
    const pr = prs.find(p => p.state === 'OPEN' && p.baseRefName === job.targetBranch);
    if (pr) {
      job.pr = pr.url;
      await this.github(job.worktree, ['pr', 'edit', pr.url, '--body-file', path.join(jobDir(job), 'approval.md')]);
    } else {
      const merged = prs.find(p => p.state === 'MERGED' && p.headRefOid === e.sha);
      if (merged) { job.pr = merged.url; job.state = 'completed'; job.activity = 'PR already merged'; await this.host.save(job, 'merged'); return; }
      job.pr = await this.github(job.worktree, ['pr', 'create', '--head', job.branch, '--base', job.targetBranch, '--title', job.title, '--body-file', path.join(jobDir(job), 'approval.md')]);
    }
    job.state = 'ready'; job.activity = config.profile === 'work' ? 'Ready for human merge' : 'Waiting for GitHub merge eligibility';
    await this.host.save(job, 'published');
  }
  async observe(job: Job) {
    if (!job.pr) return;
    const pr = JSON.parse(await this.github(job.worktree, ['pr', 'view', job.pr, '--json', 'state,headRefOid,baseRefName,statusCheckRollup,mergeStateStatus,isDraft,reviewDecision'])) as {
      state: string; headRefOid: string; baseRefName: string; mergeStateStatus: string; isDraft: boolean; reviewDecision: string;
      statusCheckRollup: { status?: string; conclusion?: string; state?: string }[];
    };
    if (pr.state === 'MERGED') { job.state = 'completed'; job.activity = 'Merged on GitHub'; await this.host.save(job, 'merged'); return; }
    if (pr.state === 'CLOSED') { job.state = 'paused'; job.activity = 'PR closed without merging'; await this.host.save(job, 'paused'); return; }
    const config = await this.validateEvidence(job);
    if (pr.baseRefName !== job.targetBranch) {
      await this.blocked(job, 'The PR target branch was changed outside the factory', ['Compared the PR target with the job contract'], 'Confirm the intended target before continuing.', 'Restore the original PR target or clarify the intended target.'); return;
    }
    if (pr.headRefOid !== job.evidence!.sha) {
      await git(job.project, ['fetch', 'origin', job.branch]);
      await git(job.worktree, ['merge', '--ff-only', pr.headRefOid]);
      job.evidence = undefined; job.round++; job.stage = 'verify'; job.state = 'queued';
      job.activity = 'Rechecking external PR changes'; await this.host.save(job, 'external-update'); return;
    }
    if (config.profile !== 'personal') return; // Hard runtime gate: work jobs NEVER invoke merge.
    if (!mergeAllowed(config.profile, pr.headRefOid, job)) return;
    const checks = pr.statusCheckRollup || [];
    if (checks.some(c => c.status ? c.status !== 'COMPLETED' || !['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(c.conclusion || '') : c.state !== 'SUCCESS')) return;
    if (pr.isDraft || pr.mergeStateStatus !== 'CLEAN' || pr.reviewDecision === 'CHANGES_REQUESTED' || pr.reviewDecision === 'REVIEW_REQUIRED') return;
    // Revalidate the actual target commit too; do not merge based on a stale local base.
    const remote = await git(job.project, ['ls-remote', 'origin', `refs/heads/${job.targetBranch}`]);
    const targetSha = remote.split(/\s/)[0];
    if (targetSha !== job.baseSha) {
      await git(job.project, ['fetch', 'origin', job.targetBranch]);
      const integrated = await git(job.worktree, ['merge', '--no-edit', targetSha]).then(() => true, () => false);
      job.baseSha = targetSha; job.evidence = undefined; job.round++;
      job.stage = integrated ? 'verify' : 'build'; job.state = 'queued';
      job.lastSummary = integrated ? 'Target updated; rerun integration checks and review.' : 'Resolve conflicts from integrating the updated target branch. Do not abort the merge; resolve files for the runtime to commit.';
      job.activity = 'Refreshing integration against the updated target'; await this.host.save(job, 'integration-refresh'); return;
    }
    await this.validateEvidence(job);
    await this.github(job.worktree, ['pr', 'merge', job.pr, '--squash', '--match-head-commit', job.evidence!.sha]);
    job.state = 'completed'; job.activity = 'Merged automatically under personal policy'; await this.host.save(job, 'merged');
  }
}
