#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="/opt/tash8eel"
COMPOSE_FILE="docker-compose.prod.yml"
SERVICES=(api portal worker caddy)
REQUIRED_ENV=(REGISTRY IMAGE_TAG DOMAIN DATABASE_URL OPENAI_API_KEY ADMIN_API_KEY JWT_SECRET JWT_REFRESH_SECRET INTERNAL_API_KEY NEXTAUTH_SECRET NEXTAUTH_URL NEXT_PUBLIC_API_URL)

log_step() { printf '\n[STEP] %s\n' "$1"; }
log_ok() { printf '[OK] %s\n' "$1"; }
fail() { printf '[ERROR] %s\n' "$1" >&2; exit 1; }

service_status() {
  local service="$1"
  local cid
  cid="$(docker compose -f "${COMPOSE_FILE}" ps -q "${service}" || true)"
  if [ -z "${cid}" ]; then
    echo "missing"
    return
  fi
  docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${cid}" 2>/dev/null || echo "unknown"
}

ensure_required_env() {
  for key in "${REQUIRED_ENV[@]}"; do
    if ! grep -q "^${key}=" .env; then
      fail "Missing ${key} in .env"
    fi
    local value
    value="$(grep "^${key}=" .env | head -n1 | cut -d= -f2-)"
    if [ -z "${value}" ]; then
      fail "Empty ${key} in .env"
    fi
  done
}

log_step "Switching to deployment directory"
cd "${DEPLOY_DIR}" || fail "Deployment directory ${DEPLOY_DIR} does not exist"
log_ok "Working directory set to ${DEPLOY_DIR}"

log_step "Pulling latest code"
git pull origin main || fail "Failed to pull latest code"
log_ok "Latest code pulled"

log_step "Checking env requirements"
[ -f .env ] || fail ".env not found in ${DEPLOY_DIR}"
ensure_required_env
log_ok "Required env keys found"

log_step "Checking DNS resolution for ghcr.io"
getent hosts ghcr.io >/dev/null || fail "DNS cannot resolve ghcr.io. Check /etc/docker/daemon.json and host DNS."
log_ok "DNS resolution looks good"

log_step "Installing API dependencies for migration runner"
npm install --legacy-peer-deps --ignore-scripts --workspace packages/shared --workspace packages/agent-sdk --workspace apps/api
log_ok "API dependencies installed"

log_step "Running database migrations"
(cd apps/api && npm run db:migrate) || fail "Migration failed"
log_ok "Migrations completed"

log_step "Pulling deployment images"
docker compose -f "${COMPOSE_FILE}" pull || fail "Image pull failed. Ensure docker login ghcr.io succeeded and IMAGE_TAG exists."
log_ok "Images pulled"

log_step "Restarting services"
docker compose -f "${COMPOSE_FILE}" up -d --remove-orphans || fail "Failed to restart services"
log_ok "Services restarted"

log_step "Waiting for health checks"
sleep 10

deadline=$((SECONDS + 60))
all_healthy=false
while [ "${SECONDS}" -lt "${deadline}" ]; do
  all_healthy=true
  for service in "${SERVICES[@]}"; do
    status="$(service_status "${service}")"
    printf '[INFO] %s status: %s\n' "${service}" "${status}"
    case "${status}" in
      healthy|running) ;;
      *) all_healthy=false ;;
    esac
  done
  if [ "${all_healthy}" = true ]; then
    break
  fi
  sleep 5
done

if [ "${all_healthy}" != true ]; then
  printf '[ERROR] One or more containers are unhealthy.\n' >&2
  for service in "${SERVICES[@]}"; do
    status="$(service_status "${service}")"
    case "${status}" in
      healthy|running) ;;
      *)
        printf '[ERROR] Logs for %s (status: %s):\n' "${service}" "${status}" >&2
        docker compose -f "${COMPOSE_FILE}" logs --tail=200 "${service}" || true
        ;;
    esac
  done
  exit 1
fi

log_ok "All services are healthy"
echo "Portal: https://${DOMAIN}"
echo "API: https://api.${DOMAIN}"
