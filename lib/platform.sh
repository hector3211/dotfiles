#!/usr/bin/env bash

detect_platform() {
  [[ -r /etc/os-release ]] || die "This script currently supports Linux hosts with /etc/os-release"
  # shellcheck disable=SC1091
  source /etc/os-release
  DISTRO_ID="$ID"
  DISTRO_LIKE="${ID_LIKE:-}"

  case "$ID" in
    ubuntu|debian)
      PKG_MANAGER="apt"
      ;;
    fedora)
      PKG_MANAGER="dnf"
      ;;
    *)
      if [[ " $DISTRO_LIKE " == *" debian "* ]]; then
        PKG_MANAGER="apt"
      elif [[ " $DISTRO_LIKE " == *" fedora "* ]] || [[ " $DISTRO_LIKE " == *" rhel "* ]]; then
        PKG_MANAGER="dnf"
      else
        die "Unsupported distro: $ID"
      fi
      ;;
  esac
}
