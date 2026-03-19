-- ─── v5.14 (v5.8) Schema Patch ─────────────────────────────────────────────

-- Stories 2.0: text overlays + stickers
ALTER TABLE stories ADD COLUMN IF NOT EXISTS text_overlays  jsonb DEFAULT '[]';
ALTER TABLE stories ADD COLUMN IF NOT EXISTS stickers       jsonb DEFAULT '[]';
ALTER TABLE stories ADD COLUMN IF NOT EXISTS bg_color       text  DEFAULT NULL;

-- Profile themes
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS theme_color   text  DEFAULT '#7c3aed';

-- Nearby: store city/country from profile
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS city          text  DEFAULT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS country       text  DEFAULT NULL;

-- DM voice messages: add audio_url to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS audio_url     text  DEFAULT NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS duration_secs int   DEFAULT NULL;

-- Live reactions on reels/posts (ephemeral — no persistence needed, use realtime broadcast)
-- No table needed — use Supabase realtime broadcast channel

-- Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_city    ON profiles(city) WHERE city IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_country ON profiles(country) WHERE country IS NOT NULL;
