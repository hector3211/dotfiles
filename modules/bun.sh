#!/usr/bin/env bash

bun_install() {
  if skip_component bun; then
    log "Skipping bun"
    return
  fi

  if have_cmd bun; then
    log "Bun already installed"
  else
    run "curl -fsSL https://bun.sh/install | bash"
  fi

  export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
  export PATH="$BUN_INSTALL/bin:$PATH"
}
