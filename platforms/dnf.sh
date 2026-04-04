#!/usr/bin/env bash

dnf_install() {
  sudo_run "dnf install -y $*"
}

dnf_setup_docker_repo() {
  if [[ -f /etc/yum.repos.d/docker-ce.repo ]]; then
    return
  fi

  sudo_run "dnf config-manager addrepo --from-repofile=https://download.docker.com/linux/fedora/docker-ce.repo"
}
