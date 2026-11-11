<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('communication_call_histories')) {
            return;
        }

        Schema::create('communication_call_histories', function (Blueprint $table) {
            $table->id();
            $table->uuid('call_uuid')->unique();
            $table->unsignedBigInteger('call_id')->nullable()->unique();
            $table->unsignedBigInteger('conversation_id')->nullable()->index();
            $table->string('call_type', 16);
            $table->unsignedBigInteger('caller_id')->index();
            $table->string('caller_type', 32);
            $table->unsignedBigInteger('receiver_id')->index();
            $table->string('receiver_type', 32);
            $table->string('status', 32)->index();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('answered_at')->nullable();
            $table->timestamp('ended_at')->nullable();
            $table->unsignedInteger('duration_seconds')->nullable();
            $table->string('end_reason', 64)->nullable();
            $table->timestamps();

            $table->index(['caller_id', 'caller_type']);
            $table->index(['receiver_id', 'receiver_type']);
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('communication_call_histories');
    }
};
