#!/usr/bin/env bash

opencode_install() {
  if skip_component opencode; then
    log "Skipping opencode"
    return
  fi

  bun_install
  export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
  export PATH="$BUN_INSTALL/bin:$PATH"

  if have_cmd opencode; then
    log "OpenCode already installed"
    return
  fi

  run "bun install -g opencode-ai"
}

opencode_seed_config() {
  local config_dir="$HOME/.config/opencode"
  local target_file="$config_dir/opencode.json"
  local template="$REPO_ROOT/opencode/.config/opencode/opencode.json.example"

  if skip_component opencode; then
    return
  fi

  [[ -f "$template" ]] || die "Missing OpenCode config template: $template"

  run "mkdir -p '$config_dir'"
  if [[ -f "$target_file" ]]; then
    log "Keeping existing OpenCode config"
    return
  fi

  run "cp '$template' '$target_file'"
  warn "Seeded $target_file from the example template. Add your provider auth and private MCP tokens manually."
}
