#!/usr/bin/env bash
set -e
set -o pipefail

log_step() {
  printf '\n[STEP] %s\n' "$1"
}

log_ok() {
  printf '[OK] %s\n' "$1"
}

fail() {
  printf '[ERROR] %s\n' "$1" >&2
  exit 1
}

if [ "$(id -u)" -ne 0 ]; then
  fail "This script must be run as root."
fi

CURRENT_USER="${SUDO_USER:-${USER:-root}}"
if ! id "${CURRENT_USER}" >/dev/null 2>&1; then
  CURRENT_USER="root"
fi

log_step "Updating system packages"
apt-get update
apt-get upgrade -y
log_ok "System packages updated"

log_step "Installing Docker from the official script"
curl -fsSL https://get.docker.com | sh
usermod -aG docker "${CURRENT_USER}" || true
log_ok "Docker installed and docker group updated for ${CURRENT_USER}"

log_step "Installing Docker Compose plugin"
apt-get install -y docker-compose-plugin
docker compose version
log_ok "Docker Compose plugin installed"

log_step "Installing git"
apt-get install -y git
git --version
log_ok "Git installed"

log_step "Installing Node.js 20 via nvm for ${CURRENT_USER}"
cat >/tmp/install_nvm_20.sh <<'EOF'
#!/usr/bin/env bash
set -e
set -o pipefail
export NVM_DIR="$HOME/.nvm"
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
# shellcheck disable=SC1090
. "$NVM_DIR/nvm.sh"
nvm install 20
nvm use 20
nvm alias default 20
node -v
npm -v
EOF
chmod +x /tmp/install_nvm_20.sh

if [ "${CURRENT_USER}" = "root" ]; then
  bash /tmp/install_nvm_20.sh
else
  su - "${CURRENT_USER}" -c "bash /tmp/install_nvm_20.sh"
fi

rm -f /tmp/install_nvm_20.sh
log_ok "Node.js 20 installed via nvm"

log_step "Creating deployment directory"
mkdir -p /opt/tash8eel
cd /opt/tash8eel
log_ok "Deployment directory is ready at /opt/tash8eel"

log_step "Configuring firewall rules"
apt-get install -y ufw
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw deny 3000/tcp
ufw deny 3001/tcp
ufw --force enable
ufw status
log_ok "Firewall configured"

log_step "Creating deploy user and SSH directory"
if ! id deploy >/dev/null 2>&1; then
  useradd -m -s /bin/bash deploy
fi
usermod -aG docker deploy
mkdir -p /home/deploy/.ssh
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
log_ok "Deploy user prepared"

cat <<EOF

Setup complete.

Next steps:
1. Add your public key to /home/deploy/.ssh/authorized_keys and set permissions to 600.
2. Clone the repository into /opt/tash8eel.
3. Create /opt/tash8eel/.env from scripts/production.env.template.
4. Run scripts/deploy.sh as the deploy user.
5. Re-login to refresh group membership if needed: newgrp docker

EOF
