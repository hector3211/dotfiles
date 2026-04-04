#!/usr/bin/env bash

node_load_nvm() {
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"

  if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    # shellcheck disable=SC1090
    source "$NVM_DIR/nvm.sh"
    return 0
  fi

  return 1
}

node_install() {
  if skip_component nvm; then
    log "Skipping nvm"
    return
  fi

  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"

  if node_load_nvm; then
    log "nvm already installed"
  else
    run "PROFILE=/dev/null curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash"
    if [[ "$DRY_RUN" -eq 1 ]]; then
      return
    fi
    node_load_nvm || die "nvm installed but could not be loaded"
  fi

  run "source '$NVM_DIR/nvm.sh' && nvm install --lts && nvm alias default 'lts/*'"
}
