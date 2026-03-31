#!/usr/bin/env bash
set -euo pipefail

log_step() { printf '\n[STEP] %s\n' "$1"; }
log_ok() { printf '[OK] %s\n' "$1"; }
fail() { printf '[ERROR] %s\n' "$1" >&2; exit 1; }

if [ "$(id -u)" -ne 0 ]; then
  fail "Run this script as root (sudo)."
fi

DEPLOY_DIR="/opt/tash8eel"
DEPLOY_USER="deploy"

log_step "Updating apt index"
apt-get update -y
log_ok "Apt index updated"

log_step "Installing base tools"
apt-get install -y ca-certificates curl gnupg lsb-release git ufw
log_ok "Base tools installed"

log_step "Installing Docker and Compose"
if ! apt-get install -y docker.io docker-compose-v2; then
  apt-get install -y docker.io docker-compose-plugin
fi
systemctl enable docker
systemctl restart docker
log_ok "Docker engine and compose installed"

log_step "Hardening Docker DNS to avoid ghcr.io lookup timeouts"
mkdir -p /etc/docker
cat >/etc/docker/daemon.json <<'EOF'
{
  "dns": ["1.1.1.1", "8.8.8.8"]
}
EOF
systemctl restart docker
log_ok "Docker DNS configured"

log_step "Preparing deploy directory"
mkdir -p "${DEPLOY_DIR}"
log_ok "Deploy directory ready at ${DEPLOY_DIR}"

log_step "Preparing deploy user"
if ! id "${DEPLOY_USER}" >/dev/null 2>&1; then
  useradd -m -s /bin/bash "${DEPLOY_USER}"
fi
usermod -aG docker "${DEPLOY_USER}"
log_ok "Deploy user prepared and added to docker group"

log_step "Configuring firewall"
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
log_ok "Firewall configured"

cat <<'EOF'

Setup complete.

Next steps:
1. Clone repo into /opt/tash8eel
2. Copy deployment/production.env.template to /opt/tash8eel/.env and fill values
3. Run: /opt/tash8eel/deployment/deploy.sh

EOF
