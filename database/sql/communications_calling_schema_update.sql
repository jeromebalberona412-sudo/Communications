-- Communications calling schema (additive only).
-- Run this yourself. Do not run DROP / TRUNCATE / data-destructive statements.
-- Safe to re-run: uses IF NOT EXISTS.

-- Optional hangup reason (ended / rejected / missed / cancelled).
ALTER TABLE calls
    ADD COLUMN IF NOT EXISTS end_reason VARCHAR(32) NULL;

-- Lookup indexes used by ringing recovery and history.
CREATE INDEX IF NOT EXISTS calls_conversation_id_idx
    ON calls (conversation_id);

CREATE INDEX IF NOT EXISTS calls_status_idx
    ON calls (status);

CREATE INDEX IF NOT EXISTS calls_caller_lookup_idx
    ON calls (caller_id, caller_type);

CREATE INDEX IF NOT EXISTS calls_receiver_lookup_idx
    ON calls (receiver_id, receiver_type);

CREATE INDEX IF NOT EXISTS calls_started_at_idx
    ON calls (started_at);

-- Verification (read-only)
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'calls'
-- ORDER BY ordinal_position;
--
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'calls';
