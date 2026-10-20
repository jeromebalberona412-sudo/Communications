#!/usr/bin/env bash
set -euo pipefail

echo "[render] Caching Laravel config/routes/views..."
php /var/www/html/artisan config:cache
php /var/www/html/artisan route:cache
php /var/www/html/artisan view:cache

# Migrations are OFF by default (do not run against production without approval).
# Set MIGRATE_ON_DEPLOY=true in Render only when you intentionally want migrate --force.
if [ "${MIGRATE_ON_DEPLOY:-false}" = "true" ]; then
  echo "[render] MIGRATE_ON_DEPLOY=true — running php artisan migrate --force"
  php /var/www/html/artisan migrate --force
else
  echo "[render] Skipping migrations (set MIGRATE_ON_DEPLOY=true to enable)."
fi

echo "[render] Laravel boot scripts complete."
