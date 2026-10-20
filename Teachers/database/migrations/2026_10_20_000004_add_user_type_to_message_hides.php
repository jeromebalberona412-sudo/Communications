<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Align message_hides with the Communications package (user_type scoping).
     */
    public function up(): void
    {
        if (! Schema::hasTable('message_hides')) {
            return;
        }

        if (! Schema::hasColumn('message_hides', 'user_type')) {
            Schema::table('message_hides', function (Blueprint $table) {
                $table->string('user_type', 30)->nullable()->after('user_id');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('message_hides') && Schema::hasColumn('message_hides', 'user_type')) {
            Schema::table('message_hides', function (Blueprint $table) {
                $table->dropColumn('user_type');
            });
        }
    }
};
