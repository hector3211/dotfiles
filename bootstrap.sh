#!/usr/bin/env bash
set -euo pipefail

PROFILE="full"
DRY_RUN=0
DOCKER_GROUP=0
SKIP_CSV=""
REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APT_UPDATED=0

source "$REPO_ROOT/lib/common.sh"
source "$REPO_ROOT/lib/args.sh"
source "$REPO_ROOT/lib/platform.sh"
source "$REPO_ROOT/platforms/apt.sh"
source "$REPO_ROOT/platforms/dnf.sh"
source "$REPO_ROOT/modules/base.sh"
source "$REPO_ROOT/modules/node.sh"
source "$REPO_ROOT/modules/bun.sh"
source "$REPO_ROOT/modules/opencode.sh"
source "$REPO_ROOT/modules/wezterm.sh"
source "$REPO_ROOT/modules/chrome.sh"
source "$REPO_ROOT/modules/zen.sh"
source "$REPO_ROOT/modules/docker.sh"
source "$REPO_ROOT/modules/stow.sh"
source "$REPO_ROOT/modules/verify.sh"

main() {
  parse_args "$@"
  detect_platform

  log "Detected package manager: $PKG_MANAGER"
  base_install
  starship_install
  node_install
  bun_install
  opencode_install
  wezterm_install
  chrome_install
  zen_install
  docker_install
  stow_apply
  opencode_seed_config
  verify_install

  warn "OpenCode still needs provider auth or /connect after bootstrap."
}

main "$@"
