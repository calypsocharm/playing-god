#!/usr/bin/env bash
# ClawKeep · Playing God — first-time setup on box 2 (host nginx, certbot nginx authenticator).
# Paste once into the server's terminal as root:
#   curl -fsSL https://raw.githubusercontent.com/calypsocharm/playing-god/main/deploy/server-setup.sh | bash
# Idempotent: safe to run again. Never edits files under /opt/playing-god by hand afterwards;
# update.sh resets to origin/main.
set -euo pipefail
trap 'echo "!! setup failed at line $LINENO: $BASH_COMMAND" >&2' ERR

DOMAIN="${DOMAIN:-clawkeep.io}"
APP_DIR="/opt/playing-god"
REPO="https://github.com/calypsocharm/playing-god.git"
PORT="${PORT:-3340}"
PM2_NAME="playing-god"

echo "== ClawKeep · Playing God setup for ${DOMAIN} on port ${PORT} =="

# 1. Node and pm2
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  echo "-- installing Node 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
command -v pm2 >/dev/null 2>&1 || npm install -g pm2

# 2. Code
if [ -d "$APP_DIR/.git" ]; then
  echo "-- updating existing checkout"
  git -C "$APP_DIR" fetch -q origin && git -C "$APP_DIR" reset -q --hard origin/main
else
  echo "-- cloning"
  git clone -q "$REPO" "$APP_DIR"
fi
cd "$APP_DIR"
npm ci --omit=dev --no-audit --no-fund
mkdir -p data
echo "-- installed"

# 3. The Creator password: minted here, once, never in the repo.
if [ ! -f "$APP_DIR/.god_token" ]; then
  ( openssl rand -hex 10 2>/dev/null || head -c 200 /dev/urandom | tr -dc 'a-z0-9' | cut -c1-20 ) | tr -d '\n' > "$APP_DIR/.god_token"
  chmod 600 "$APP_DIR/.god_token"
  echo "-- minted a Creator password"
fi
GOD_TOKEN="$(cat "$APP_DIR/.god_token")"

# 4. pm2 process with the environment baked in
cat > "$APP_DIR/ecosystem.config.cjs" <<EOF
module.exports = { apps: [{ name: '${PM2_NAME}', script: 'server/index.js', cwd: '${APP_DIR}', env: { PORT: '${PORT}', GOD_TOKEN: '${GOD_TOKEN}', NODE_ENV: 'production' }, max_memory_restart: '400M', restart_delay: 5000 }] };
EOF
chmod 600 "$APP_DIR/ecosystem.config.cjs"
pm2 startOrReload "$APP_DIR/ecosystem.config.cjs" --update-env >/dev/null
pm2 save >/dev/null
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true

# 5. nginx: retire whatever served this name before, then our block with websocket upgrade
for f in /etc/nginx/sites-enabled/*; do
  [ -e "$f" ] || continue
  if grep -q "server_name.*${DOMAIN}" "$f" && [ "$(basename "$f")" != "${DOMAIN}" ]; then
    echo "-- disabling old site block $(basename "$f") for ${DOMAIN}"
    mv "$f" "/etc/nginx/sites-available/$(basename "$f").disabled-by-playing-god"
  fi
done
cat > "/etc/nginx/sites-available/${DOMAIN}" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};
    client_max_body_size 4m;
    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
EOF
ln -sf "/etc/nginx/sites-available/${DOMAIN}" "/etc/nginx/sites-enabled/${DOMAIN}"
nginx -t && systemctl reload nginx

# 6. Certificate (certbot's nginx authenticator works on this box); redirect http -> https
if command -v certbot >/dev/null 2>&1; then
  certbot --nginx -d "${DOMAIN}" -d "www.${DOMAIN}" --non-interactive --agree-tos --redirect --keep-until-expiring \
    $( [ -n "${CERTBOT_EMAIL:-}" ] && echo "-m ${CERTBOT_EMAIL}" || echo "--register-unsafely-without-email" ) || echo "!! certbot failed; site is up on http, fix the cert by hand"
else
  echo "!! certbot not installed; site is up on http only"
fi

# 7. Hourly self-update from GitHub (push to main, live within the hour)
install -m 755 "$APP_DIR/deploy/update.sh" /usr/local/bin/playing-god-update
( crontab -l 2>/dev/null | grep -v playing-god-update ; echo "17 * * * * /usr/local/bin/playing-god-update >> /var/log/playing-god-update.log 2>&1" ) | crontab -

echo
echo "== done =="
echo "Site:            https://${DOMAIN}"
echo "Creator password: ${GOD_TOKEN}"
echo "(also in ${APP_DIR}/.god_token — keep it to yourself; it is the only key to the weather)"
pm2 status "${PM2_NAME}" | tail -n +1
