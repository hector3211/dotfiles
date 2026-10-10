# Local software factory

A dependency-free local runtime and HTML operations board. Source lives in your dotfiles; `~/.agents/factory` points here. Pi, OpenCode, Claude Code, and T3 Code share the same jobs and server. T3 is a host entry point; its jobs use standalone Codex, Claude, or OpenCode workers.

## Install once

Prerequisites: **Node.js 24+, Git, and one authenticated agent CLI**. GitHub CLI (`gh`) is needed only for issue intake, PR publication, and merge monitoring. No dependency is added to your application.

Linux or Windows, from the dotfiles checkout:

```text
node agents/.agents/factory/install.mjs
```

Reload pi (`/reload`) or restart OpenCode/Claude Code to discover `/factory`. Linux dotfiles bootstrap also installs these links. On Windows the installer uses a directory junction and copies the tiny host adapters when file symlinks are unavailable. It refuses to overwrite unrelated resources; existing Matt Pocock skills are untouched. If a Windows adapter changes in a later update, remove only that factory-owned adapter copy and rerun installation.

The optional terminal launcher is `~/.local/bin/factory` on Linux and `%USERPROFILE%\.local\bin\factory.cmd` on Windows; add that directory to PATH if desired. Slash commands do not require that PATH change.

## Use in any trusted Git project

```text
/factory Add CSV invoice exports
/factory issue #123
/factory status
/factory dashboard
/factory inspect <id>
/factory pause <id>
/factory resume <id>
/factory cancel <id>
/factory answer <id> Exclude customer emails
/factory config
```

The first feature detects the invoking host and remembers it as the worker runtime. Pi also passes its selected model. OpenCode and Claude workers initially use their own default model. Every host can subsequently manage those same jobs. Slash-command arguments are passed through a small host adapter; Claude/OpenCode adapters use their agent to dispatch the CLI, while pi registers a native command.

Each feature gets a unique branch and worktree. The main checkout's source files are not modified by feature implementation. Registration adds `.factory/` to `.gitignore`; that ignore rule is the only intentional repository setup edit. Tracked `.factory` content causes registration to fail rather than silently claiming it is ignored.

The browser opens on first job creation. Closing the browser or agent chat does not stop the detached runtime. Two jobs can run globally; each job runs its planner, builder, verifier, independent reviewer, and relevant UI/security specialists. Specialist calls are sequential within a job in this first version, bounding total worker processes at two. Feature jobs remain independent.

## T3 Code

The installer adds the shared skill at `~/.agents/skills/factory` (Codex discovery) and `~/.claude/skills/factory` (Claude discovery). The existing OpenCode `/factory` command is available through T3's OpenCode provider. The source remains `~/.agents/factory/skill`, linked to your dotfiles; no T3 fork, extra server, or per-project setup is required.

In T3, use **Restart agent session** from the command palette after installation. Choose **Local** thread mode: the factory creates its own feature worktrees. Type `/factory` and select the skill from the menu, or pick `$factory` directly, then add your request. If skills are hidden from `/`, enable **Settings → General → Show skills in slash menu** or use `$`.

```text
$factory Add CSV invoice exports
$factory status
$factory dashboard
```

The skill dispatches `node <home>/.agents/factory/cli.ts --caller t3 --worker codex|claude|opencode <command>`. It chooses the current provider where known; omitting `--worker` defaults a new project to Codex. Existing project policy always wins. Change workers explicitly with `/factory config runtime codex` (or `claude` / `opencode`). `t3` is not a worker runtime: its CLI starts the T3 server, not a one-shot agent task.

Codex workers use `codex -a never exec --json --ephemeral`, strict structured reports, and `read-only` or `workspace-write` sandboxing. They do not disable the sandbox or auto-approve sandbox escapes. To isolate inherited hooks/MCP configuration, the adapter uses `--ignore-user-config`; custom provider configuration from `config.toml` is consequently not inherited. Standalone CLI authentication must work on this machine; a T3-only account connection is not necessarily a standalone Codex login. Codex exec does not report USD pricing, so its dashboard cost says **USD n/a** and only time/iteration budgets are meaningful for that worker.

Integration was checked against T3 `v0.0.45` (`docs/user/composer.md`, `docs/user/providers-claude.md`, and `packages/client-runtime/src/providerSkills.ts`). A real Codex app-server `skills/list` request confirmed the installed factory skill is enabled and user-scoped. Paid feature execution through T3 has not been tested.

## Work and personal policy

Unknown projects default to **work**, with **PR publication off** until you authorize it once:

```text
/factory config publish true
```

After this, the factory autonomously publishes verified PRs. Work jobs stop at **Ready for human merge**. They never invoke the runtime's merge operation, and the dashboard has no merge control. Merge in GitHub; the factory observes completion.

Personal mode explicitly enables eligible automatic merging:

```text
/factory config profile personal
/factory config publish true
```

Automatic merging requires current SHA/spec/policy-bound local checks and review, no blocking findings, GitHub checks passing, a clean nondraft PR, and no outstanding required/negative GitHub review. It checks the target commit, integrates an updated target, and reruns verification rather than reusing stale evidence. GitHub branch protection remains authoritative.

