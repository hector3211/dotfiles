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

The canonical skill collection is `opencode/.config/opencode/skills/`. It combines the curated OpenCode skills with the enabled Claude Code skills.

This directory is exposed at:

- `~/.config/opencode/skills` for OpenCode (also managed by Stow on Linux)
- `~/.agents/skills` for Agent Skills-compatible harnesses such as Pi
- `~/.claude/skills` for Claude Code

Linux bootstrap configures the shared links automatically. On Windows, or to configure only skills without running the full bootstrap, run:

```bash
node scripts/link-skills.mjs
```

The script derives paths from its own repository location and the current user's home directory, so the checkout can live anywhere. It creates Windows junctions and Unix directory symlinks. It never replaces an existing real directory or a link with an unexpected target.

## Pi Configuration

Portable Pi agents, prompt templates, and the subagent extension live under `pi/.pi/agent/`. The committed `settings.json.example` defaults to `openai-codex/gpt-5.6-sol` with medium thinking. The `explore` subagent uses `openai-codex/gpt-5.6-luna` with high thinking for fast read-only code and web lookups.

Linux bootstrap runs the safe Pi resource linker automatically without linking the entire `~/.pi` directory. On Windows, or to configure only Pi, run:

```bash
node scripts/link-pi.mjs
```

The linker preserves an existing machine-local `~/.pi/agent/settings.json`, allowing platform-specific options such as Windows `shellPath`. If no settings file exists, it seeds one from the portable example. Authentication, sessions, installed packages, caches, logs, and generated model data are never linked into the repository.

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
