-- ============================================================
-- Vii-Mbuni — Schema Patch v5.9: Video Posts
--
-- Safe to run on existing database — all blocks are idempotent.
-- Run in: Supabase → SQL Editor → paste → Run
-- ============================================================


-- ============================================================
-- SECTION 1 — Videos storage bucket
-- ============================================================

-- Create the videos bucket (public so video URLs work without auth)
-- 50 MB limit — videos are compressed client-side before upload,
-- so a 2-minute clip at 1.2 Mbps is well under 20 MB in practice.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'videos',
  'videos',
  true,
  52428800,   -- 50 MB (post-compression ceiling)
  ARRAY['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo', 'video/mpeg']
)
ON CONFLICT (id) DO UPDATE
  SET public             = true,
      file_size_limit    = 52428800,
      allowed_mime_types = ARRAY['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo', 'video/mpeg'];


-- ============================================================
-- SECTION 2 — Storage policies for videos bucket
-- ============================================================

DROP POLICY IF EXISTS "videos_select" ON storage.objects;
DROP POLICY IF EXISTS "videos_insert" ON storage.objects;
DROP POLICY IF EXISTS "videos_update" ON storage.objects;
DROP POLICY IF EXISTS "videos_delete" ON storage.objects;

-- Anyone can view videos (public feed)
CREATE POLICY "videos_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'videos');

-- Authenticated users can upload to their own folder only
-- Path pattern: posts/{user_id}/{filename}
CREATE POLICY "videos_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'videos'
    AND auth.role() = 'authenticated'
    AND auth.uid()::text = (storage.foldername(name))[2]
  );

-- Users can only update their own video objects
CREATE POLICY "videos_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'videos'
    AND auth.role() = 'authenticated'
    AND auth.uid()::text = (storage.foldername(name))[2]
  );

-- Users can only delete their own video objects
CREATE POLICY "videos_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'videos'
    AND auth.role() = 'authenticated'
    AND auth.uid()::text = (storage.foldername(name))[2]
  );


-- ============================================================
-- SECTION 3 — Posts table: ensure video_url column exists
-- (already present in base schema — this is a safety guard)
-- ============================================================

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS video_url text;


-- ============================================================
-- SECTION 4 — Index for video posts (profile grid, explore)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_posts_video
  ON public.posts (user_id, created_at DESC)
  WHERE video_url IS NOT NULL AND is_published = true;


-- ============================================================
-- SECTION 5 — Widen notifications type constraint for future
--             video-specific notification types (optional)
-- ============================================================

-- No constraint changes needed — existing types cover video posts
-- (likes/comments on video posts reuse the same 'like'/'comment' types)


-- ============================================================
-- Done!
-- After running this patch:
--   1. The 'videos' bucket will exist in Supabase Storage
--   2. Users can upload videos up to 100 MB
--   3. The Video button will appear in CreatePostModal
--   4. Videos render inline in PostCard & GroupPostCard
-- ============================================================
