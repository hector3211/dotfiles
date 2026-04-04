#!/usr/bin/env bash

apt_update() {
  if [[ "$APT_UPDATED" -eq 0 ]]; then
    sudo_run "apt update"
    APT_UPDATED=1
  fi
}

apt_install() {
  apt_update
  sudo_run "DEBIAN_FRONTEND=noninteractive apt install -y $*"
}

apt_setup_wezterm_repo() {
  local keyring="/usr/share/keyrings/wezterm-fury.gpg"
  local source_file="/etc/apt/sources.list.d/wezterm.list"

  if [[ ! -f "$keyring" ]]; then
    sudo_run "curl -fsSL https://apt.fury.io/wez/gpg.key | gpg --yes --dearmor -o $keyring"
  fi

  if [[ ! -f "$source_file" ]]; then
    write_root_file "$source_file" "deb [signed-by=$keyring] https://apt.fury.io/wez/ * *"
  fi

  APT_UPDATED=0
}

apt_setup_docker_repo() {
  local keyring_dir="/etc/apt/keyrings"
  local keyring="$keyring_dir/docker.asc"
  local source_file="/etc/apt/sources.list.d/docker.sources"
  local arch codename

  arch="$(dpkg --print-architecture)"
  # shellcheck disable=SC1091
  source /etc/os-release
  codename="${UBUNTU_CODENAME:-$VERSION_CODENAME}"

  sudo_run "install -m 0755 -d $keyring_dir"
  if [[ ! -f "$keyring" ]]; then
    sudo_run "curl -fsSL https://download.docker.com/linux/$DISTRO_ID/gpg -o $keyring"
    sudo_run "chmod a+r $keyring"
  fi

  if [[ ! -f "$source_file" ]]; then
    write_root_file "$source_file" "Types: deb
URIs: https://download.docker.com/linux/$DISTRO_ID
Suites: $codename
Components: stable
Architectures: $arch
Signed-By: $keyring"
  fi

  APT_UPDATED=0
}
