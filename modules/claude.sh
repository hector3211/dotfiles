#!/usr/bin/env bash

claude_resources_apply() {
  if skip_component claude; then
    log "Skipping Claude mods"
    return
  fi

  if ! have_cmd node; then
    warn "Node.js is required to link Claude mods"
    return
  fi

  run "node '$REPO_ROOT/scripts/link-claude.mjs'"
}
