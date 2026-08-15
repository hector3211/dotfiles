#!/usr/bin/env bash

shared_skills_apply() {
  if skip_component skills; then
    log "Skipping shared skills"
    return
  fi

  if ! have_cmd node; then
    warn "Node.js is required to link shared skills"
    return
  fi

  run "node '$REPO_ROOT/scripts/link-skills.mjs'"
}
