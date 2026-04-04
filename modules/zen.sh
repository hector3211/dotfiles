#!/usr/bin/env bash

zen_ensure_flathub() {
  if [[ "$DRY_RUN" -eq 1 ]] && ! have_cmd flatpak; then
    log "Flatpak not present during dry-run; skipping flathub check"
    return
  fi

  if flatpak remote-list | grep -q '^flathub\b'; then
    return
  fi

  sudo_run "flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo"
}

zen_install() {
  if [[ "$PROFILE" != "full" ]] || skip_component zen; then
    log "Skipping zen"
    return
  fi

  zen_ensure_flathub

  if flatpak info app.zen_browser.zen >/dev/null 2>&1; then
    log "Zen Browser already installed"
    return
  fi

  sudo_run "flatpak install -y flathub app.zen_browser.zen"
}
