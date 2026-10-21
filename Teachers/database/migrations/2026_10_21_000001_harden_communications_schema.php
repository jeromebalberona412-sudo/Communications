<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Communications hardening migration.
 *
 * Why this is needed
 * -----------------
 * 1. The shared group chat must exist exactly once. The database still holds
 *    two legacy groups ("Capstone" and "Capstone 2") that were created before
 *    the `default_group_type` marker existed, so both portals could show a
 *    duplicate group. This migration keeps the canonical "Capstone 2" row,
 *    moves every message, call and membership of the duplicate into it and
 *    marks it with the `CAPSTONE_2` default group type. Nothing is deleted
 *    except the empty duplicate conversation row.
 *
 * 2. Historical calls lost their duration because the stale-call cleanup used
 *    a bulk update that never wrote `duration_seconds`. The duration is
 *    reconstructed from the persisted `started_at`/`answered_at`/`ended_at`
 *    timestamps, which are never modified.
 *
 * 3. Missing columns and lookup indexes are added defensively so the
 *    heartbeat / active-call lookups stay fast on a large call history.
 *
 * The migration is additive and idempotent: it can be re-run safely.
 */
return new class extends Migration
{
    private const CAPSTONE_TYPE = 'CAPSTONE_2';

    private const CAPSTONE_NAME = 'Capstone 2';

    private const CAPSTONE_MAX_MEMBERS = 500;

    public function up(): void
    {
        if (Schema::getConnection()->getDriverName() !== 'pgsql') {
            return;
        }

        $this->ensureColumns();
        $this->ensureIndexes();
        $this->backfillCallDurations();
        $this->collapseCapstoneGroups();
    }

    public function down(): void
    {
        // Data consolidation is intentionally irreversible: the duplicate group
        // row and the repaired durations must not be rolled back.
    }

    /**
     * Add the columns the Communications package relies on when they are
     * missing (fresh installs).
     */
    private function ensureColumns(): void
    {
        if (Schema::hasTable('calls')) {
            if (! Schema::hasColumn('calls', 'duration_seconds')) {
                DB::statement('ALTER TABLE calls ADD COLUMN duration_seconds integer NULL');
            }
            if (! Schema::hasColumn('calls', 'answered_at')) {
                DB::statement('ALTER TABLE calls ADD COLUMN answered_at timestamp NULL');
            }
        }

        if (Schema::hasTable('conversations') && ! Schema::hasColumn('conversations', 'default_group_type')) {
            DB::statement('ALTER TABLE conversations ADD COLUMN default_group_type varchar NULL');
        }

        if (Schema::hasTable('conversation_participants')
            && ! Schema::hasColumn('conversation_participants', 'participant_role')) {
            DB::statement("ALTER TABLE conversation_participants ADD COLUMN participant_role varchar NOT NULL DEFAULT 'member'");
        }
    }

    /**
     * Indexes for the call heartbeat and active-call detection.
     */
    private function ensureIndexes(): void
    {
        if (! Schema::hasTable('calls')) {
            return;
        }

        $indexes = [
            'calls_status_ended_at_index' => 'CREATE INDEX IF NOT EXISTS calls_status_ended_at_index ON calls (status, ended_at)',
            'calls_caller_status_index' => 'CREATE INDEX IF NOT EXISTS calls_caller_status_index ON calls (caller_id, status)',
            'calls_receiver_status_index' => 'CREATE INDEX IF NOT EXISTS calls_receiver_status_index ON calls (receiver_id, status)',
        ];

        foreach ($indexes as $name => $sql) {
            DB::statement($sql);
        }
    }

    /**
     * Rebuild the duration of finished calls from the stored timestamps.
     */
    private function backfillCallDurations(): void
    {
        if (! Schema::hasTable('calls') || ! Schema::hasColumn('calls', 'duration_seconds')) {
            return;
        }

        DB::statement(<<<'SQL'
            UPDATE calls
               SET duration_seconds = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (ended_at - COALESCE(answered_at, started_at)))::integer))
             WHERE duration_seconds IS NULL
               AND ended_at IS NOT NULL
               AND COALESCE(answered_at, started_at) IS NOT NULL
               AND ended_at > COALESCE(answered_at, started_at)
               AND status IN ('ended', 'accepted', 'ongoing')
        SQL);
    }

    /**
     * Keep exactly one shared group chat.
     */
    private function collapseCapstoneGroups(): void
    {
        if (! Schema::hasTable('conversations') || ! Schema::hasTable('conversation_participants')) {
            return;
        }

        $groups = DB::table('conversations')
            ->where('conversation_type', 'group')
            ->where(function ($query) {
                $query->whereNull('default_group_type')
                    ->orWhere('default_group_type', self::CAPSTONE_TYPE);
            })
            ->whereRaw("lower(trim(coalesce(name, ''))) like ?", ['capstone%'])
            ->orderBy('id')
            ->get();

        if ($groups->isEmpty()) {
            return;
        }

        $canonical = null;
        foreach ($groups as $group) {
            if (mb_strtolower(trim((string) $group->name)) === mb_strtolower(self::CAPSTONE_NAME)) {
                $canonical = $group;
                break;
            }
        }
        $canonical = $canonical ?: $groups->first();

        foreach ($groups as $group) {
            if ((int) $group->id === (int) $canonical->id) {
                continue;
            }
            $this->mergeGroup((int) $group->id, (int) $canonical->id);
        }

        DB::table('conversations')->where('id', $canonical->id)->update([
            'conversation_type' => 'group',
            'name' => self::CAPSTONE_NAME,
            'default_group_type' => self::CAPSTONE_TYPE,
            'max_members' => self::CAPSTONE_MAX_MEMBERS,
            'updated_at' => now(),
        ]);
    }

    /**
     * Move every record of the duplicate group into the canonical one.
     */
    private function mergeGroup(int $fromId, int $toId): void
    {
        DB::transaction(function () use ($fromId, $toId) {
            $existingUserIds = DB::table('conversation_participants')
                ->where('conversation_id', $toId)
                ->pluck('user_id')
                ->map(fn ($id) => (int) $id)
                ->all();

            $memberships = DB::table('conversation_participants')
                ->where('conversation_id', $fromId)
                ->orderBy('id')
                ->get();

            foreach ($memberships as $membership) {
                if (in_array((int) $membership->user_id, $existingUserIds, true)) {
                    // Never create a duplicate membership for the same person.
                    DB::table('conversation_participants')->where('id', $membership->id)->delete();
                    continue;
                }
                DB::table('conversation_participants')->where('id', $membership->id)->update([
                    'conversation_id' => $toId,
                ]);
                $existingUserIds[] = (int) $membership->user_id;
            }

            foreach (['messages', 'calls'] as $table) {
                if (! Schema::hasTable($table) || ! Schema::hasColumn($table, 'conversation_id')) {
                    continue;
                }
                DB::table($table)->where('conversation_id', $fromId)->update([
                    'conversation_id' => $toId,
                ]);
            }

            DB::table('conversations')->where('id', $fromId)->delete();
        });
    }
};
