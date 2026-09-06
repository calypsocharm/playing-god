#!/usr/bin/env bash
# Hourly self-update: pull main, reinstall if dependencies changed, restart. Data is untouched.
set -euo pipefail
APP_DIR="/opt/playing-god"
cd "$APP_DIR"
before="$(git rev-parse HEAD)"
git fetch -q origin main
after="$(git rev-parse origin/main)"
[ "$before" = "$after" ] && exit 0
echo "$(date -Is) updating $before -> $after"
git reset -q --hard origin/main
if ! git diff --quiet "$before" "$after" -- package.json package-lock.json; then
  npm ci --omit=dev --no-audit --no-fund
fi
pm2 restart playing-god --update-env >/dev/null
echo "$(date -Is) live at $after"
