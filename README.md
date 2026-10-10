# dotfiles

Bootstrap a fresh Ubuntu/Debian or Fedora machine with one script, then apply the tracked shell, editor, terminal, and OpenCode config with GNU Stow.

## Quickstart

```bash
git clone https://github.com/hector3211/dotfiles.git "$HOME/dotfiles"
cd "$HOME/dotfiles"
chmod +x bootstrap.sh
./bootstrap.sh
```

If you want to preview the work first:

```bash
./bootstrap.sh --dry-run
```

## Supported Platforms

- Ubuntu and Debian-derived systems through `apt`
- Fedora and Fedora-derived systems through `dnf`

The current script targets personal workstation bootstrap, not headless server provisioning.

## Profiles

The default profile is `full`, so running `./bootstrap.sh` with no flags installs the full workstation setup.

- `full`: core CLI tools, GUI apps, Docker tooling, dotfiles, and OpenCode template seeding
- `core`: CLI/dev baseline without GUI apps or Docker

Examples:

```bash
./bootstrap.sh
./bootstrap.sh --profile core
./bootstrap.sh --skip chrome,zen
./bootstrap.sh --docker-group
```

## What Gets Installed

Base CLI and build tools:

- `git`
- `curl`
- `stow`
- `zsh`
- `tmux`
- `neovim`
- `ripgrep`
- `fd`
- `jq`
- `fzf`
- `make`
- compiler/build tools
- `zip`
- `unzip`

Language and automation tooling:

- `golang`
- `ansible`
- `nvm`
- the current Node.js LTS through `nvm`
- `bun`

Terminal and coding tools:

- `starship`
- `opencode`
- `wezterm`

Desktop apps:

- `google-chrome`
- `zen` from Flathub using Flatpak

Container tooling:

- `docker`
- `docker compose` via the Compose plugin

## Dotfiles Applied With Stow

Managed packages in this repo:

- `zsh`
- `tmux`
- `wezterm`
- `starship`
- `nvim`
- `opencode`
- `herdr`

The bootstrap applies them with GNU Stow using `--restow`.

If an existing file conflicts with a symlink target, Stow stops and shows the conflict instead of overwriting it silently.

## Shared AI Skills

The canonical skill collection is `opencode/.config/opencode/skills/`. It contains the audited shared skill snapshot, including all 38 current Matt Pocock skills, the AWS collection, and curated OpenCode/Cloudflare skills. `opencode/skills-sources.json` records tracked upstream sources and explicitly lists skills without installation provenance; it is not a Skills CLI lockfile.

The October 2026 cleanup removed `to-issues` and `design-an-interface`, replaced `creating-ec2-image-builder-pipeline` with `amazon-ec2-image-builder`, and refreshed `aws-amplify`. The orphaned `using-superpowers` skill is not included (the separate Claude plugin is unaffected). Terraform is bundled as portable skill files rather than a machine-specific symlink. Other older skills were retained, not automatically upgraded.

This directory is exposed at:

- `~/.config/opencode/skills` for OpenCode (also managed by Stow on Linux)
- `~/.agents/skills` for Agent Skills-compatible harnesses such as Pi
- `~/.claude/skills` for Claude Code

Linux bootstrap configures the shared links automatically. On Windows, or to configure only skills without running the full bootstrap, run:

```bash
node scripts/link-skills.mjs
```

The script derives paths from its own repository location and the current user's home directory, so the checkout can live anywhere. It creates Windows junctions and Unix directory symlinks. It never replaces an existing real directory or a link with an unexpected target.

## Claude Code Mods

The local mods are tracked under `claude/mods/`:

- **`cache-meter`**: cache warmth/countdown, model/effort, cache-hit rate, token totals, and context usage above the prompt, with terminal and Desktop layouts. `/cache-meter` toggles it. Configurable auto-compaction defaults to 290k context tokens, retries while busy, and avoids repeated notifications.
- **`ticket-timer`**: `/ticket <number>` starts a ConnectWise ticket clock; `pause`, `resume`, and `stop` manage it. Stopping returns rounded billable hours and a generated time-entry note. See [ticket-timer documentation](claude/mods/ticket-timer/README.md) for persistence and prompt capture.

Bootstrap links both mods and merges their paths into Claude's `env.CLAUDE_CODE_PLUGIN_DIRS`. To configure only the mods:

```bash
node scripts/link-claude.mjs
```

Validate the linker and mod with:

```bash
node --test scripts/link-claude.test.mjs
claude plugin test claude/mods/cache-meter
claude plugin test claude/mods/ticket-timer
```

The linker preserves existing local mods and unrelated settings, backs up settings before changing them, and does not copy credentials, sessions, or generated development-mod caches. Restart Claude Code afterwards. This requires a Claude Code build supporting local mods; the script does not install or upgrade Claude. Claude supplies the generated `.claude-plugin/types/` used by the mod's TypeScript configuration and the `claude-code/testing` test runner. Use `--skip claude` to opt out during bootstrap.

## Pi Configuration

Portable Pi agents, prompt templates, and the subagent extension live under `pi/.pi/agent/`. The committed `settings.json.example` defaults to `openai-codex/gpt-5.6-sol` with medium thinking. The implementation, planning, review, security, and TDD subagents use `openai-codex/gpt-6.1-sol`. The `explore` and `general` subagents use `openai-codex/gpt-6-luna`, with medium and high thinking respectively. Both run through Pi rather than OpenCode.

Linux bootstrap runs the safe Pi resource linker automatically without linking the entire `~/.pi` directory. On Windows, or to configure only Pi, run:

```bash
node scripts/link-pi.mjs
```

The linker preserves an existing machine-local `~/.pi/agent/settings.json`, allowing platform-specific options such as Windows `shellPath`. If no settings file exists, it seeds one from the portable example. Authentication, sessions, installed packages, caches, logs, and generated model data are never linked into the repository.

## Software Factory

The shared local factory lives under `agents/.agents/factory/` and is linked as `~/.agents/factory`. It provides `/factory` adapters for Pi, OpenCode, and Claude Code, a shared skill for T3 Code's Codex/Claude providers, isolated feature worktrees, autonomous verification/repair, and a localhost HTML dashboard. All existing skills remain untouched.

Linux bootstrap installs the links. To install only the factory on Linux or Windows (Node.js 24+ and Git required):

```bash
node agents/.agents/factory/install.mjs
```

Reload your agent client, then run `/factory help` or `/factory <feature>` inside a trusted Git repository. Work mode requires a human merge; personal mode can merge under explicit policy. Per-project `.factory/` records are ignored, and runtime state stays outside dotfiles. See [factory documentation](agents/.agents/factory/README.md) for permissions, current limitations, and tests. Use `--skip factory` to opt out during bootstrap.

## OpenCode Config

`bootstrap.sh` seeds `~/.config/opencode/opencode.json` from `opencode/.config/opencode/opencode.json.example` only when the real config file does not already exist.

After bootstrap you still need to:

- run `/connect` in OpenCode, or
- add your provider credentials manually, and
- add any private MCP tokens or machine-specific config you do not want committed

## Docker Note

`--docker-group` adds your user to the `docker` group after installation.

Example:

```bash
./bootstrap.sh --docker-group
```

That usually requires logging out and back in before `docker` works without `sudo`.

## Notes

- Zen Browser is installed from Flathub via Flatpak.
- Chrome is installed from Google's Linux package.
- WezTerm uses the distro-native install path for Fedora and an apt repo on Debian/Ubuntu.
- `bun`, `starship`, and `nvm` are installed from their official upstream install scripts.
