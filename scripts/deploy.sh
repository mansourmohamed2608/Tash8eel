#!/usr/bin/env bash
set -e
set -o pipefail

DEPLOY_DIR="/opt/tash8eel"
COMPOSE_FILE="docker-compose.prod.yml"
SERVICES=(api portal worker caddy)

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

service_status() {
  local service="$1"
  local container_id

  container_id="$(docker compose -f "${COMPOSE_FILE}" ps -q "${service}")"
  if [ -z "${container_id}" ]; then
    echo "missing"
    return
  fi

  docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container_id}" 2>/dev/null || echo "unknown"
}

log_step "Switching to deployment directory"
cd "${DEPLOY_DIR}" || fail "Deployment directory ${DEPLOY_DIR} does not exist"
log_ok "Working directory set to ${DEPLOY_DIR}"

log_step "Validating deployment environment"
[ -f .env ] || fail "Missing .env file in ${DEPLOY_DIR}"

if grep -Eiq '^API_BASE_URL=(https?://)?(localhost|127\.0\.0\.1|::1|\[::1\])(:[0-9]+)?/?$' .env; then
  fail "API_BASE_URL points to loopback in .env. Use API_BASE_URL=http://api:3000 for container networking."
fi

if grep -Eiq '^NEXT_PUBLIC_API_URL=(https?://)?(localhost|127\.0\.0\.1|::1|\[::1\])(:[0-9]+)?/?$' .env; then
  fail "NEXT_PUBLIC_API_URL points to loopback in .env. Use your public host/IP or leave it empty to use portal proxy routes."
fi

log_ok "Deployment environment variables validated"

log_step "Pulling latest code"
if ! git pull origin main; then
  fail "Failed to pull latest code"
fi
log_ok "Latest code pulled"

log_step "Installing API dependencies for migration runner"
npm install --legacy-peer-deps --ignore-scripts --workspace packages/shared --workspace packages/agent-sdk --workspace apps/api
log_ok "API dependencies installed"

log_step "Running database migrations"
if ! (cd apps/api && npm run db:migrate); then
  fail "Migration failed - deployment aborted"
fi
log_ok "Migrations completed"

log_step "Building and restarting services"
if ! docker compose -f "${COMPOSE_FILE}" build --no-cache; then
  fail "Build failed"
fi
if ! docker compose -f "${COMPOSE_FILE}" up -d; then
  fail "Failed to restart services"
fi
log_ok "Services restarted"

log_step "Waiting for health checks"
sleep 10
docker compose -f "${COMPOSE_FILE}" ps

deadline=$((SECONDS + 30))
all_healthy=false

while [ "${SECONDS}" -lt "${deadline}" ]; do
  all_healthy=true

  for service in "${SERVICES[@]}"; do
    status="$(service_status "${service}")"
    printf '[INFO] %s status: %s\n' "${service}" "${status}"

    case "${status}" in
      healthy|running)
        ;;
      *)
        all_healthy=false
        ;;
    esac
  done

  if [ "${all_healthy}" = true ]; then
    break
  fi

  sleep 5
done

if [ "${all_healthy}" != true ]; then
  printf '[ERROR] One or more containers are unhealthy after 30 seconds.\n' >&2
  for service in "${SERVICES[@]}"; do
    status="$(service_status "${service}")"
    case "${status}" in
      healthy|running)
        ;;
      *)
        printf '[ERROR] Logs for %s (status: %s):\n' "${service}" "${status}" >&2
        docker compose -f "${COMPOSE_FILE}" logs --tail=200 "${service}" || true
        ;;
    esac
  done
  exit 1
fi

log_ok "All services are healthy"

log_step "Printing public URLs"
echo "API: https://api.${DOMAIN:-YOUR_DOMAIN}"
echo "Portal: https://${DOMAIN:-YOUR_DOMAIN}"
log_ok "Public URL output complete"

log_step "Cleaning old Docker images"
docker image prune -f
log_ok "Image cleanup complete"

echo "Deployment completed successfully."
