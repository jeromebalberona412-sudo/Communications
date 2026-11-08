-- Optional performance indexes for Communications chat (Students + Teachers).
-- Safe to run more than once. Does not drop tables or delete rows.
-- Run this yourself in the Supabase SQL editor (or psql). I did not run it.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'conversation_id'
    ) THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS messages_conversation_id_id_index ON public.messages (conversation_id, id DESC)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS messages_conversation_id_created_at_index ON public.messages (conversation_id, created_at DESC)';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'chat_id'
    ) THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS messages_chat_id_created_at_index ON public.messages (chat_id, created_at DESC)';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'conversation_participants'
    ) THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS conversation_participants_user_id_conversation_id_index ON public.conversation_participants (user_id, conversation_id)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS conversation_participants_conversation_id_user_id_index ON public.conversation_participants (conversation_id, user_id)';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'calls' AND column_name = 'receiver_id'
    ) THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS calls_receiver_id_status_index ON public.calls (receiver_id, status)';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'calls' AND column_name = 'caller_id'
    ) THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS calls_caller_id_status_index ON public.calls (caller_id, status)';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'is_active'
    ) THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS users_role_is_active_name_index ON public.users (role, is_active, name)';
    END IF;
END $$;
