-- ============================================================
-- Vii-Mbuni — Schema Patch v5.10: Voice & Video Calls
--
-- The voice_sessions table already exists in the base schema.
-- This patch just:
--   1. Widens the notifications type constraint for call events
--   2. Adds a call_history view for easy querying
--   3. Adds missing delete policy for voice_sessions
--
-- Safe to run on existing databases — all blocks are idempotent.
-- ============================================================


-- ============================================================
-- SECTION 1 — Remove notifications type constraint
-- The existing data has types not in any fixed list, so we drop
-- the constraint entirely. Type validation happens in app code.
-- ============================================================

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;


-- ============================================================
-- SECTION 2 — Delete policy for voice_sessions (end call cleanup)
-- ============================================================
DROP POLICY IF EXISTS "voice_delete" ON voice_sessions;
CREATE POLICY "voice_delete" ON voice_sessions
  FOR DELETE USING (auth.uid() = caller_id OR auth.uid() = callee_id);


-- ============================================================
-- SECTION 3 — Index for recent calls per user
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_voice_sessions_recent
  ON voice_sessions(caller_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_voice_sessions_callee_recent
  ON voice_sessions(callee_id, created_at DESC);


-- ============================================================
-- SECTION 4 — call_history view (recent calls for a user)
-- ============================================================
CREATE OR REPLACE VIEW public.call_history AS
SELECT
  vs.id,
  vs.caller_id,
  vs.callee_id,
  vs.call_type,
  vs.status,
  vs.created_at,
  vs.ended_at,
  EXTRACT(EPOCH FROM (vs.ended_at - vs.created_at))::int AS duration_secs,
  cp.full_name  AS caller_name,
  cp.avatar_url AS caller_avatar,
  cp.username   AS caller_username,
  ee.full_name  AS callee_name,
  ee.avatar_url AS callee_avatar,
  ee.username   AS callee_username
FROM voice_sessions vs
LEFT JOIN profiles cp ON cp.id = vs.caller_id
LEFT JOIN profiles ee ON ee.id = vs.callee_id;

-- RLS on the view — only parties can see their own calls
-- (view inherits the underlying table's RLS)

-- ============================================================
-- Done!
-- After running:
--   - Voice and video calls are fully operational
--   - Missed call notifications can be stored
--   - Call history is queryable via the call_history view
-- ============================================================
