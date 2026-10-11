---
name: factory
description: Coordinate a feature request in the current agent session while recording lightweight progress in the local Factory dashboard. Use when a user asks to build or change software through Factory.
disable-model-invocation: true
---

# Factory

You are the worker. Execute the request in this live agent session using your available tools. The Factory CLI is an observation helper only; it never launches workers, implements work, or resumes a task. The dashboard is a status view, not an execution console.

## Start and choose a workspace

1. Clarify the requested outcome only when needed. Use the supplied working directory as context, but choose the target repository deliberately. Inspect candidate paths with existing tools and ask the user to choose when the target is ambiguous. Do not inherit a repository found at home or a parent directory by default. If the chosen directory is not initialized, ask before initializing it. Choose whether to reuse the selected workspace or create an isolated worktree based on the request; explain that choice and preserve existing changes. Never stage unrelated or pre-existing changes.
2. Start an observation record with `node ~/.agents/factory/cli.ts --request-file <absolute-json-file>` (or `--request-json '<JSON object>'`). Use a private temporary file when structured values need safe quoting. Send `{ "action":"start", "description":"...", "cwd":"<absolute chosen directory>", "runtime":"<optional>", "model":"<optional>" }`. A start requires description and cwd. It saves the observation only and returns a job ID and dashboard URL; it does not require Git. Report the ID and URL without implying execution has been delegated.
3. Record the plan and task brief with `document` actions (`spec.md`, `build.md`, `decisions.md`, `approval.md`). Each request has `{ "action":"document", "id":"...", "name":"spec.md|build.md|decisions.md|approval.md", "content":"..." }`. Save useful supporting `.md`, `.json`, or `.log` files with `{ "action":"artifact", "id":"...", "name":"simple-name.md|simple-name.json|simple-name.log", "content":"..." }` (name must be a simple filename with one of those suffixes).

## Prove — evidence-driven testing

Read `PROVE.md` beside this skill (installed at `~/.agents/factory/skill/PROVE.md`) before implementation. If `/evidence-driven-testing` is installed, load its instructions too; it is optional, not a prerequisite. Follow Factory's local-only evidence and permission rules if other tooling suggests uploads or environment changes.

Capture the before state while reproducing the issue, before fixing it. During `verify`, capture the after state with the same scenario and run the repo's checks. Preserve the numbered before/after artifacts and proof summary for the dashboard and independent review. Green repo checks alone are not runtime proof; missing evidence is a reported gap, never an implied pass.

## Work loop and controls

Use stages in order: `plan`, `build`, `verify`, `review`, `deliver`. Before and after every stage, and between long tool calls, report truthful progress with action `report`, including `id`, `activity`, `state`, and `stage`. Allowed states: `queued`, `building`, `reviewing`, `ready`, `needs-human`, `paused`, `cancelled`, `completed`, `interrupted`. Add only known values among `project`, `worktree`, `branch`, `lastSummary`, `pr`, `error`, and `decision`. The dashboard derives inactivity after five minutes without a report; it does not establish whether a tool is still executing.

Between stages, request a control checkpoint: `{ "action":"checkpoint", "id":"..." }`. Inspect returned `pendingControls`. Pause and cancel are requests, not instantaneous stops; acknowledge controls only after reaching a safe step, using `{ "action":"ack", "id":"...", "controlId":"...", "state":"...", "activity":"..." }`. Honor `answer` content as the user's decision and record it. Acknowledge `pause` as `paused` and stop until explicitly resumed; acknowledge `cancel` as `cancelled` and stop. If several requests conflict, prioritize cancellation over resumption. A dashboard resume request does not start a session: the user must invoke the agent to continue. Never claim exact live tool logs or cost; report only observations actually supplied by the helper.

On a new session or explicit resume, inspect the existing job and read its saved documents and artifacts before acting. The helper does not resume work. Continue only after confirming the user-selected repository and current workspace state; reconcile the task and report your actual progress. Do not treat an inactive dashboard card as proof that work is running.

## Verify, review, deliver

Complete the Prove workflow in `PROVE.md`, then inspect the resulting changes yourself. Report `checks` as `[{"name":"tests","command":"npm test","status":"passed|failed|unavailable","exitCode":0,"artifact":"artifacts/tests.log"}]` (use `null` for unknown exit codes; artifact is optional). Report independent review using `review: {"verdict":"pass|changes|blocked","summary":"...","findings":[{"severity":"blocking|warning|info","explanation":"..."}]}`. Store sanitized output with artifact actions; remove secrets before reporting. These are agent-provided observations, not verification by the dashboard. Perform an independent review after implementation; fix identified issues and rerun affected checks. Report evidence and unresolved limitations. Never merge automatically. Commit or push only when the user has explicitly authorized that policy for this task; otherwise leave changes uncommitted and summarize how the user can proceed. Update the observation to `ready` or `needs-human` at the appropriate handoff; carry the proof verdict and any gaps into the handoff. Use `completed` only when the requested local work is finished and reported, without implying that unavailable evidence passed.

## Management

Dispatch `dashboard`, `status`, `inspect`, `pause`, `resume`, `cancel`, or `answer` as management actions only when explicitly requested, with required ID/answer values. Reporting and checkpoint actions are part of the normal work loop. Use structured JSON, not shell-interpolated prose. For every other `/factory` argument, treat it as a work request and follow this skill. `new` is a request-entry alias, not a forced new-project/repository operation.
