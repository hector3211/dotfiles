#!/usr/bin/env bash

factory_resources_apply() {
  if skip_component factory; then
    log "Skipping software factory"
    return
  fi
  if ! have_cmd node; then
    warn "Node.js 24+ is required to link the software factory"
    return
  fi
  if ! have_cmd npm; then
    warn "npm is required to install the Factory observer's pinned Effect dependencies"
    return
  fi
  run "npm --prefix '$REPO_ROOT/agents/.agents/factory' ci --omit=dev --ignore-scripts"
  run "node '$REPO_ROOT/agents/.agents/factory/install.mjs'"
}
