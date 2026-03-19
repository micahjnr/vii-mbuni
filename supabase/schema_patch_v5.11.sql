-- ============================================================
-- Vii-Mbuni — Schema Patch v5.11: Fix Storage Upload Policy
--
-- PROBLEM: New users cannot upload profile pictures or banners.
--
-- ROOT CAUSE (two issues combined):
--
--   1. schema_patch_v5.8.sql rewrote the images_insert policy but
--      has broken operator precedence — the OR branches are not
--      individually wrapped in parentheses, so Postgres evaluates:
--
--        (A AND B AND C) OR (D AND E) OR (F AND G)
--
--      instead of the intended:
--
--        (A AND B) OR (C AND D) OR (E AND F)
--
--      This means the bucket_id = 'images' check only applies to
--      the first OR branch, leaving the other branches unsecured
--      and mis-evaluated. The policy effectively rejects all uploads.
--
--   2. The v5.8 patch still expected the OLD flat avatar path
--      (avatars/{uid}.ext) but the app now uses a subfolder path
--      (avatars/{uid}/timestamp.ext). split_part on the filename
--      never matched the uid so uploads always failed the check.
--
-- FIX: Replace the images_insert (and images_update/delete) policies
--      with correctly-parenthesised versions that match the actual
--      subfolder path format used by the app:
--
--        avatars/{uid}/timestamp.ext
--        banners/{uid}/timestamp.ext
--        posts/{uid}/timestamp.ext
--        stories/{uid}/timestamp.ext
--        groups/{uid}/timestamp.ext
--
--      All paths use (storage.foldername(name))[2] = auth.uid()::text
--      which is the second element of the folder array (1-indexed).
--
-- Safe to re-run — all statements are idempotent.
-- ============================================================


-- ============================================================
-- Drop all existing images bucket policies so we start clean
-- ============================================================
DROP POLICY IF EXISTS "images_select" ON storage.objects;
DROP POLICY IF EXISTS "images_insert" ON storage.objects;
DROP POLICY IF EXISTS "images_update" ON storage.objects;
DROP POLICY IF EXISTS "images_delete" ON storage.objects;

-- Also drop the v5.8 patch versions (unquoted names)
DROP POLICY IF EXISTS images_insert ON storage.objects;
DROP POLICY IF EXISTS images_update ON storage.objects;
DROP POLICY IF EXISTS images_delete ON storage.objects;
DROP POLICY IF EXISTS images_select ON storage.objects;


-- ============================================================
-- Recreate policies with correct parentheses and path format
-- ============================================================

-- Anyone can view images (public bucket)
CREATE POLICY "images_select" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'images');

-- Authenticated users can upload to their own subfolder
-- Supported path formats:  {type}/{uid}/filename
--   where type ∈ {posts, stories, groups, avatars, banners}
CREATE POLICY "images_insert" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'images'
    AND (
      (storage.foldername(name))[1] IN ('posts', 'stories', 'groups', 'avatars', 'banners')
      AND (storage.foldername(name))[2] = auth.uid()::text
    )
  );

-- Authenticated users can update their own files
CREATE POLICY "images_update" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'images'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- Authenticated users can delete their own files
CREATE POLICY "images_delete" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'images'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );


-- ============================================================
-- Done!
-- After running this patch:
--   - New users can upload profile pictures and banners
--   - Existing users are unaffected
--   - All path types (posts, stories, groups, avatars, banners)
--     work correctly with the subfolder format {type}/{uid}/file
-- ============================================================


-- ============================================================
-- Ensure voice_sessions is in Supabase Realtime publication
-- (required for incoming call notifications to work)
-- ============================================================
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
