#!/usr/bin/env bash

pi_resources_apply() {
  if skip_component pi; then
    log "Skipping Pi resources"
    return
  fi

  if ! have_cmd node; then
    warn "Node.js is required to link Pi resources"
    return
  fi

  run "node '$REPO_ROOT/scripts/link-pi.mjs'"
}