Changing a project's policy invalidates prior evidence. Resume an existing locally-ready job after enabling publication; it revalidates under the updated policy. Agents are instructed not to edit policy. Config changes are explicit user actions through `/factory config`, not an agent approval step.

## Discovery and limits

Standard `test`, `lint`, and `typecheck` package scripts are detected using npm/pnpm/yarn/bun lockfiles. With no standard scripts, the planner investigates repository instructions and proposes actual verification commands. The runtime executes commands and records their exit status. Missing checks do not count as passed.

Configure unusual commands when necessary (quote JSON appropriately for a terminal; slash commands preserve it as text):

```text
/factory config requiredChecks [{"name":"tests","command":"python -m pytest"}]
/factory config runtime codex
/factory config model anthropic/claude-sonnet-4-6
/factory config maxRounds 8
/factory config budgetMinutes 180
/factory config maxCostUSD 20
```

Switching runtime clears the previous model override because model names differ across CLIs. Commands must be valid for the machine's shell: `/bin/sh` on Linux, `cmd.exe` on native Windows. Configure platform-specific commands for repositories without portable scripts.

Default budgets: six iterations, 120 active minutes per job, 20 minutes per worker/check, and $15 **reported** agent cost. Cost is accounted after agent messages/stages, not a prepaid provider spending cap. Providers may omit or estimate costs. Time and iteration bounds are enforceable; do not treat the displayed dollar budget as a guaranteed billing ceiling.

Routine ambiguity and failures trigger investigation and repair, not immediate questions. Human cards contain only **Blocked on**, **Already tried**, **Recommendation**, and **Need from you**. Answering records the decision and queues continuation. Cancellation and pause preserve the worktree; no automatic destructive cleanup is implemented.

## Local records

```text
<project>/.factory/
  config.json
  jobs/<id>-<feature>/
    job.json
    spec.md
    build.md
    decisions.md
    approval.md
    events.jsonl
    rounds/001/...
  worktrees/<id>-<feature>/
```

Completed review rounds are preserved; retries/resumed verification use new rounds. JSON snapshots are written via temporary files and atomic rename; the event history is explanatory, not the sole source of state. After interruption, jobs are marked interrupted and worktrees preserved. Recorded orphan workers are terminated only when their process start identity matches, avoiding killing recycled PIDs. Resume checks the worktree identity and reconciles changes before proceeding.

The global project registry, daemon descriptor and daemon log live under `~/.local/state/software-factory/`, outside dotfiles. `FACTORY_STATE_DIR` can override this for tests or separate installations. No project is discovered by scanning your disk. Ignored records are local, not backed up by Git.

## Dashboard

Plain HTML/CSS/JavaScript, served on a random localhost port, with Server-Sent Events for progress. Four lanes: Queued, Building, Reviewing, Ready. Needs you is separate; paused/interrupted/completed/cancelled jobs are expandable. Cards open specs, decisions, review findings, checks and evidence. No status drag/drop or merge button.

Reports are rendered as text, never executed HTML. Requests validate localhost host/origin, state changes require a per-daemon token, and artifacts are allowlisted with realpath checks. Raw agent transcripts and stderr logs are not served. Check logs may still contain sensitive application output: avoid logging secrets.

## Security and current limitations

**Run only in repositories you trust. Agents and repository test commands execute as your OS user. Worktrees and command guards are not a security sandbox.** The pi/OpenCode/Claude adapters restrict direct tools and common forbidden operations; the Codex adapter additionally uses its CLI sandbox, but arbitrary shell execution can bypass prompt/command restrictions. Do not supply production credentials. For a genuinely enforced human-only work merge rule, use GitHub branch rules and separate bot credentials with appropriate restrictions; sharing your personal credentials with local agents is not an authorization boundary.

- UI specialists currently perform source/accessibility review. They do not launch browsers; required visual/interactive evidence remains unverified unless covered by executable project checks. The factory must not call that visual review a pass.
- No GitHub Projects synchronization, remote dashboard, issue polling, or automatic cleanup yet.
- New jobs start from committed target-branch code, not uncommitted main-checkout changes.
- Windows support has a CI matrix and platform-aware implementation, but needs an actual Windows CI run; Linux tests do not prove Windows execution.
- Real provider/model behavior is not covered by mock-adapter tests; verify a small feature with your authenticated host before high-stakes use.

## Verification

```text
node --test factory.test.ts adapters.test.ts
```

Optional browser test, without adding a runtime dependency:

```text
FACTORY_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node --test dashboard.browser.test.mjs
```

`FACTORY_CHROMIUM` can select a local Chromium executable. Tests use temporary repositories and mocked worker/provider responses; they do not publish real PRs or incur model costs. GitHub Actions runs the integration and adapter tests on Linux and Windows.

## Adding a host later

`agent.ts` normalizes CLI events to `AgentOutput`; the runtime consumes `AgentRunner`, not host session objects. A new worker adapter maps launch options, events, permissions and costs to that contract. A new host command or skill dispatches to `cli.ts`. T3 uses this seam through its native provider-skill discovery rather than an invented headless T3 CLI.
