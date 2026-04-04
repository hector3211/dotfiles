#!/usr/bin/env bash

base_install() {
  log "Installing base packages for profile '$PROFILE'"

  if [[ "$PKG_MANAGER" == "apt" ]]; then
    apt_install \
      ca-certificates curl gnupg stow zsh tmux neovim ripgrep fd-find jq fzf \
      make gcc g++ unzip zip flatpak golang ansible build-essential
  else
    dnf_install \
      ca-certificates curl dnf-plugins-core stow zsh tmux neovim ripgrep jq fzf \
      make gcc gcc-c++ unzip zip flatpak golang ansible

    if ! rpm -q fd-find >/dev/null 2>&1 && ! rpm -q fd >/dev/null 2>&1; then
      if sudo dnf install -y fd-find >/dev/null 2>&1; then
        log "Installed fd-find"
      else
        dnf_install fd
      fi
    fi
  fi
}

starship_install() {
  if have_cmd starship; then
    log "Starship already installed"
    return
  fi

  run "curl -fsSL https://starship.rs/install.sh | sh -s -- -y"
}
