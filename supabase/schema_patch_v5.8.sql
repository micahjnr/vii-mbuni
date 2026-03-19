-- ============================================================
-- Vii-Mbuni — Cumulative Schema Patch
-- Covers: v5.6 fixes + v5.7 (Zaar Culture) + v5.8 (Group Feed + Rich Push)
--
-- Safe to run on an existing database — every block uses
-- IF NOT EXISTS / OR REPLACE / DO $$ idempotent guards.
--
-- Run in: Supabase → SQL Editor → paste → Run
-- ============================================================


-- ============================================================
-- SECTION 1 — v5.6 FIXES
-- ============================================================

-- 1a. Harden handle_new_user trigger
--     Captures avatar from OAuth providers (Google/GitHub), handles
--     NULL email, emits RAISE WARNING on failure for Supabase logs.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _username  text;
  _full_name text;
  _avatar    text;
BEGIN
  -- Derive username from email or id
  _username  := COALESCE(
    split_part(NEW.email, '@', 1),
    'user_' || substr(NEW.id::text, 1, 8)
  );
  -- Prefer display_name > name > full_name > email prefix
  _full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'display_name',
    split_part(COALESCE(NEW.email, ''), '@', 1),
    'User'
  );
  -- Avatar: check all common OAuth keys
  _avatar := COALESCE(
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'picture',
    NEW.raw_user_meta_data->>'photo_url'
  );

  INSERT INTO public.profiles (id, email, username, full_name, avatar_url, created_at)
  VALUES (
    NEW.id,
    NEW.email,
    _username,
    _full_name,
    _avatar,
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
    SET
      email      = EXCLUDED.email,
      avatar_url = COALESCE(profiles.avatar_url, EXCLUDED.avatar_url),
      full_name  = COALESCE(profiles.full_name,  EXCLUDED.full_name);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user failed for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- Re-attach trigger (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- 1b. Back-fill avatar_url for existing OAuth users who joined before the fix
UPDATE public.profiles p
SET avatar_url = (
  SELECT COALESCE(
    u.raw_user_meta_data->>'avatar_url',
    u.raw_user_meta_data->>'picture',
    u.raw_user_meta_data->>'photo_url'
  )
  FROM auth.users u WHERE u.id = p.id
)
WHERE p.avatar_url IS NULL;


-- 1c. Fix Storage RLS — images bucket insert policy
--     Old policy only checked path prefix; new one verifies UID in path.
DROP POLICY IF EXISTS images_insert ON storage.objects;
CREATE POLICY images_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'images'
    AND (
      -- posts/{uid}/filename
      (storage.foldername(name))[1] = 'posts'
      AND (storage.foldername(name))[2] = auth.uid()::text
    ) OR (
      -- avatars/{uid}.ext  (flat path)
      (storage.foldername(name))[1] = 'avatars'
      AND split_part(storage.filename(name), '.', 1) = auth.uid()::text
    ) OR (
      -- stories/{uid}/filename
      (storage.foldername(name))[1] = 'stories'
      AND (storage.foldername(name))[2] = auth.uid()::text
    )
  );


-- 1d. cleanup_dead_push_subscriptions — safe to schedule as cron
DROP FUNCTION IF EXISTS public.cleanup_dead_push_subscriptions();
CREATE FUNCTION public.cleanup_dead_push_subscriptions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.push_subscriptions
  WHERE updated_at < NOW() - INTERVAL '90 days';
END;
$$;


-- ============================================================
-- SECTION 2 — push_subscriptions table (needed by push features)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint    text        NOT NULL UNIQUE,
  p256dh      text,
  auth        text,
  created_at  timestamptz NOT NULL DEFAULT NOW(),
  updated_at  timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
  ON public.push_subscriptions(user_id);

-- RLS
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subscriptions_select ON public.push_subscriptions;
CREATE POLICY push_subscriptions_select ON public.push_subscriptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS push_subscriptions_insert ON public.push_subscriptions;
CREATE POLICY push_subscriptions_insert ON public.push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS push_subscriptions_delete ON public.push_subscriptions;
CREATE POLICY push_subscriptions_delete ON public.push_subscriptions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());


