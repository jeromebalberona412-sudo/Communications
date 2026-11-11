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

# Full migrate stays off. This one file only creates communication_call_histories.
echo "[render] Ensuring communication_call_histories exists..."
php artisan migrate --force --path=database/migrations/2026_11_11_080100_create_communication_call_histories_table.php \
  || echo "[render] Call history migration did not apply. Existing call rows still load."
php artisan migrate --force --path=database/migrations/2026_11_11_083000_add_cloudinary_photo_columns.php \
  || echo "[render] Photo columns were not added."
rm -f storage/framework/cache/comms-schema-*.flag || true

# Other migrations stay off. Set MIGRATE_ON_DEPLOY=true only when approved.
if [ "${MIGRATE_ON_DEPLOY:-false}" = "true" ]; then
  echo "[render] MIGRATE_ON_DEPLOY=true — running php artisan migrate --force"
  php artisan migrate --force
else
  echo "[render] Skipping the rest of the migrations."
fi

echo "[render] Laravel boot scripts complete."
