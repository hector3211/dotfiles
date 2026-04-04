#!/usr/bin/env bash

chrome_install() {
  local tmpfile

  if [[ "$PROFILE" != "full" ]] || skip_component chrome; then
    log "Skipping chrome"
    return
  fi

  if have_cmd google-chrome || have_cmd google-chrome-stable; then
    log "Google Chrome already installed"
    return
  fi

  tmpfile="$(mktemp)"

  if [[ "$PKG_MANAGER" == "apt" ]]; then
    run "curl -fsSL https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb -o $tmpfile"
    apt_install "$tmpfile"
  else
    run "curl -fsSL https://dl.google.com/linux/direct/google-chrome-stable_current_x86_64.rpm -o $tmpfile"
    dnf_install "$tmpfile"
  fi

  run "rm -f $tmpfile"
}
