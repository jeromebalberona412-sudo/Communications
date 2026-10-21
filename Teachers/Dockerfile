# Render Web Service (Docker) — Laravel 12 + Vite + nginx/php-fpm
# Official pattern: https://github.com/render-examples/php-laravel-docker
FROM richarvey/nginx-php-fpm:3.1.6

WORKDIR /var/www/html

# Node is required at build time for Vite; not needed at runtime after assets are built.
RUN apk add --no-cache nodejs npm

COPY composer.json composer.lock ./
COPY packages ./packages
COPY app ./app
COPY bootstrap ./bootstrap
COPY config ./config
COPY conf ./conf
COPY database ./database
COPY public ./public
COPY resources ./resources
COPY routes ./routes
COPY scripts ./scripts
COPY artisan ./
COPY package.json package-lock.json vite.config.js ./

# Vite bakes VITE_* at build time. Pass these as Render env vars (also used at runtime via Blade).
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY

RUN composer install --no-dev --prefer-dist --optimize-autoloader --no-interaction --no-scripts \
    && npm ci \
    && npm run build \
    && rm -rf node_modules \
    && mkdir -p storage/framework/cache storage/framework/sessions storage/framework/views storage/logs bootstrap/cache \
    && chmod -R ug+rwx storage bootstrap/cache \
    && chmod +x scripts/*.sh \
    && php artisan package:discover --ansi || true

# Image / Laravel runtime config (secrets come from Render env vars)
# PHP_CATCHALL=1 is required: without it nginx uses try_files … =404 and only "/"
# reaches Laravel (index.php). All other routes (e.g. /login, /up) return nginx 404.
ENV SKIP_COMPOSER=1 \
    WEBROOT=/var/www/html/public \
    PHP_CATCHALL=1 \
    PHP_ERRORS_STDERR=1 \
    RUN_SCRIPTS=1 \
    REAL_IP_HEADER=1 \
    APP_ENV=production \
    APP_DEBUG=false \
    LOG_CHANNEL=stderr \
    COMPOSER_ALLOW_SUPERUSER=1

CMD ["/start.sh"]
