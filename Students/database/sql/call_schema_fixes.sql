-- Additive call schema fixes for the shared Supabase PostgreSQL database.
-- Run once in the Supabase SQL editor AFTER a backup.
-- Do NOT DROP / TRUNCATE. Safe to re-run (IF NOT EXISTS).

-- Optional hangup reason (ended / rejected / missed / cancelled / stale).
ALTER TABLE calls
    ADD COLUMN IF NOT EXISTS end_reason VARCHAR(32) NULL;

-- User id of who ended the call (nullable: timeout / missed).
ALTER TABLE calls
    ADD COLUMN IF NOT EXISTS ended_by BIGINT NULL;

-- Explicit group-call flag (group rows currently reuse caller_id = receiver_id).
ALTER TABLE calls
    ADD COLUMN IF NOT EXISTS is_group BOOLEAN NULL DEFAULT FALSE;

-- Duration and answer timestamp if an older schema omitted them.
ALTER TABLE calls
    ADD COLUMN IF NOT EXISTS answered_at TIMESTAMPTZ NULL;

ALTER TABLE calls
    ADD COLUMN IF NOT EXISTS duration_seconds INTEGER NULL;

CREATE INDEX IF NOT EXISTS calls_conversation_id_idx
    ON calls (conversation_id);

CREATE INDEX IF NOT EXISTS calls_conversation_created_idx
    ON calls (conversation_id, created_at);

CREATE INDEX IF NOT EXISTS calls_status_idx
    ON calls (status);

CREATE INDEX IF NOT EXISTS calls_caller_lookup_idx
    ON calls (caller_id, caller_type);

CREATE INDEX IF NOT EXISTS calls_receiver_lookup_idx
    ON calls (receiver_id, receiver_type);

CREATE INDEX IF NOT EXISTS calls_started_at_idx
    ON calls (started_at);

-- OPTIONAL cleanup of stuck ringing/ongoing rows older than 4 hours.
-- Review, then uncomment and run yourself. Does not delete rows.
--
-- UPDATE calls
-- SET status = 'ended',
--     ended_at = COALESCE(ended_at, NOW()),
--     end_reason = COALESCE(end_reason, 'stale')
-- WHERE status IN ('ringing', 'accepted')
--   AND COALESCE(updated_at, created_at) < NOW() - INTERVAL '4 hours';
