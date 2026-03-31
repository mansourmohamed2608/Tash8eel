# Deployment Guide (Contabo VPS)

## 1) Server setup (run once)

```bash
sudo bash deployment/setup-server.sh
```

## 2) Clone repository

```bash
cd /opt
git clone https://github.com/mansourmohamed2608/Tash8eel.git tash8eel
cd /opt/tash8eel
```

## 3) Configure env

```bash
cp deployment/production.env.template .env
nano .env
```

Minimum required values:

- REGISTRY
- IMAGE_TAG
- DOMAIN
- DATABASE_URL
- OPENAI_API_KEY
- ADMIN_API_KEY
- JWT_SECRET
- JWT_REFRESH_SECRET
- INTERNAL_API_KEY
- NEXTAUTH_SECRET
- NEXTAUTH_URL
- NEXT_PUBLIC_API_URL

## 4) Authenticate to GHCR

```bash
docker login ghcr.io
```

## 5) Deploy

```bash
bash deployment/deploy.sh
```

## 6) Useful checks

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=200 api
docker compose -f docker-compose.prod.yml logs --tail=200 worker
docker compose -f docker-compose.prod.yml logs --tail=200 portal
```

## 7) DNS troubleshooting for ghcr.io

If image pull fails with DNS timeout:

```bash
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json >/dev/null <<'EOF'
{
  "dns": ["1.1.1.1", "8.8.8.8"]
}
EOF
sudo systemctl restart docker
```

Then retry:

```bash
docker pull ghcr.io/mansourmohamed2608/worker:${IMAGE_TAG}
```
