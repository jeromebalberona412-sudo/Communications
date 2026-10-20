<?php

namespace App\Modules\Communications\Support;

use Illuminate\Support\Facades\Schema;

/**
 * Cache Schema::hasTable / hasColumn without hitting CACHE_STORE=database.
 * Remote Postgres introspection is extremely slow on every request.
 */
class SchemaCache
{
    /** @var array<string, bool> */
    protected static array $memo = [];

    public static function hasTable(string $table): bool
    {
        return self::remember("table:{$table}", static fn () => Schema::hasTable($table));
    }

    public static function hasColumn(string $table, string $column): bool
    {
        return self::remember("column:{$table}.{$column}", static fn () => Schema::hasColumn($table, $column));
    }

    /**
     * @param  callable(): bool  $resolver
     */
    protected static function remember(string $key, callable $resolver): bool
    {
        if (array_key_exists($key, self::$memo)) {
            return self::$memo[$key];
        }

        $dir = storage_path('framework/cache');
        if (! is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }

        $file = $dir.DIRECTORY_SEPARATOR.'comms-schema-'.md5($key).'.flag';
        if (is_file($file)) {
            $raw = @file_get_contents($file);
            if ($raw === '1' || $raw === '0') {
                return self::$memo[$key] = $raw === '1';
            }
        }

        $value = (bool) $resolver();
        @file_put_contents($file, $value ? '1' : '0');

        return self::$memo[$key] = $value;
    }
}
