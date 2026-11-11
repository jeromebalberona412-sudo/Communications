<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('message_attachments')) {
            return;
        }

        if (! Schema::hasColumn('message_attachments', 'public_id')) {
            Schema::table('message_attachments', function (Blueprint $table) {
                $table->string('public_id')->nullable();
            });
        }

        $path = DB::selectOne(
            "select character_maximum_length from information_schema.columns where table_schema = current_schema() and table_name = 'message_attachments' and column_name = 'path'"
        );
        if ($path && $path->character_maximum_length !== null && (int) $path->character_maximum_length < 2000) {
            DB::statement('alter table message_attachments alter column path type text');
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('message_attachments')) {
            return;
        }

        if (Schema::hasColumn('message_attachments', 'public_id')) {
            Schema::table('message_attachments', function (Blueprint $table) {
                $table->dropColumn('public_id');
            });
        }
    }
};
