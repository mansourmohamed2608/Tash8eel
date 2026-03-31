# Final Deployment Package Summary

This folder contains a self-contained deployment package for production VPS rollout.

## Included files

- setup-server.sh: one-time server bootstrap (docker, compose, firewall, docker DNS)
- deploy.sh: pull latest code, validate env, run migrations, pull images, restart and health-check services
- production.env.template: minimal production env template with required keys
- DEPLOYMENT_GUIDE.md: step-by-step runbook for setup, deploy, and troubleshooting

## Expected run location

All commands assume the repository path is:

- /opt/tash8eel

## Current image strategy

- Registry: ghcr.io/<owner>
- Tag: set IMAGE_TAG to the commit SHA that exists in GHCR

## Notes

- If ghcr.io times out, fix Docker DNS in /etc/docker/daemon.json and restart Docker.
- If pull says manifest unknown, set IMAGE_TAG to a tag that exists in GHCR and retry.
