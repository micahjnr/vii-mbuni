-- ================================================================
-- Voice sessions fix: ensure realtime row-level filters work
-- Run this in your Supabase SQL editor
-- ================================================================

-- Required for postgres_changes row filters (filter: `id=eq.X`) to work.
-- Without this, Supabase can't read old row values and may drop filtered events.
ALTER TABLE voice_sessions REPLICA IDENTITY FULL;

-- Make sure voice_sessions is in the realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'voice_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE voice_sessions;
  END IF;
END;
$$;
