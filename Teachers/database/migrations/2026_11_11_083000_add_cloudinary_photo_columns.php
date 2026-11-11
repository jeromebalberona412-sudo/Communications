<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Store Cloudinary URLs only. The image file stays on Cloudinary.
     */
    public function up(): void
    {
        if (Schema::hasTable('users')) {
            Schema::table('users', function (Blueprint $table) {
                if (! Schema::hasColumn('users', 'profile_image_url')) {
                    $table->text('profile_image_url')->nullable();
                }
                if (! Schema::hasColumn('users', 'profile_image_public_id')) {
                    $table->string('profile_image_public_id')->nullable();
                }
            });
        }

        if (Schema::hasTable('conversations')) {
            Schema::table('conversations', function (Blueprint $table) {
                if (! Schema::hasColumn('conversations', 'avatar_public_id')) {
                    $table->string('avatar_public_id')->nullable();
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('users')) {
            Schema::table('users', function (Blueprint $table) {
                if (Schema::hasColumn('users', 'profile_image_public_id')) {
                    $table->dropColumn('profile_image_public_id');
                }
                if (Schema::hasColumn('users', 'profile_image_url')) {
                    $table->dropColumn('profile_image_url');
                }
            });
        }

        if (Schema::hasTable('conversations')) {
            Schema::table('conversations', function (Blueprint $table) {
                if (Schema::hasColumn('conversations', 'avatar_public_id')) {
                    $table->dropColumn('avatar_public_id');
                }
            });
        }
    }
};
