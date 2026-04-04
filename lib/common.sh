#!/usr/bin/env bash

log() {
  printf '[bootstrap] %s\n' "$*"
}

warn() {
  printf '[bootstrap] warning: %s\n' "$*" >&2
}

die() {
  printf '[bootstrap] error: %s\n' "$*" >&2
  exit 1
}

run() {
  log "+ $*"
  if [[ "$DRY_RUN" -eq 0 ]]; then
    eval "$*"
  fi
}

sudo_run() {
  run "sudo $*"
}

write_root_file() {
  local path="$1"
  local content="$2"

  log "+ write $path"
  if [[ "$DRY_RUN" -eq 0 ]]; then
    printf '%s\n' "$content" | sudo tee "$path" >/dev/null
  fi
}

have_cmd() {
  command -v "$1" >/dev/null 2>&1
}

skip_component() {
  local name="$1"
  local item
  IFS=',' read -r -a items <<<"$SKIP_CSV"
  for item in "${items[@]}"; do
    if [[ -n "$item" && "$item" == "$name" ]]; then
      return 0
    fi
  done
  return 1
}