-- ============================================================
-- SECTION 3 — v5.7 (Zaar Culture community board index)
-- ============================================================

-- Partial index for zaar_discussion posts (fast community board query)
CREATE INDEX IF NOT EXISTS idx_posts_zaar_discussion
  ON public.posts(post_type, is_published, created_at DESC)
  WHERE post_type = 'zaar_discussion' AND is_published = true;


-- ============================================================
-- SECTION 4 — v5.8 PUSH NOTIFICATION SCHEMA
-- ============================================================

-- 4a. Add extra_data column to notifications (rich push context)
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS extra_data jsonb;

-- 4b. GIN index for extra_data queries
CREATE INDEX IF NOT EXISTS idx_notifications_extra_data
  ON public.notifications USING GIN (extra_data)
  WHERE extra_data IS NOT NULL;

-- 4c. Widen notifications type_check constraint for all new types
--     Drop existing constraint first (only way to ALTER a CHECK in PG).
--     Then remap any legacy/unknown type values to 'system' so no existing
--     rows violate the new constraint before we add it.
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Remap unknown types to 'system' to avoid violating the new constraint
UPDATE public.notifications
SET type = 'system'
WHERE type NOT IN (
  'like', 'comment', 'reply', 'mention', 'follow',
  'friend_request', 'message', 'group_join', 'group_post',
  'challenge_complete', 'xp_milestone', 'system'
);

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (
    type IN (
      'like',
      'comment',
      'reply',
      'mention',
      'follow',
      'friend_request',
      'message',
      'group_join',
      'group_post',
      'challenge_complete',
      'xp_milestone',
      'system'
    )
  );


-- ============================================================
-- SECTION 5 — v5.8 GROUP FEED SCHEMA
-- ============================================================

-- 5a. Add privacy column to groups (keeps is_private in sync via trigger)
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS privacy text NOT NULL DEFAULT 'public'
  CHECK (privacy IN ('public', 'private'));

-- Back-fill privacy from existing is_private boolean
UPDATE public.groups
SET privacy = CASE WHEN is_private = true THEN 'private' ELSE 'public' END
WHERE privacy IS DISTINCT FROM CASE WHEN is_private = true THEN 'private' ELSE 'public' END;

-- 5b. Trigger: keep privacy ↔ is_private in sync on UPDATE
CREATE OR REPLACE FUNCTION public.sync_group_privacy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- If privacy text column changed, sync is_private boolean
  IF NEW.privacy IS DISTINCT FROM OLD.privacy THEN
    NEW.is_private := (NEW.privacy = 'private');
  -- If is_private boolean changed, sync privacy text
  ELSIF NEW.is_private IS DISTINCT FROM OLD.is_private THEN
    NEW.privacy := CASE WHEN NEW.is_private THEN 'private' ELSE 'public' END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_group_privacy ON public.groups;
CREATE TRIGGER trg_sync_group_privacy
  BEFORE UPDATE ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.sync_group_privacy();


-- 5c. FK: posts.group_id → groups.id ON DELETE SET NULL
--     (was an unlinked uuid column before v5.8)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'posts_group_id_fkey'
      AND table_name = 'posts'
  ) THEN
    ALTER TABLE public.posts
      ADD CONSTRAINT posts_group_id_fkey
      FOREIGN KEY (group_id) REFERENCES public.groups(id)
      ON DELETE SET NULL;
  END IF;
END $$;


-- 5d. Partial index powering the group feed discovery query
--     fetchGroupFeed: posts WHERE group_id IS NOT NULL AND is_published = true
CREATE INDEX IF NOT EXISTS idx_posts_group_feed
  ON public.posts(group_id, is_published, created_at DESC)
  WHERE group_id IS NOT NULL AND is_published = true;

-- 5e. Fast member-count per group (used in GroupPostCard banner)
CREATE INDEX IF NOT EXISTS idx_group_members_group_id
  ON public.group_members(group_id);

-- 5f. Fast per-user membership lookup (used on every feed load)
CREATE INDEX IF NOT EXISTS idx_group_members_user_id
  ON public.group_members(user_id);


-- ============================================================
-- Done — all patches applied idempotently.
-- ============================================================
