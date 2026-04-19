# Tash8eel VPS Deployment Guide (Contabo Ubuntu 22.04/24.04)

This guide deploys the full production stack:

- NestJS API
- Next.js Portal
- NestJS Worker
- Caddy reverse proxy with HTTPS

Prerequisites:

- Fresh Ubuntu VPS with root SSH access
- Domain DNS control (A records)
- Repository access

## STEP 1 — Connect to Server

```bash
ssh root@YOUR_SERVER_IP
```

## STEP 2 — Run Setup Script

Option A (recommended once the script is in your default branch):

```bash
curl -fsSL https://raw.githubusercontent.com/YOUR_REPO/main/scripts/setup-server.sh | bash
```

Option B (manual copy + run):

```bash
chmod +x scripts/setup-server.sh
sudo ./scripts/setup-server.sh
```

What this script does:

- Updates OS packages
- Installs Docker + Docker Compose plugin + git
- Installs Node.js 20 via nvm
- Creates `/opt/tash8eel`
- Configures UFW (22/80/443 allow, 3000/3001 deny)
- Creates `deploy` user and Docker group access

## STEP 3 — Clone the Repository

```bash
cd /opt
git clone https://github.com/YOUR_REPO/tash8eel.git
cd tash8eel
```

If `/opt/tash8eel` already exists from setup and is empty, you can clone directly into it:

```bash
git clone https://github.com/YOUR_REPO/tash8eel.git /opt/tash8eel
cd /opt/tash8eel
```

## STEP 4 — Create Production Env File

```bash
cp scripts/production.env.template .env
nano .env
```

Fill every value. Critical values you must set correctly first:

- `DOMAIN` (for Caddy TLS + routing)
- `REGISTRY`, `IMAGE_TAG` (compose image source)
- `DATABASE_URL`
- `REDIS_URL` (or Redis host/port/password)
- `OPENAI_API_KEY`
- `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ADMIN_API_KEY`, `INTERNAL_API_KEY`, `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`, `NEXT_PUBLIC_API_URL`, `CORS_ORIGINS`
- `META_ACCESS_TOKEN`, `META_APP_SECRET`, `META_PHONE_NUMBER_ID`, `META_WABA_ID`, `WEBHOOK_VERIFY_TOKEN`

Generate strong secrets:

```bash
openssl rand -hex 32
```

## STEP 5 — Point Your Domain

Create DNS A records:

- `@` -> `YOUR_SERVER_IP`
- `api` -> `YOUR_SERVER_IP`

Wait for DNS propagation before first TLS issuance.

## STEP 6 — Run Deployment

```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

The deployment script will:

- Pull latest `main`
- Install API deps for migration runner
- Run DB migrations
- Build and restart containers
- Check health for `api`, `portal`, `worker`, `caddy`
- Print public URLs

## STEP 7 — Verify Everything Works

API health check:

```bash
curl -fsS https://api.YOURDOMAIN.com/health
curl -fsS https://api.YOURDOMAIN.com/ready
```

Portal loads:

```bash
curl -I https://YOURDOMAIN.com
```

Admin dashboard route is reachable:

```bash
curl -I https://YOURDOMAIN.com/admin
```

Signup endpoint:

```bash
curl -X POST https://api.YOURDOMAIN.com/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "businessName": "Demo Merchant",
    "email": "owner@example.com",
    "password": "ChangeMe123!",
    "phone": "+201000000000"
  }'
```

WhatsApp webhook verification endpoint:

```bash
curl -G "https://api.YOURDOMAIN.com/api/v1/webhooks/meta/whatsapp" \
  --data-urlencode "hub.mode=subscribe" \
  --data-urlencode "hub.verify_token=YOUR_WEBHOOK_VERIFY_TOKEN" \
  --data-urlencode "hub.challenge=12345"
```

## STEP 8 — Setup Meta WhatsApp Webhook

In Meta Developer Console:

1. Open your app -> WhatsApp -> Configuration.
2. Set callback URL to:
   `https://api.YOURDOMAIN.com/api/v1/webhooks/meta/whatsapp`
3. Set verify token to exactly match `.env` value of `WEBHOOK_VERIFY_TOKEN`.
4. Subscribe to webhook fields/events needed by this stack:
   `messages`, `message_deliveries`, `message_reads`

## STEP 9 — End-to-End Tests (PowerShell + curl)

PowerShell tests:

```powershell
# API health
Invoke-WebRequest -Uri "https://api.YOURDOMAIN.com/health" -Method GET

# Portal homepage
Invoke-WebRequest -Uri "https://YOURDOMAIN.com" -Method GET

# Admin route (expect 200/302 depending auth state)
Invoke-WebRequest -Uri "https://YOURDOMAIN.com/admin" -Method GET

# Signup test
$body = @{
  businessName = "Demo Merchant"
  email = "owner@example.com"
  password = "ChangeMe123!"
  phone = "+201000000000"
} | ConvertTo-Json

Invoke-WebRequest -Uri "https://api.YOURDOMAIN.com/api/v1/auth/signup" -Method POST -ContentType "application/json" -Body $body

# Meta webhook verify handshake simulation
Invoke-WebRequest -Uri "https://api.YOURDOMAIN.com/api/v1/webhooks/meta/whatsapp?hub.mode=subscribe&hub.verify_token=YOUR_WEBHOOK_VERIFY_TOKEN&hub.challenge=12345" -Method GET
```

curl tests:

```bash
curl -fsS https://api.YOURDOMAIN.com/health
curl -I https://YOURDOMAIN.com
curl -I https://YOURDOMAIN.com/admin

curl -X POST https://api.YOURDOMAIN.com/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"businessName":"Demo Merchant","email":"owner@example.com","password":"ChangeMe123!","phone":"+201000000000"}'

curl -G "https://api.YOURDOMAIN.com/api/v1/webhooks/meta/whatsapp" \
  --data-urlencode "hub.mode=subscribe" \
  --data-urlencode "hub.verify_token=YOUR_WEBHOOK_VERIFY_TOKEN" \
  --data-urlencode "hub.challenge=12345"
```

## STEP 10 — Ongoing Deployment Workflow

Every new release:

```bash
ssh deploy@YOUR_SERVER_IP
cd /opt/tash8eel
./scripts/deploy.sh
```

Recommended post-deploy quick checks:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=100 api
docker compose -f docker-compose.prod.yml logs --tail=100 worker
docker compose -f docker-compose.prod.yml logs --tail=100 portal
docker compose -f docker-compose.prod.yml logs --tail=100 caddy
```
