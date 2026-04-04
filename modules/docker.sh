#!/usr/bin/env bash

docker_install() {
  if [[ "$PROFILE" != "full" ]] || skip_component docker; then
    log "Skipping docker"
    return
  fi

  if have_cmd docker && docker compose version >/dev/null 2>&1; then
    log "Docker and docker compose already installed"
  else
    if [[ "$PKG_MANAGER" == "apt" ]]; then
      apt_setup_docker_repo
      apt_install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    else
      dnf_setup_docker_repo
      dnf_install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
      sudo_run "systemctl enable --now docker"
    fi
  fi

  if [[ "$DOCKER_GROUP" -eq 1 ]]; then
    sudo_run "groupadd -f docker"
    sudo_run "usermod -aG docker $USER"
    warn "Added $USER to the docker group. Log out and back in before using docker without sudo."
  fi
}
