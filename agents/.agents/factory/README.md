# Factory

Factory is a lightweight local dashboard for work performed by the **current interactive agent**. The agent selects a repository, implements the request with its own tools, independently verifies and reviews the changes, and reports progress to the dashboard. The helper only stores observations, documents, artifacts, and controls: it never launches workers, executes implementation, resumes a job, creates Git worktrees, or merges work. Closing the session can interrupt the work; the dashboard marks a job inactive after five minutes without a report and does not claim that work continues.

## Setup

Requires Node.js 24+ and npm. From the dotfiles checkout:

```sh
npm --prefix agents/.agents/factory ci --omit=dev --ignore-scripts
node agents/.agents/factory/install.mjs
```

The observer uses pinned Effect **v4 beta.98** packages and a committed lockfile. Its CLI is built on `effect/unstable/cli`; its daemon uses Effect scopes for shutdown and cleanup, schemas validate reporting commands, and a semaphore serializes record mutations. These packages belong to Factory, not your application. Linux bootstrap installs them automatically. Reload pi with `/reload` after updating the entrypoint; idle dashboard daemons update automatically on the next reporting command.

## Entry points

Use `/factory <request>` in Pi, Claude Code, or OpenCode. A bare `/factory` asks what work you want. `/factory new <request>` is equivalent to a request; `new` does not force a new project. The full skill at `~/.agents/factory/skill/SKILL.md` defines the workflow. Pi passes that skill, the request, and cwd to the current agent with a triggered turn. Claude and OpenCode commands direct their current agent to read and follow it.

Explicit dashboard-management actions are `dashboard`, `status`, `inspect <id>`, `pause <id>`, `resume <id>`, `cancel <id>`, and `answer <id> <decision>`. Pause/cancel are requests acknowledged by the agent at a safe point. Resume in a new session means inspecting the saved job data and continuing as the current agent, not restarting a worker.

## Observation helper

The minimal Node helper is `~/.agents/factory/cli.ts`. Structured calls use an absolute private JSON file (`--request-file <absolute-path>`) or `--request-json '<object>'`; start requests need `description` and `cwd`, with optional `runtime` and `model`:

```json
{"action":"start","description":"Add CSV export","cwd":"/absolute/repo","runtime":"optional","model":"optional"}
```

Start saves an observation, returns a job ID and dashboard URL, and requires no Git repository. Subsequent structured actions:

- `report`: `{ "action":"report", "id":"...", "activity":"...", "state":"...", "stage":"...", "project":"...", "worktree":"...", "branch":"...", "lastSummary":"...", "pr":"...", "error":"..." }`. States: `queued`, `building`, `reviewing`, `ready`, `needs-human`, `paused`, `cancelled`, `completed`, `interrupted`. Stages: `plan`, `build`, `verify`, `review`, `deliver`.
- `document`: `{ "action":"document", "id":"...", "name":"spec.md|build.md|decisions.md|approval.md", "content":"..." }`.
- `artifact`: `{ "action":"artifact", "id":"...", "name":"simple-name.md|simple-name.json|simple-name.log", "content":"..." }` (simple filename only).
- `checkpoint`: `{ "action":"checkpoint", "id":"..." }`, returning the job and pending controls; `ack`: `{ "action":"ack", "id":"...", "controlId":"...", "state":"...", "activity":"..." }`.

Reports can also include `checks: [{ "name":"tests", "command":"npm test", "status":"passed", "exitCode":0, "artifact":"artifacts/tests.log" }]` and `review: { "verdict":"pass", "summary":"...", "findings":[] }`. These populate the dashboard as agent-reported evidence, not server-certified results.

`decision` is optional on reports: `{ "blockedOn":"...", "alreadyTried":["..."], "recommendation":"...", "needFromYou":"..." }`; use `null` to clear it.

Report before and after each stage, and check controls between stages. Dashboard inactivity is not evidence of process state. Never claim live tool logs or exact cost; the helper does not report them.

## Workspace, safety, and delivery

The agent chooses the target repository with the user when ambiguous. It must not infer a repo from the home directory or stage unrelated changes. Repository initialization requires explicit user choice; the agent explains whether it will reuse the selected workspace or isolate changes in a worktree. Run project-appropriate tests, inspect all changes, conduct an independent review, fix issues, and report evidence. Commit or push only with explicit user authorization; never merge automatically.

The agent and repository commands run with the host agent's permissions. The dashboard is an observer, not a sandbox or durable execution service. Avoid sensitive data in reports and artifacts. A missed report may leave the dashboard stale until its inactivity calculation catches up.

## Existing records and migration

Records from the former unattended-worker factory are historical, read-only data; this workflow does not attach, resume, or migrate them into current-session execution. Inspect them for reference, then start a new observation for new work. Unattended execution, automatic verification/review workers, automatic PR creation, and automatic merging have been removed. The worker-launching implementation has been removed. Existing job records and worktrees are preserved and available for read-only inspection. An idle old daemon is migrated automatically. If a legacy worker is running, normal observer commands refuse to dispatch to it; `/factory migrate` explicitly stops that old runtime gracefully before starting the observer. This is the only migration path that may stop old workers and mark their records interrupted. Observer updates preserve the dashboard's listening URL so existing tabs can reconnect.

New records live in `~/.local/state/software-factory/observations/<id>/` (override with `FACTORY_STATE_DIR`). The dashboard renders only reported data; it does not independently verify tests/reviews, measure spend, or enforce agent permissions.

## Verification

```sh
cd agents/.agents/factory
npm ci --ignore-scripts
npm run typecheck
npm test
```

For the optional real-browser test, set `FACTORY_PLAYWRIGHT_MODULE` to Playwright's `index.mjs` (and optionally `FACTORY_CHROMIUM` to an installed Chromium executable). No browser dependency is added to your projects.
