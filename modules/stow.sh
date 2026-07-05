#!/usr/bin/env bash

stow_apply() {
  local packages=(zsh tmux starship nvim opencode herdr)

  if skip_component stow; then
    log "Skipping stow"
    return
  fi

  if [[ "$PROFILE" == "full" ]]; then
    packages+=(wezterm)
  fi

  run "stow --dir '$REPO_ROOT' --target '$HOME' --restow ${packages[*]}"
}
