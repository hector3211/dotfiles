#!/usr/bin/env bash

usage() {
  cat <<'EOF'
Usage: ./bootstrap.sh [options]

Options:
  --profile <full|core>  Install profile to run. Default: full
  --skip <a,b,c>         Skip named components (bun, nvm, opencode, wezterm, chrome, zen, docker, stow)
  --docker-group         Add the current user to the docker group after install
  --dry-run              Print commands without executing them
  -h, --help             Show this help text
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --profile)
        [[ $# -ge 2 ]] || die "--profile requires a value"
        PROFILE="$2"
        shift 2
        ;;
      --skip)
        [[ $# -ge 2 ]] || die "--skip requires a comma-separated value"
        SKIP_CSV="$2"
        shift 2
        ;;
      --docker-group)
        DOCKER_GROUP=1
        shift
        ;;
      --dry-run)
        DRY_RUN=1
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        die "Unknown option: $1"
        ;;
    esac
  done

  case "$PROFILE" in
    full|core) ;;
    *) die "Unsupported profile: $PROFILE" ;;
  esac
}
