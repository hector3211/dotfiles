#!/usr/bin/env bash

verify_command() {
  local name="$1"
  local cmd="$2"

  if eval "$cmd" >/dev/null 2>&1; then
    printf '  [ok] %s\n' "$name"
  else
    printf '  [missing] %s\n' "$name"
  fi
}

verify_install() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "Skipping verification during dry-run"
    return
  fi

  log "Verification summary"
  verify_command git "command -v git"
  verify_command stow "command -v stow"
  verify_command zsh "command -v zsh"
  verify_command tmux "command -v tmux"
  verify_command nvim "command -v nvim"
  verify_command nvm "export NVM_DIR='$HOME/.nvm' && source '$HOME/.nvm/nvm.sh' && command -v nvm"
  verify_command node "export NVM_DIR='$HOME/.nvm' && source '$HOME/.nvm/nvm.sh' && command -v node"
  verify_command go "command -v go"
  verify_command ansible "command -v ansible"
  verify_command bun "command -v bun"
  verify_command opencode "command -v opencode"
  verify_command starship "command -v starship"
  verify_command wezterm "command -v wezterm"
  verify_command google-chrome "command -v google-chrome || command -v google-chrome-stable"
  verify_command flatpak "command -v flatpak"
  verify_command zen "flatpak info app.zen_browser.zen"
  verify_command docker "command -v docker"
  verify_command docker-compose-plugin "docker compose version"
}
