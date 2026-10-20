<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Shared chat, message, and call tables. Safe to run more than once.
     * Does not drop or rewrite existing rows.
     */
    public function up(): void
    {
        if (! Schema::hasTable('chats')) {
            Schema::create('chats', function (Blueprint $table) {
                $table->id();
                $table->string('type', 20);
                $table->string('name')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('chat_participants')) {
            Schema::create('chat_participants', function (Blueprint $table) {
                $table->id();
                $table->foreignId('chat_id')->constrained('chats')->cascadeOnDelete();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->timestamp('joined_at')->nullable();
                $table->timestamp('last_read_at')->nullable();
                $table->timestamps();
                $table->unique(['chat_id', 'user_id']);
            });
        }

        if (! Schema::hasTable('messages')) {
            Schema::create('messages', function (Blueprint $table) {
                $table->id();
                $table->foreignId('chat_id')->constrained('chats')->cascadeOnDelete();
                $table->foreignId('sender_id')->nullable()->constrained('users')->nullOnDelete();
                $table->string('message_type', 20)->default('text');
                $table->text('body')->nullable();
                $table->timestamps();
                $table->index(['chat_id', 'created_at']);
            });
        }

        if (! Schema::hasTable('calls')) {
            Schema::create('calls', function (Blueprint $table) {
                $table->id();
                $table->foreignId('chat_id')->nullable()->constrained('chats')->nullOnDelete();
                $table->foreignId('caller_id')->nullable()->constrained('users')->nullOnDelete();
                $table->string('call_type', 20);
                $table->string('status', 20)->default('ringing');
                $table->timestamp('started_at')->nullable();
                $table->timestamp('ended_at')->nullable();
                $table->timestamps();
                $table->index(['caller_id', 'status']);
            });
        }

        if (! Schema::hasTable('call_participants')) {
            Schema::create('call_participants', function (Blueprint $table) {
                $table->id();
                $table->foreignId('call_id')->constrained('calls')->cascadeOnDelete();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->string('status', 20)->default('invited');
                $table->timestamp('joined_at')->nullable();
                $table->timestamp('left_at')->nullable();
                $table->timestamps();
                $table->unique(['call_id', 'user_id']);
            });
        }

        if (Schema::getConnection()->getDriverName() !== 'pgsql') {
            return;
        }

        $this->addCheck('chats_type_check', 'chats', "type IN ('direct', 'group')");
        $this->addCheck('messages_type_check', 'messages', "message_type IN ('text', 'image', 'file', 'system')");
        $this->addCheck('calls_type_check', 'calls', "call_type IN ('voice', 'video')");
        $this->addCheck('calls_status_check', 'calls', "status IN ('ringing', 'ongoing', 'ended', 'missed', 'declined')");
        $this->addCheck('call_participants_status_check', 'call_participants', "status IN ('invited', 'joined', 'left', 'missed', 'declined')");

        foreach (['chats', 'chat_participants', 'messages', 'calls', 'call_participants'] as $table) {
            DB::statement("ALTER TABLE {$table} ENABLE ROW LEVEL SECURITY");
            DB::statement("REVOKE ALL ON TABLE {$table} FROM anon, authenticated");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('call_participants');
        Schema::dropIfExists('calls');
        Schema::dropIfExists('messages');
        Schema::dropIfExists('chat_participants');
        Schema::dropIfExists('chats');
    }

    private function addCheck(string $name, string $table, string $expression): void
    {
        $exists = DB::selectOne('select 1 as present from pg_constraint where conname = ?', [$name]);

        if ($exists) {
            return;
        }

        DB::statement("ALTER TABLE {$table} ADD CONSTRAINT {$name} CHECK ({$expression})");
    }
};
