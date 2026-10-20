<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Align the shared database with the Communications package schema.
     * Non-destructive: creates missing tables/columns only.
     */
    public function up(): void
    {
        if (! Schema::hasTable('conversations')) {
            Schema::create('conversations', function (Blueprint $table) {
                $table->id();
                $table->string('conversation_type', 20)->default('private');
                $table->string('name')->nullable();
                $table->string('default_group_type', 40)->nullable();
                $table->unsignedBigInteger('tenant_id')->nullable();
                $table->unsignedInteger('max_members')->nullable();
                $table->string('avatar_url')->nullable();
                $table->timestamps();
                $table->index('conversation_type');
            });
        }

        if (! Schema::hasTable('conversation_participants')) {
            Schema::create('conversation_participants', function (Blueprint $table) {
                $table->id();
                $table->foreignId('conversation_id')->constrained('conversations')->cascadeOnDelete();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->string('user_type', 30);
                $table->string('participant_role', 20)->default('member');
                $table->timestamp('joined_at')->nullable();
                $table->timestamp('last_read_at')->nullable();
                $table->unsignedBigInteger('last_read_message_id')->nullable();
                $table->timestamps();
                $table->unique(['conversation_id', 'user_id', 'user_type'], 'conversation_participants_unique');
            });
        }

        if (! Schema::hasTable('messages')) {
            Schema::create('messages', function (Blueprint $table) {
                $table->id();
                $table->foreignId('conversation_id')->constrained('conversations')->cascadeOnDelete();
                $table->foreignId('sender_id')->nullable()->constrained('users')->nullOnDelete();
                $table->string('sender_type', 30)->nullable();
                $table->text('body')->nullable();
                $table->string('message_type', 20)->default('text');
                $table->timestamp('edited_at')->nullable();
                $table->timestamp('deleted_for_all_at')->nullable();
                $table->timestamps();
                $table->index(['conversation_id', 'created_at']);
            });
        } else {
            Schema::table('messages', function (Blueprint $table) {
                if (! Schema::hasColumn('messages', 'conversation_id')) {
                    $table->unsignedBigInteger('conversation_id')->nullable()->after('id');
                }
                if (! Schema::hasColumn('messages', 'sender_type')) {
                    $table->string('sender_type', 30)->nullable();
                }
                if (! Schema::hasColumn('messages', 'edited_at')) {
                    $table->timestamp('edited_at')->nullable();
                }
                if (! Schema::hasColumn('messages', 'deleted_for_all_at')) {
                    $table->timestamp('deleted_for_all_at')->nullable();
                }
            });
        }

        if (! Schema::hasTable('message_reactions')) {
            Schema::create('message_reactions', function (Blueprint $table) {
                $table->id();
                $table->foreignId('message_id')->constrained('messages')->cascadeOnDelete();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->string('user_type', 30)->nullable();
                $table->string('emoji', 32);
                $table->timestamps();
                $table->unique(['message_id', 'user_id', 'emoji'], 'message_reactions_unique');
            });
        }

        if (! Schema::hasTable('message_hides')) {
            Schema::create('message_hides', function (Blueprint $table) {
                $table->id();
                $table->foreignId('message_id')->constrained('messages')->cascadeOnDelete();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->string('user_type', 30)->nullable();
                $table->timestamps();
                $table->unique(['message_id', 'user_id']);
            });
        } elseif (! Schema::hasColumn('message_hides', 'user_type')) {
            Schema::table('message_hides', function (Blueprint $table) {
                $table->string('user_type', 30)->nullable()->after('user_id');
            });
        }

        if (! Schema::hasTable('message_attachments')) {
            Schema::create('message_attachments', function (Blueprint $table) {
                $table->id();
                $table->foreignId('message_id')->constrained('messages')->cascadeOnDelete();
                $table->string('disk')->nullable();
                $table->string('path')->nullable();
                $table->string('original_name')->nullable();
                $table->string('mime_type')->nullable();
                $table->unsignedBigInteger('size')->nullable();
                $table->string('kind', 20)->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('calls')) {
            Schema::create('calls', function (Blueprint $table) {
                $table->id();
                $table->foreignId('conversation_id')->nullable()->constrained('conversations')->nullOnDelete();
                $table->foreignId('caller_id')->nullable()->constrained('users')->nullOnDelete();
                $table->string('caller_type', 30)->nullable();
                $table->foreignId('receiver_id')->nullable()->constrained('users')->nullOnDelete();
                $table->string('receiver_type', 30)->nullable();
                $table->string('call_type', 20);
                $table->string('status', 20)->default('ringing');
                $table->timestamp('started_at')->nullable();
                $table->timestamp('answered_at')->nullable();
                $table->timestamp('ended_at')->nullable();
                $table->unsignedInteger('duration_seconds')->nullable();
                $table->timestamps();
                $table->index(['caller_id', 'status']);
                $table->index(['receiver_id', 'status']);
            });
        } else {
            Schema::table('calls', function (Blueprint $table) {
                if (! Schema::hasColumn('calls', 'conversation_id')) {
                    $table->unsignedBigInteger('conversation_id')->nullable();
                }
                if (! Schema::hasColumn('calls', 'caller_type')) {
                    $table->string('caller_type', 30)->nullable();
                }
                if (! Schema::hasColumn('calls', 'receiver_id')) {
                    $table->unsignedBigInteger('receiver_id')->nullable();
                }
                if (! Schema::hasColumn('calls', 'receiver_type')) {
                    $table->string('receiver_type', 30)->nullable();
                }
                if (! Schema::hasColumn('calls', 'answered_at')) {
                    $table->timestamp('answered_at')->nullable();
                }
                if (! Schema::hasColumn('calls', 'duration_seconds')) {
                    $table->unsignedInteger('duration_seconds')->nullable();
                }
            });
        }

        if (Schema::getConnection()->getDriverName() === 'pgsql') {
            foreach ([
                'conversations',
                'conversation_participants',
                'messages',
                'message_reactions',
                'message_hides',
                'message_attachments',
                'calls',
            ] as $table) {
                if (Schema::hasTable($table)) {
                    DB::statement("ALTER TABLE {$table} ENABLE ROW LEVEL SECURITY");
                    DB::statement("REVOKE ALL ON TABLE {$table} FROM anon, authenticated");
                }
            }
        }
    }

    public function down(): void
    {
        // Non-destructive by design — do not drop live communication tables.
    }
};
