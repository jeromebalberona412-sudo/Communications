#!/usr/bin/env bash
set -euo pipefail

cd /var/www/html

echo "[render] Preparing storage directories..."
mkdir -p storage/framework/cache storage/framework/sessions storage/framework/views storage/logs bootstrap/cache
chmod -R ug+rwx storage bootstrap/cache || true

echo "[render] Caching Laravel config/routes/views..."
php artisan config:cache
php artisan route:cache
php artisan view:cache

# Migrations OFF by default. Set MIGRATE_ON_DEPLOY=true only when approved.
if [ "${MIGRATE_ON_DEPLOY:-false}" = "true" ]; then
  echo "[render] MIGRATE_ON_DEPLOY=true — running php artisan migrate --force"
  php artisan migrate --force
else
  echo "[render] Skipping migrations (set MIGRATE_ON_DEPLOY=true to enable)."
fi

echo "[render] Laravel boot scripts complete."
