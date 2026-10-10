export type State = 'queued' | 'building' | 'reviewing' | 'ready' | 'needs-human' | 'paused' | 'cancelled' | 'completed' | 'interrupted';
export type Stage = 'plan' | 'build' | 'verify' | 'review' | 'deliver';
export interface Check { name: string; command: string }
export interface Config {
  profile: 'work' | 'personal';
  runtime?: 'pi' | 'opencode' | 'claude' | 'codex';
  publishPullRequests: boolean;
  targetBranch: string;
  maxActiveJobs: number;
  maxRounds: number;
  budgetMinutes: number;
  workerTimeoutMinutes: number;
  maxCostUSD: number;
  requiredChecks: Check[];
  model?: string;
}
export interface Decision { blockedOn: string; alreadyTried: string[]; recommendation: string; needFromYou: string }
export interface Finding { severity: 'blocking' | 'warning' | 'info'; explanation: string; location?: string; suggestedFix?: string }
export interface AgentReport {
  verdict: 'pass' | 'changes' | 'blocked'; summary: string;
  findings: Finding[]; decision?: Decision; spec?: string; checks?: Check[];
}
export interface CheckResult extends Check { status: 'passed' | 'failed' | 'unavailable'; exitCode: number | null; artifact: string }
export interface Evidence { sha: string; specHash: string; configHash: string; checks: CheckResult[]; review: AgentReport; round: number; reviewedAt: string }
export interface Job {
  id: string; title: string; request: string; project: string; projectName: string;
  branch: string; worktree: string; baseSha: string; targetBranch: string;
  state: State; stage: Stage; activity: string; round: number;
  createdAt: string; updatedAt: string; activeMs: number; costUSD: number;
  config: Config; issue?: string; pr?: string; decision?: Decision;
  evidence?: Evidence; lastSummary?: string; error?: string; failureCount?: number;
}
export interface Event { at: string; type: string; message: string }
export interface JobDetail { job: Job; documents: Record<string, string>; events: Event[]; artifacts: string[] }
export interface Snapshot { jobs: Job[]; projects: string[]; errors: string[] }
export interface AgentInput { role: 'planner' | 'builder' | 'reviewer' | 'ui' | 'security'; prompt: string; cwd: string; outputDir: string; model?: string; runtime?: Config['runtime']; timeoutMs: number; signal: AbortSignal; onActivity?: (text: string) => void }
export interface AgentOutput { report: AgentReport; costUSD: number }
export type AgentRunner = (input: AgentInput) => Promise<AgentOutput>;
export interface RuntimeHost {
  save(job: Job, type?: string): Promise<void>;
  config(project: string): Promise<Config>;
  detail(job: Job): Promise<JobDetail>;
}
