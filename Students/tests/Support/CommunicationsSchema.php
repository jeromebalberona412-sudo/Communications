<?php

namespace Tests\Support;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Minimal Communications schema for the Students test database.
 *
 * The Students app shares the production database with the Teachers app and
 * therefore ships without the Communications migrations. The test database is
 * isolated, so the tables the package needs are created here.
 */
class CommunicationsSchema
{
    public static function create(): void
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
                $table->unsignedBigInteger('conversation_id');
                $table->unsignedBigInteger('user_id');
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
                $table->unsignedBigInteger('conversation_id')->nullable();
                $table->unsignedBigInteger('sender_id')->nullable();
                $table->string('sender_type', 30)->nullable();
                $table->text('body')->nullable();
                $table->string('message_type', 20)->default('text');
                $table->timestamp('edited_at')->nullable();
                $table->timestamp('deleted_for_all_at')->nullable();
                $table->timestamps();
                $table->index(['conversation_id', 'created_at']);
            });
        }

        if (! Schema::hasTable('message_attachments')) {
            Schema::create('message_attachments', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('message_id');
                $table->string('disk')->nullable();
                $table->string('path')->nullable();
                $table->string('original_name')->nullable();
                $table->string('mime_type')->nullable();
                $table->unsignedBigInteger('size')->nullable();
                $table->string('kind', 20)->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('message_reactions')) {
            Schema::create('message_reactions', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('message_id');
                $table->unsignedBigInteger('user_id');
                $table->string('user_type', 30)->nullable();
                $table->string('emoji', 32);
                $table->timestamps();
                $table->unique(['message_id', 'user_id', 'emoji'], 'message_reactions_unique');
            });
        }

        if (! Schema::hasTable('message_hides')) {
            Schema::create('message_hides', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('message_id');
                $table->unsignedBigInteger('user_id');
                $table->string('user_type', 30)->nullable();
                $table->timestamps();
                $table->unique(['message_id', 'user_id']);
            });
        }

        if (! Schema::hasTable('calls')) {
            Schema::create('calls', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('conversation_id')->nullable();
                $table->unsignedBigInteger('caller_id')->nullable();
                $table->string('caller_type', 30)->nullable();
                $table->unsignedBigInteger('receiver_id')->nullable();
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
        }
    }
}
