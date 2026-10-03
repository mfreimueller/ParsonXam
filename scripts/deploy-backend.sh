#!/usr/bin/env bash
# Builds the API and ships it to the server, then restarts the service.
# First-time server setup is described in docs/deployment.md.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

REMOTE_DIR="parsonxam-backend"   # relative to the remote home directory
SERVICE="parsonxam-backend"

echo "==> Checking and building the backend"
cd "$ROOT/backend"
npm ci
npm run lint
npm test
npm run build

echo "==> Uploading dist/ and package files"
rsync -az --delete "$ROOT/backend/dist/" "$TARGET:$REMOTE_DIR/dist/"
rsync -az "$ROOT/backend/package.json" "$ROOT/backend/package-lock.json" "$TARGET:$REMOTE_DIR/"

echo "==> Installing production dependencies on the server"
ssh "$TARGET" "cd $REMOTE_DIR && npm ci --omit=dev"

echo "==> Restarting $SERVICE"
ssh "$TARGET" "supervisorctl restart $SERVICE"

echo "==> Done. Check: curl https://$DOMAIN/api/health"
