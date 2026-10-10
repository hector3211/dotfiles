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
  run "node '$REPO_ROOT/agents/.agents/factory/install.mjs'"
}
