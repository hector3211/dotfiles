#!/usr/bin/env bash

wezterm_install() {
  if [[ "$PROFILE" != "full" ]] || skip_component wezterm; then
    log "Skipping wezterm"
    return
  fi

  if have_cmd wezterm; then
    log "WezTerm already installed"
    return
  fi

  if [[ "$PKG_MANAGER" == "apt" ]]; then
    apt_setup_wezterm_repo
    apt_install wezterm
  else
    dnf_install wezterm
  fi
}
