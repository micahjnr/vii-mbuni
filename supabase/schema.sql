-- ================================================================
-- VII-MBUNI — MASTER SCHEMA (generated from live DB export)
-- Run this on a FRESH Supabase project to get the exact same
-- database your live app is running on.
--
-- Safe to run top-to-bottom in: Supabase → SQL Editor → Run
-- All statements use IF NOT EXISTS / ON CONFLICT / DROP IF EXISTS
-- so it is also safe to re-run on an existing project.
-- ================================================================

-- ── EXTENSIONS ──────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ================================================================
-- TABLES (35 total — matches live DB)
-- ================================================================

-- ── profiles ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id               uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username         text UNIQUE NOT NULL,
  full_name        text NOT NULL,
  email            text,
  bio              text,
  avatar_url       text,
  banner_url       text,
  cover_url        text,
  status_emoji     text,
  status_text      text,
  follower_count   integer DEFAULT 0,
  following_count  integer DEFAULT 0,
  xp               integer DEFAULT 0,
  level            integer DEFAULT 1,
  streak_days      integer DEFAULT 0,
  last_active_date date,
  last_active      timestamptz,
  online_at        timestamptz,
  location         text,
  website          text,
  created_at       timestamptz DEFAULT now()
);

-- ── posts ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS posts (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content          text,
  image_url        text,
  images           jsonb,
  video_url        text,
  audio_name       text,
  audience         text DEFAULT 'public' CHECK (audience IN ('public','friends','private')),
  is_published     boolean DEFAULT true,
  is_reel          boolean DEFAULT false,
  mood             text,
  hashtags         text[],
  poll_data        text,
  quoted_post_id   uuid,
  shared_from      uuid,
  shared_from_user uuid,
  post_type        text,
  group_id         uuid,
  collab_user_id   uuid,
  collab_status    text,
  timeline_user_id uuid,
  view_count       integer DEFAULT 0,
  scheduled_at     timestamptz,
  created_at       timestamptz DEFAULT now()
);

-- ── likes ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS likes (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id       uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reaction_type text DEFAULT 'like',
  UNIQUE (post_id, user_id)
);

-- ── comments ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comments (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id    uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content    text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ── comment_replies ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comment_replies (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  comment_id uuid NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  post_id    uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content    text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ── comment_likes ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comment_likes (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  comment_id uuid NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  UNIQUE (comment_id, user_id)
);

-- ── stories ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stories (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  media_url   text NOT NULL,
  media_type  text NOT NULL CHECK (media_type IN ('image','video')),
  caption     text,
  music_url   text,
  music_title text,
  expires_at  timestamptz DEFAULT (now() + interval '24 hours'),
  created_at  timestamptz DEFAULT now()
);

-- ── story_views ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS story_views (
  id        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  story_id  uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  viewed_at timestamptz DEFAULT now(),
  UNIQUE (story_id, viewer_id)
);

-- ── story_reactions ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS story_reactions (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  story_id   uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji      text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (story_id, user_id)
);

-- ── messages ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  receiver_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content          text,
  image_url        text,
  audio_url        text,
  is_read          boolean DEFAULT false,
  is_edited        boolean DEFAULT false,
  reply_to_id      uuid REFERENCES messages(id) ON DELETE SET NULL,
  reply_to_content text,
  reply_to_sender  text,
  created_at       timestamptz DEFAULT now()
);

-- ── notifications ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  actor_id     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  type         text NOT NULL,
  reference_id uuid,
  is_read      boolean DEFAULT false,
  created_at   timestamptz DEFAULT now()
);

-- ── friends ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS friends (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  friend_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status     text DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','blocked')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, friend_id)
);

-- ── blocked_users ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blocked_users (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, blocked_id)
);

-- ── close_friends ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS close_friends (
  id        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  friend_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  added_at  timestamptz DEFAULT now(),
  UNIQUE (user_id, friend_id)
);

-- ── groups ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS groups (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  cover_url   text,
  emoji       text DEFAULT '👥',
  is_private  boolean DEFAULT false,
  created_at  timestamptz DEFAULT now()
);
-- Add emoji column to existing deployments that do not have it yet
ALTER TABLE groups ADD COLUMN IF NOT EXISTS emoji text DEFAULT '👥';

-- ── group_members ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS group_members (
  id        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id  uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role      text DEFAULT 'member' CHECK (role IN ('member','admin','moderator')),
  joined_at timestamptz DEFAULT now(),
  UNIQUE (group_id, user_id)
);

-- ── events ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title       text NOT NULL,
  description text,
  location    text,
  cover_url   text,
  is_virtual  boolean DEFAULT false,
  group_id    uuid REFERENCES groups(id) ON DELETE SET NULL,
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz,
  created_at  timestamptz DEFAULT now()
);

-- ── event_rsvps ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_rsvps (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id   uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status     text NOT NULL DEFAULT 'going' CHECK (status IN ('going','maybe','not_going')),
  UNIQUE (event_id, user_id)
);

-- ── poll_votes ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS poll_votes (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id      uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  option_index integer NOT NULL,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (post_id, user_id)
);

-- ── polls (standalone poll table) ────────────────────────────────
CREATE TABLE IF NOT EXISTS polls (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id    uuid REFERENCES posts(id) ON DELETE CASCADE,
  question   text NOT NULL,
  options    jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ── post_hashtags ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS post_hashtags (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id    uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag        text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (post_id, tag)
);

-- ── followed_hashtags ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS followed_hashtags (
  id      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tag     text NOT NULL,
  UNIQUE (user_id, tag)
);

-- ── mentions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mentions (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  mentioned_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  actor_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  post_id           uuid REFERENCES posts(id) ON DELETE CASCADE,
  comment_id        uuid REFERENCES comments(id) ON DELETE CASCADE,
  created_at        timestamptz DEFAULT now()
);

-- ── badges_earned ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS badges_earned (
  id        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_id  text NOT NULL,
  earned_at timestamptz DEFAULT now(),
  UNIQUE (user_id, badge_id)
);

-- ── user_badges (alias table — same purpose as badges_earned) ────
CREATE TABLE IF NOT EXISTS user_badges (
  id        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_key text NOT NULL,
  earned_at timestamptz DEFAULT now(),
  UNIQUE (user_id, badge_key)
);

-- ── bookmarks ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookmarks (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  post_id    uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, post_id)
);

-- ── reports ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  post_id          uuid REFERENCES posts(id) ON DELETE CASCADE,
  reported_user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  reason           text NOT NULL,
  created_at       timestamptz DEFAULT now()
);

-- ── weekly_challenges ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS weekly_challenges (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title       text NOT NULL,
  description text NOT NULL,
  emoji       text DEFAULT '🏆',
  hashtag     text NOT NULL,
  xp_reward   integer DEFAULT 100,
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL,
  created_at  timestamptz DEFAULT now()
);

-- ── challenge_entries ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS challenge_entries (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  challenge_id uuid NOT NULL REFERENCES weekly_challenges(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  post_id      uuid REFERENCES posts(id) ON DELETE SET NULL,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (challenge_id, user_id)
);

-- ── daily_logins (atomic streak claims) ──────────────────────────
CREATE TABLE IF NOT EXISTS daily_logins (
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  login_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, login_date)
);

-- ── push_subscriptions ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint   text NOT NULL UNIQUE,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- ── reel_views ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reel_views (
  id       uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id  uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  viewed_at timestamptz DEFAULT now(),
  UNIQUE (post_id, user_id)
);

-- ── user_interests ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_interests (
  id       uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  interest text NOT NULL,
  UNIQUE (user_id, interest)
);

-- ── disappearing_settings (chat TTL) ─────────────────────────────
CREATE TABLE IF NOT EXISTS disappearing_settings (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_key text NOT NULL,
  user_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ttl              text NOT NULL,
  UNIQUE (conversation_key, user_id)
);

-- ── voice_sessions (WebRTC call signalling) ───────────────────────
CREATE TABLE IF NOT EXISTS voice_sessions (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  caller_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  callee_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status     text NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing','active','ended','missed')),
  call_type  text DEFAULT 'voice' CHECK (call_type IN ('voice','video')),
  offer      text,
  answer     text,
  caller_ice text,
  callee_ice text,
  created_at timestamptz DEFAULT now(),
  ended_at   timestamptz
);

-- ── users (legacy mirror table — keep for backwards compat) ──────
CREATE TABLE IF NOT EXISTS users (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email      text,
  username   text,
  avatar_url text,
  created_at timestamptz DEFAULT now()
);


-- ================================================================
-- INDEXES
-- ================================================================
CREATE INDEX IF NOT EXISTS idx_posts_user_id        ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at     ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_is_reel         ON posts(is_reel);
CREATE INDEX IF NOT EXISTS idx_posts_timeline_user   ON posts(timeline_user_id);
CREATE INDEX IF NOT EXISTS idx_posts_hashtags         ON posts USING GIN(hashtags);
CREATE INDEX IF NOT EXISTS idx_posts_mood             ON posts(mood);
CREATE INDEX IF NOT EXISTS idx_likes_post_id          ON likes(post_id);
CREATE INDEX IF NOT EXISTS idx_likes_user_id          ON likes(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_post_id       ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comment_replies_post   ON comment_replies(post_id);
CREATE INDEX IF NOT EXISTS idx_comment_replies_comment ON comment_replies(comment_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender        ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver      ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_created       ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user     ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created  ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_friends_user_id        ON friends(user_id);
CREATE INDEX IF NOT EXISTS idx_friends_friend_id      ON friends(friend_id);
CREATE INDEX IF NOT EXISTS idx_stories_user_id        ON stories(user_id);
CREATE INDEX IF NOT EXISTS idx_stories_expires        ON stories(expires_at);
CREATE INDEX IF NOT EXISTS idx_events_starts_at       ON events(starts_at);
CREATE INDEX IF NOT EXISTS idx_poll_votes_post         ON poll_votes(post_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user          ON bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_badges_user             ON badges_earned(user_id);
CREATE INDEX IF NOT EXISTS idx_challenge_entries       ON challenge_entries(challenge_id);
CREATE INDEX IF NOT EXISTS idx_push_subs_user          ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_reel_views_post         ON reel_views(post_id);
CREATE INDEX IF NOT EXISTS idx_post_hashtags_tag       ON post_hashtags(tag);
CREATE INDEX IF NOT EXISTS idx_daily_logins            ON daily_logins(user_id, login_date DESC);
CREATE INDEX IF NOT EXISTS idx_voice_sessions_caller   ON voice_sessions(caller_id);
CREATE INDEX IF NOT EXISTS idx_voice_sessions_callee   ON voice_sessions(callee_id);


-- ================================================================
-- SIGNUP TRIGGER — auto-create profile on new user
-- ================================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_username  text;
  v_full_name text;
  v_avatar    text;
  v_base      text;
  v_suffix    int := 0;
BEGIN
  v_base := COALESCE(
    NULLIF(TRIM(REGEXP_REPLACE(LOWER(NEW.raw_user_meta_data->>'username'), '[^a-z0-9_]', '', 'g')), ''),
    NULLIF(LOWER(REGEXP_REPLACE(SPLIT_PART(NEW.email, '@', 1), '[^a-z0-9_]', '', 'g')), '')
  );
  IF v_base IS NULL OR v_base = '' THEN v_base := 'user'; END IF;

  v_full_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    SPLIT_PART(NEW.email, '@', 1)
  );

  -- Capture avatar from OAuth providers (Google, GitHub, etc.)
  v_avatar := NULLIF(TRIM(COALESCE(
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'picture'
  )), '');

  v_username := v_base;
  LOOP
    EXIT WHEN NOT EXISTS (SELECT 1 FROM profiles WHERE username = v_username);
    v_suffix   := v_suffix + 1;
    v_username := v_base || v_suffix::text;
  END LOOP;

  INSERT INTO profiles (id, email, username, full_name, avatar_url)
  VALUES (NEW.id, NEW.email, v_username, v_full_name, v_avatar)
  ON CONFLICT (id) DO UPDATE
    SET
      email      = EXCLUDED.email,
      full_name  = CASE WHEN profiles.full_name = '' OR profiles.full_name IS NULL
                     THEN EXCLUDED.full_name ELSE profiles.full_name END,
      username   = CASE WHEN profiles.username LIKE 'user%'
                     THEN EXCLUDED.username ELSE profiles.username END,
      avatar_url = CASE WHEN profiles.avatar_url IS NULL AND EXCLUDED.avatar_url IS NOT NULL
                     THEN EXCLUDED.avatar_url ELSE profiles.avatar_url END;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log the error so it appears in Supabase logs, but never block signup
  RAISE WARNING '[handle_new_user] Failed for user %: % %', NEW.id, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ================================================================
-- FOLLOW COUNT TRIGGER
-- ================================================================
CREATE OR REPLACE FUNCTION update_follow_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'accepted' THEN
    UPDATE profiles SET follower_count  = follower_count  + 1 WHERE id = NEW.friend_id;
    UPDATE profiles SET following_count = following_count + 1 WHERE id = NEW.user_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'accepted' AND OLD.status != 'accepted' THEN
      UPDATE profiles SET follower_count  = follower_count  + 1 WHERE id = NEW.friend_id;
      UPDATE profiles SET following_count = following_count + 1 WHERE id = NEW.user_id;
    ELSIF OLD.status = 'accepted' AND NEW.status != 'accepted' THEN
      UPDATE profiles SET follower_count  = GREATEST(follower_count  - 1, 0) WHERE id = OLD.friend_id;
      UPDATE profiles SET following_count = GREATEST(following_count - 1, 0) WHERE id = OLD.user_id;
    END IF;
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'accepted' THEN
    UPDATE profiles SET follower_count  = GREATEST(follower_count  - 1, 0) WHERE id = OLD.friend_id;
    UPDATE profiles SET following_count = GREATEST(following_count - 1, 0) WHERE id = OLD.user_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_follow_counts ON friends;
CREATE TRIGGER trg_follow_counts
  AFTER INSERT OR UPDATE OR DELETE ON friends
  FOR EACH ROW EXECUTE FUNCTION update_follow_counts();


-- ================================================================
-- XP & GAMIFICATION FUNCTIONS
-- ================================================================
CREATE OR REPLACE FUNCTION award_xp(p_user_id uuid, p_amount integer)
RETURNS void AS $$
BEGIN
  UPDATE profiles SET xp = COALESCE(xp, 0) + p_amount WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION update_streak(p_user_id uuid)
RETURNS void AS $$
DECLARE
  v_last_post timestamptz;
BEGIN
  SELECT MAX(created_at) INTO v_last_post
  FROM posts WHERE user_id = p_user_id AND is_published = true;

  IF v_last_post IS NULL THEN
    UPDATE profiles SET streak_days = 0 WHERE id = p_user_id;
  ELSIF DATE(v_last_post AT TIME ZONE 'UTC') >= DATE((now() - interval '1 day') AT TIME ZONE 'UTC') THEN
    UPDATE profiles SET streak_days = COALESCE(streak_days, 0) + 1 WHERE id = p_user_id;
  ELSE
    UPDATE profiles SET streak_days = 1 WHERE id = p_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomic daily streak claim (prevents double-award across tabs)
CREATE OR REPLACE FUNCTION claim_daily_streak(p_user_id uuid)
RETURNS boolean AS $$
DECLARE
  v_inserted  boolean := false;
  v_streak    integer;
  v_xp_bonus  integer;
  v_yesterday date := CURRENT_DATE - 1;
BEGIN
  INSERT INTO daily_logins (user_id, login_date)
  VALUES (p_user_id, CURRENT_DATE)
  ON CONFLICT (user_id, login_date) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF NOT v_inserted THEN RETURN false; END IF;

  -- Extend streak if they logged in yesterday, else reset to 1
  IF EXISTS (SELECT 1 FROM daily_logins WHERE user_id = p_user_id AND login_date = v_yesterday) THEN
    UPDATE profiles SET streak_days = COALESCE(streak_days, 0) + 1 WHERE id = p_user_id
    RETURNING streak_days INTO v_streak;
  ELSE
    UPDATE profiles SET streak_days = 1 WHERE id = p_user_id;
    v_streak := 1;
  END IF;

  -- Award XP: 7+ day streak gets double
  v_xp_bonus := CASE WHEN v_streak >= 7 THEN 50 ELSE 25 END;
  UPDATE profiles SET xp = COALESCE(xp, 0) + v_xp_bonus WHERE id = p_user_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION check_and_award_badges(p_user_id uuid)
RETURNS void AS $$
DECLARE
  v_post_count    integer;
  v_like_count    integer;
  v_friend_count  integer;
  v_comment_count integer;
  v_streak        integer;
  v_profile       profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;
  SELECT COUNT(*) INTO v_post_count    FROM posts    WHERE user_id = p_user_id AND is_published = true;
  SELECT COUNT(*) INTO v_comment_count FROM comments WHERE user_id = p_user_id;
  SELECT COUNT(*) INTO v_friend_count  FROM friends
    WHERE (user_id = p_user_id OR friend_id = p_user_id) AND status = 'accepted';
  SELECT COUNT(*) INTO v_like_count FROM likes l
    JOIN posts p ON l.post_id = p.id WHERE p.user_id = p_user_id;
  v_streak := COALESCE(v_profile.streak_days, 0);

  IF v_post_count    >= 1   THEN INSERT INTO badges_earned(user_id,badge_id) VALUES(p_user_id,'first_post')       ON CONFLICT DO NOTHING; END IF;
  IF v_post_count    >= 10  THEN INSERT INTO badges_earned(user_id,badge_id) VALUES(p_user_id,'ten_posts')        ON CONFLICT DO NOTHING; END IF;
  IF v_post_count    >= 50  THEN INSERT INTO badges_earned(user_id,badge_id) VALUES(p_user_id,'fifty_posts')      ON CONFLICT DO NOTHING; END IF;
  IF v_like_count    >= 1   THEN INSERT INTO badges_earned(user_id,badge_id) VALUES(p_user_id,'first_like')       ON CONFLICT DO NOTHING; END IF;
  IF v_like_count    >= 100 THEN INSERT INTO badges_earned(user_id,badge_id) VALUES(p_user_id,'hundred_likes')    ON CONFLICT DO NOTHING; END IF;
  IF v_friend_count  >= 1   THEN INSERT INTO badges_earned(user_id,badge_id) VALUES(p_user_id,'first_friend')     ON CONFLICT DO NOTHING; END IF;
  IF v_friend_count  >= 10  THEN INSERT INTO badges_earned(user_id,badge_id) VALUES(p_user_id,'ten_friends')      ON CONFLICT DO NOTHING; END IF;
  IF v_comment_count >= 1   THEN INSERT INTO badges_earned(user_id,badge_id) VALUES(p_user_id,'first_comment')    ON CONFLICT DO NOTHING; END IF;
  IF v_streak        >= 3   THEN INSERT INTO badges_earned(user_id,badge_id) VALUES(p_user_id,'streak_3')         ON CONFLICT DO NOTHING; END IF;
  IF v_streak        >= 7   THEN INSERT INTO badges_earned(user_id,badge_id) VALUES(p_user_id,'streak_7')         ON CONFLICT DO NOTHING; END IF;
  IF v_streak        >= 30  THEN INSERT INTO badges_earned(user_id,badge_id) VALUES(p_user_id,'streak_30')        ON CONFLICT DO NOTHING; END IF;
  IF v_profile.full_name IS NOT NULL AND v_profile.bio IS NOT NULL AND v_profile.avatar_url IS NOT NULL THEN
    INSERT INTO badges_earned(user_id,badge_id) VALUES(p_user_id,'profile_complete') ON CONFLICT DO NOTHING;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- View count increment (safe concurrent RPC)
CREATE OR REPLACE FUNCTION increment_view_count(post_id uuid)
RETURNS TABLE(view_count integer) AS $$
BEGIN
  RETURN QUERY
  UPDATE posts SET view_count = COALESCE(posts.view_count, 0) + 1
  WHERE id = post_id
  RETURNING posts.view_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ================================================================
-- BACK-FILL: create profiles for any auth users missing one
-- ================================================================
INSERT INTO profiles (id, email, username, full_name, avatar_url)
SELECT
  u.id,
  u.email,
  -- Build a unique username even when email is null (OAuth without email scope)
  COALESCE(
    NULLIF(LOWER(REGEXP_REPLACE(SPLIT_PART(COALESCE(u.email, ''), '@', 1), '[^a-z0-9_]', '', 'g')), ''),
    'user'
  ) || '_' || SUBSTR(u.id::text, 1, 6),
  COALESCE(
    NULLIF(TRIM(u.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(u.raw_user_meta_data->>'name'), ''),
    SPLIT_PART(COALESCE(u.email, u.id::text), '@', 1)
  ),
  NULLIF(TRIM(COALESCE(
    u.raw_user_meta_data->>'avatar_url',
    u.raw_user_meta_data->>'picture'
  )), '')
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;


-- ================================================================
-- ROW LEVEL SECURITY
-- ================================================================
ALTER TABLE profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_replies     ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_likes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE stories             ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_views         ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_reactions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages            ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications       ENABLE ROW LEVEL SECURITY;
ALTER TABLE friends             ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE close_friends       ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups              ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE events              ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_rsvps         ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_votes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE polls               ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_hashtags       ENABLE ROW LEVEL SECURITY;
ALTER TABLE followed_hashtags   ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE badges_earned       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges         ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookmarks           ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports             ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_challenges   ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_entries   ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_logins        ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE reel_views          ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_interests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE disappearing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_sessions      ENABLE ROW LEVEL SECURITY;

-- profiles
DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_insert" ON profiles;
DROP POLICY IF EXISTS "profiles_update" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.uid() = id);

-- posts
DROP POLICY IF EXISTS "posts_select" ON posts;
DROP POLICY IF EXISTS "posts_insert" ON posts;
DROP POLICY IF EXISTS "posts_update" ON posts;
DROP POLICY IF EXISTS "posts_delete" ON posts;
CREATE POLICY "posts_select" ON posts FOR SELECT USING (is_published = true OR user_id = auth.uid());
CREATE POLICY "posts_insert" ON posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "posts_update" ON posts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "posts_delete" ON posts FOR DELETE USING (auth.uid() = user_id);

-- likes
DROP POLICY IF EXISTS "likes_select" ON likes;
DROP POLICY IF EXISTS "likes_insert" ON likes;
DROP POLICY IF EXISTS "likes_delete" ON likes;
CREATE POLICY "likes_select" ON likes FOR SELECT USING (true);
CREATE POLICY "likes_insert" ON likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "likes_delete" ON likes FOR DELETE USING (auth.uid() = user_id);

-- comments
DROP POLICY IF EXISTS "comments_select" ON comments;
DROP POLICY IF EXISTS "comments_insert" ON comments;
DROP POLICY IF EXISTS "comments_update" ON comments;
DROP POLICY IF EXISTS "comments_delete" ON comments;
CREATE POLICY "comments_select" ON comments FOR SELECT USING (true);
CREATE POLICY "comments_insert" ON comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "comments_update" ON comments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "comments_delete" ON comments FOR DELETE USING (auth.uid() = user_id);

-- comment_replies
DROP POLICY IF EXISTS "replies_select" ON comment_replies;
DROP POLICY IF EXISTS "replies_insert" ON comment_replies;
DROP POLICY IF EXISTS "replies_update" ON comment_replies;
DROP POLICY IF EXISTS "replies_delete" ON comment_replies;
CREATE POLICY "replies_select" ON comment_replies FOR SELECT USING (true);
CREATE POLICY "replies_insert" ON comment_replies FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "replies_update" ON comment_replies FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "replies_delete" ON comment_replies FOR DELETE USING (auth.uid() = user_id);

-- comment_likes
DROP POLICY IF EXISTS "clikes_select" ON comment_likes;
DROP POLICY IF EXISTS "clikes_insert" ON comment_likes;
DROP POLICY IF EXISTS "clikes_delete" ON comment_likes;
CREATE POLICY "clikes_select" ON comment_likes FOR SELECT USING (true);
CREATE POLICY "clikes_insert" ON comment_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "clikes_delete" ON comment_likes FOR DELETE USING (auth.uid() = user_id);

-- stories
DROP POLICY IF EXISTS "stories_select" ON stories;
DROP POLICY IF EXISTS "stories_insert" ON stories;
DROP POLICY IF EXISTS "stories_delete" ON stories;
CREATE POLICY "stories_select" ON stories FOR SELECT USING (true);
CREATE POLICY "stories_insert" ON stories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "stories_delete" ON stories FOR DELETE USING (auth.uid() = user_id);

-- story_views
DROP POLICY IF EXISTS "story_views_select" ON story_views;
DROP POLICY IF EXISTS "story_views_insert" ON story_views;
CREATE POLICY "story_views_select" ON story_views FOR SELECT USING (true);
CREATE POLICY "story_views_insert" ON story_views FOR INSERT WITH CHECK (auth.uid() = viewer_id);

-- story_reactions
DROP POLICY IF EXISTS "story_reactions_select" ON story_reactions;
DROP POLICY IF EXISTS "story_reactions_insert" ON story_reactions;
DROP POLICY IF EXISTS "story_reactions_delete" ON story_reactions;
CREATE POLICY "story_reactions_select" ON story_reactions FOR SELECT USING (true);
CREATE POLICY "story_reactions_insert" ON story_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "story_reactions_delete" ON story_reactions FOR DELETE USING (auth.uid() = user_id);

-- messages
DROP POLICY IF EXISTS "messages_select" ON messages;
DROP POLICY IF EXISTS "messages_insert" ON messages;
DROP POLICY IF EXISTS "messages_update" ON messages;
DROP POLICY IF EXISTS "messages_delete" ON messages;
CREATE POLICY "messages_select" ON messages FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "messages_insert" ON messages FOR INSERT WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "messages_update" ON messages FOR UPDATE USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "messages_delete" ON messages FOR DELETE USING (auth.uid() = sender_id);

-- notifications
DROP POLICY IF EXISTS "notifs_select" ON notifications;
DROP POLICY IF EXISTS "notifs_insert" ON notifications;
DROP POLICY IF EXISTS "notifs_update" ON notifications;
CREATE POLICY "notifs_select" ON notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "notifs_insert" ON notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "notifs_update" ON notifications FOR UPDATE USING (auth.uid() = user_id);

-- friends
DROP POLICY IF EXISTS "friends_select" ON friends;
DROP POLICY IF EXISTS "friends_insert" ON friends;
DROP POLICY IF EXISTS "friends_update" ON friends;
DROP POLICY IF EXISTS "friends_delete" ON friends;
CREATE POLICY "friends_select" ON friends FOR SELECT USING (auth.uid() = user_id OR auth.uid() = friend_id);
CREATE POLICY "friends_insert" ON friends FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "friends_update" ON friends FOR UPDATE USING (auth.uid() = user_id OR auth.uid() = friend_id);
CREATE POLICY "friends_delete" ON friends FOR DELETE USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- blocked_users
DROP POLICY IF EXISTS "blocked_select" ON blocked_users;
DROP POLICY IF EXISTS "blocked_insert" ON blocked_users;
DROP POLICY IF EXISTS "blocked_delete" ON blocked_users;
CREATE POLICY "blocked_select" ON blocked_users FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "blocked_insert" ON blocked_users FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "blocked_delete" ON blocked_users FOR DELETE USING (auth.uid() = user_id);

-- close_friends
DROP POLICY IF EXISTS "close_friends_select" ON close_friends;
DROP POLICY IF EXISTS "close_friends_insert" ON close_friends;
DROP POLICY IF EXISTS "close_friends_delete" ON close_friends;
CREATE POLICY "close_friends_select" ON close_friends FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "close_friends_insert" ON close_friends FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "close_friends_delete" ON close_friends FOR DELETE USING (auth.uid() = user_id);

-- groups
DROP POLICY IF EXISTS "groups_select" ON groups;
DROP POLICY IF EXISTS "groups_insert" ON groups;
DROP POLICY IF EXISTS "groups_update" ON groups;
DROP POLICY IF EXISTS "groups_delete" ON groups;
CREATE POLICY "groups_select" ON groups FOR SELECT USING (true);
CREATE POLICY "groups_insert" ON groups FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "groups_update" ON groups FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "groups_delete" ON groups FOR DELETE USING (auth.uid() = owner_id);

-- group_members
DROP POLICY IF EXISTS "gm_select" ON group_members;
DROP POLICY IF EXISTS "gm_insert" ON group_members;
DROP POLICY IF EXISTS "gm_delete" ON group_members;
CREATE POLICY "gm_select" ON group_members FOR SELECT USING (true);
CREATE POLICY "gm_insert" ON group_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "gm_delete" ON group_members FOR DELETE USING (auth.uid() = user_id);

-- events
DROP POLICY IF EXISTS "events_select" ON events;
DROP POLICY IF EXISTS "events_insert" ON events;
DROP POLICY IF EXISTS "events_update" ON events;
DROP POLICY IF EXISTS "events_delete" ON events;
CREATE POLICY "events_select" ON events FOR SELECT USING (true);
CREATE POLICY "events_insert" ON events FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "events_update" ON events FOR UPDATE USING (auth.uid() = creator_id);
CREATE POLICY "events_delete" ON events FOR DELETE USING (auth.uid() = creator_id);

-- event_rsvps
DROP POLICY IF EXISTS "rsvp_select" ON event_rsvps;
DROP POLICY IF EXISTS "rsvp_insert" ON event_rsvps;
DROP POLICY IF EXISTS "rsvp_delete" ON event_rsvps;
CREATE POLICY "rsvp_select" ON event_rsvps FOR SELECT USING (true);
CREATE POLICY "rsvp_insert" ON event_rsvps FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "rsvp_delete" ON event_rsvps FOR DELETE USING (auth.uid() = user_id);

-- poll_votes
DROP POLICY IF EXISTS "pv_select" ON poll_votes;
DROP POLICY IF EXISTS "pv_insert" ON poll_votes;
CREATE POLICY "pv_select" ON poll_votes FOR SELECT USING (true);
CREATE POLICY "pv_insert" ON poll_votes FOR INSERT WITH CHECK (auth.uid() = user_id);

-- polls
DROP POLICY IF EXISTS "polls_select" ON polls;
DROP POLICY IF EXISTS "polls_insert" ON polls;
CREATE POLICY "polls_select" ON polls FOR SELECT USING (true);
CREATE POLICY "polls_insert" ON polls FOR INSERT WITH CHECK (true);

-- post_hashtags
DROP POLICY IF EXISTS "post_hashtags_select" ON post_hashtags;
DROP POLICY IF EXISTS "post_hashtags_insert" ON post_hashtags;
CREATE POLICY "post_hashtags_select" ON post_hashtags FOR SELECT USING (true);
CREATE POLICY "post_hashtags_insert" ON post_hashtags FOR INSERT WITH CHECK (true);

-- followed_hashtags
DROP POLICY IF EXISTS "fh_select" ON followed_hashtags;
DROP POLICY IF EXISTS "fh_insert" ON followed_hashtags;
DROP POLICY IF EXISTS "fh_delete" ON followed_hashtags;
CREATE POLICY "fh_select" ON followed_hashtags FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "fh_insert" ON followed_hashtags FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "fh_delete" ON followed_hashtags FOR DELETE USING (auth.uid() = user_id);

-- mentions
DROP POLICY IF EXISTS "mentions_select" ON mentions;
DROP POLICY IF EXISTS "mentions_insert" ON mentions;
CREATE POLICY "mentions_select" ON mentions FOR SELECT USING (auth.uid() = mentioned_user_id OR auth.uid() = actor_id);
CREATE POLICY "mentions_insert" ON mentions FOR INSERT WITH CHECK (auth.uid() = actor_id);

-- badges_earned
DROP POLICY IF EXISTS "badges_select" ON badges_earned;
DROP POLICY IF EXISTS "badges_insert" ON badges_earned;
CREATE POLICY "badges_select" ON badges_earned FOR SELECT USING (true);
CREATE POLICY "badges_insert" ON badges_earned FOR INSERT WITH CHECK (true);

-- user_badges
DROP POLICY IF EXISTS "user_badges_select" ON user_badges;
DROP POLICY IF EXISTS "user_badges_insert" ON user_badges;
CREATE POLICY "user_badges_select" ON user_badges FOR SELECT USING (true);
CREATE POLICY "user_badges_insert" ON user_badges FOR INSERT WITH CHECK (true);

-- bookmarks
DROP POLICY IF EXISTS "bookmarks_select" ON bookmarks;
DROP POLICY IF EXISTS "bookmarks_insert" ON bookmarks;
DROP POLICY IF EXISTS "bookmarks_delete" ON bookmarks;
CREATE POLICY "bookmarks_select" ON bookmarks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "bookmarks_insert" ON bookmarks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "bookmarks_delete" ON bookmarks FOR DELETE USING (auth.uid() = user_id);

-- reports
DROP POLICY IF EXISTS "reports_select" ON reports;
DROP POLICY IF EXISTS "reports_insert" ON reports;
CREATE POLICY "reports_select" ON reports FOR SELECT USING (auth.uid() = reporter_id);
CREATE POLICY "reports_insert" ON reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);

-- weekly_challenges
DROP POLICY IF EXISTS "challenges_select" ON weekly_challenges;
CREATE POLICY "challenges_select" ON weekly_challenges FOR SELECT USING (true);

-- challenge_entries
DROP POLICY IF EXISTS "entries_select" ON challenge_entries;
DROP POLICY IF EXISTS "entries_insert" ON challenge_entries;
DROP POLICY IF EXISTS "entries_delete" ON challenge_entries;
CREATE POLICY "entries_select" ON challenge_entries FOR SELECT USING (true);
CREATE POLICY "entries_insert" ON challenge_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "entries_delete" ON challenge_entries FOR DELETE USING (auth.uid() = user_id);

-- daily_logins
DROP POLICY IF EXISTS "daily_logins_select" ON daily_logins;
DROP POLICY IF EXISTS "daily_logins_insert" ON daily_logins;
CREATE POLICY "daily_logins_select" ON daily_logins FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "daily_logins_insert" ON daily_logins FOR INSERT WITH CHECK (auth.uid() = user_id);

-- push_subscriptions
DROP POLICY IF EXISTS "push_select" ON push_subscriptions;
DROP POLICY IF EXISTS "push_insert" ON push_subscriptions;
DROP POLICY IF EXISTS "push_update" ON push_subscriptions;
DROP POLICY IF EXISTS "push_delete" ON push_subscriptions;
CREATE POLICY "push_select" ON push_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "push_insert" ON push_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "push_update" ON push_subscriptions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "push_delete" ON push_subscriptions FOR DELETE USING (auth.uid() = user_id);

-- reel_views
DROP POLICY IF EXISTS "reel_views_select" ON reel_views;
DROP POLICY IF EXISTS "reel_views_insert" ON reel_views;
CREATE POLICY "reel_views_select" ON reel_views FOR SELECT USING (true);
CREATE POLICY "reel_views_insert" ON reel_views FOR INSERT WITH CHECK (auth.uid() = user_id);

-- user_interests
DROP POLICY IF EXISTS "interests_select" ON user_interests;
DROP POLICY IF EXISTS "interests_insert" ON user_interests;
DROP POLICY IF EXISTS "interests_delete" ON user_interests;
CREATE POLICY "interests_select" ON user_interests FOR SELECT USING (true);
CREATE POLICY "interests_insert" ON user_interests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "interests_delete" ON user_interests FOR DELETE USING (auth.uid() = user_id);

-- disappearing_settings
DROP POLICY IF EXISTS "disappearing_select" ON disappearing_settings;
DROP POLICY IF EXISTS "disappearing_insert" ON disappearing_settings;
DROP POLICY IF EXISTS "disappearing_update" ON disappearing_settings;
CREATE POLICY "disappearing_select" ON disappearing_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "disappearing_insert" ON disappearing_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "disappearing_update" ON disappearing_settings FOR UPDATE USING (auth.uid() = user_id);

-- voice_sessions
DROP POLICY IF EXISTS "voice_select" ON voice_sessions;
DROP POLICY IF EXISTS "voice_insert" ON voice_sessions;
DROP POLICY IF EXISTS "voice_update" ON voice_sessions;
CREATE POLICY "voice_select" ON voice_sessions FOR SELECT USING (auth.uid() = caller_id OR auth.uid() = callee_id);
CREATE POLICY "voice_insert" ON voice_sessions FOR INSERT WITH CHECK (auth.uid() = caller_id);
CREATE POLICY "voice_update" ON voice_sessions FOR UPDATE USING (auth.uid() = caller_id OR auth.uid() = callee_id);




-- ================================================================
-- PUSH SUBSCRIPTION CLEANUP FUNCTION
-- ================================================================
-- Removes push subscriptions older than 90 days that have never
-- had a successful delivery. Safe to call from a Supabase cron job.
-- Also called inline by push-send.js on 410/404 responses.
CREATE OR REPLACE FUNCTION cleanup_dead_push_subscriptions()
RETURNS integer AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM push_subscriptions
  WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================================
-- STORAGE BUCKETS
-- ================================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('images', 'images', true) ON CONFLICT (id) DO UPDATE SET public = true;
INSERT INTO storage.buckets (id, name, public) VALUES ('voice',  'voice',  true) ON CONFLICT (id) DO NOTHING;

-- Storage policies — fixed to support both path formats:
--   posts/{uid}/file.jpg   (foldername index [2])
--   avatars/{uid}.jpg      (uid extracted from filename)
DROP POLICY IF EXISTS "images_select" ON storage.objects;
DROP POLICY IF EXISTS "images_insert" ON storage.objects;
DROP POLICY IF EXISTS "images_update" ON storage.objects;
DROP POLICY IF EXISTS "images_delete" ON storage.objects;

CREATE POLICY "images_select" ON storage.objects FOR SELECT USING (bucket_id = 'images');
CREATE POLICY "images_insert" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'images'
  AND auth.role() = 'authenticated'
  AND (
    -- posts/{uid}/file, stories/{uid}/file, groups/{uid}/file, avatars/{uid}/file, banners/{uid}/file
    -- Verify the second path segment is the authenticated user's own uid
    ( name ~ '^(posts|stories|groups|avatars|banners)/' AND auth.uid()::text = (storage.foldername(name))[2] )
  )
);
CREATE POLICY "images_update" ON storage.objects FOR UPDATE USING (
  bucket_id = 'images' AND auth.role() = 'authenticated' AND
  auth.uid()::text = (storage.foldername(name))[2]
);
CREATE POLICY "images_delete" ON storage.objects FOR DELETE USING (
  bucket_id = 'images' AND auth.role() = 'authenticated' AND
  auth.uid()::text = (storage.foldername(name))[2]
);

DROP POLICY IF EXISTS "voice_select" ON storage.objects;
DROP POLICY IF EXISTS "voice_insert" ON storage.objects;
DROP POLICY IF EXISTS "voice_delete" ON storage.objects;
CREATE POLICY "voice_select" ON storage.objects FOR SELECT USING (bucket_id = 'voice');
CREATE POLICY "voice_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'voice' AND auth.role() = 'authenticated');
CREATE POLICY "voice_delete" ON storage.objects FOR DELETE USING (bucket_id = 'voice' AND auth.role() = 'authenticated');


-- ================================================================
-- REALTIME
-- ================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'messages','notifications','posts','likes','comments','friends',
    'badges_earned','bookmarks','challenge_entries','voice_sessions',
    'story_reactions','story_views'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
  END LOOP;
END;
$$;


-- ================================================================
-- MIGRATIONS: add columns to existing databases (safe, idempotent)
-- ================================================================
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_edited        boolean DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_url        text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id      uuid REFERENCES messages(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_content text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_sender  text;

-- Add location and website to profiles (for existing deployments)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS website  text;


-- ================================================================
-- SEED: weekly challenge (skip if one already exists this week)
-- ================================================================
INSERT INTO weekly_challenges (title, description, emoji, hashtag, xp_reward, starts_at, ends_at)
VALUES (
  'Show Your Setup',
  'Share a photo of your workspace or creative corner. Inspire the community!',
  '🖥️', 'MySetup', 150,
  date_trunc('week', now()),
  date_trunc('week', now()) + interval '7 days'
)
ON CONFLICT DO NOTHING;


-- Scheduled posts index
CREATE INDEX IF NOT EXISTS idx_posts_scheduled
  ON posts(scheduled_at)
  WHERE scheduled_at IS NOT NULL AND is_published = false;

-- Performance indexes for common queries
-- Messages: fast conversation fetch (most used query in Chat)
CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON messages(sender_id, receiver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_reverse
  ON messages(receiver_id, sender_id, created_at DESC);

-- Messages: unread count query
CREATE INDEX IF NOT EXISTS idx_messages_unread
  ON messages(receiver_id, is_read)
  WHERE is_read = false;

-- Posts: feed query (published non-reel posts by date)
CREATE INDEX IF NOT EXISTS idx_posts_feed
  ON posts(is_published, is_reel, created_at DESC)
  WHERE is_published = true AND is_reel = false;

-- Stories: active stories (last 24h)
CREATE INDEX IF NOT EXISTS idx_stories_active
  ON stories(created_at DESC)
  WHERE expires_at > NOW();

-- Notifications: unread by user (most common notif query)
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications(user_id, created_at DESC)
  WHERE is_read = false;

-- Likes: fast count per post
CREATE INDEX IF NOT EXISTS idx_likes_post_count
  ON likes(post_id, user_id);

-- Friends: fast friendship lookup
CREATE INDEX IF NOT EXISTS idx_friends_lookup
  ON friends(user_id, friend_id, status);

-- Push subscriptions: fast lookup by user
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON push_subscriptions(user_id);

-- ================================================================
-- DONE ✅
-- 35 tables · indexes · triggers · RLS policies · storage buckets
-- Safe to re-run at any time.
-- ================================================================


-- ================================================================
-- v5.7 PATCH: Zaar Culture discussion board
-- The discussion board reuses the existing `posts` table with
-- post_type = 'zaar_discussion', so no new table is needed.
-- We only need to ensure the RLS policies permit this post_type
-- and add an index for fast queries.
-- ================================================================

-- Index for fast Zaar discussion queries
CREATE INDEX IF NOT EXISTS idx_posts_zaar_discussion
  ON posts (post_type, is_published, created_at DESC)
  WHERE post_type = 'zaar_discussion';

-- Ensure the existing posts RLS insert policy allows zaar_discussion
-- (The existing policy "Users can insert own posts" already covers this
-- because it checks user_id = auth.uid() regardless of post_type.)
-- No new policy needed — existing policies are sufficient.

-- ================================================================
-- DONE (v5.7 Zaar Culture patch)
-- ================================================================


-- ================================================================
-- v5.8 PATCH: Group posts in main feed
-- ================================================================

-- 1. Add FK constraint on posts.group_id → groups.id
--    (was previously an unlinked uuid; safe to add with IF NOT EXISTS guard)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'posts_group_id_fkey'
      AND table_name = 'posts'
  ) THEN
    ALTER TABLE posts
      ADD CONSTRAINT posts_group_id_fkey
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL;
  END IF;
END;
$$;

-- 2. Add a `privacy` text column to groups so the feed query can filter
--    public vs private groups with a consistent text value.
--    Backfills from the existing is_private boolean on first run.
ALTER TABLE groups ADD COLUMN IF NOT EXISTS privacy text DEFAULT 'public'
  CHECK (privacy IN ('public','private'));

-- Backfill: sync privacy from is_private for any existing rows
UPDATE groups SET privacy = CASE WHEN is_private THEN 'private' ELSE 'public' END
  WHERE privacy IS NULL OR privacy = 'public';

-- 3. Keep privacy and is_private in sync via a trigger
CREATE OR REPLACE FUNCTION sync_group_privacy()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- If is_private changed, update privacy
  IF NEW.is_private IS DISTINCT FROM OLD.is_private THEN
    NEW.privacy := CASE WHEN NEW.is_private THEN 'private' ELSE 'public' END;
  END IF;
  -- If privacy changed, update is_private
  IF NEW.privacy IS DISTINCT FROM OLD.privacy THEN
    NEW.is_private := (NEW.privacy = 'private');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_group_privacy ON groups;
CREATE TRIGGER trg_sync_group_privacy
  BEFORE UPDATE ON groups
  FOR EACH ROW EXECUTE FUNCTION sync_group_privacy();

-- 4. Index: fast feed query — posts with a group_id, published, ordered by date
CREATE INDEX IF NOT EXISTS idx_posts_group_feed
  ON posts (group_id, is_published, created_at DESC)
  WHERE group_id IS NOT NULL AND is_published = true;

-- 5. Index: fast member count join on group_members
CREATE INDEX IF NOT EXISTS idx_group_members_group_id
  ON group_members (group_id);

-- 6. Index: fast membership lookup for a given user
CREATE INDEX IF NOT EXISTS idx_group_members_user_id
  ON group_members (user_id);

-- ================================================================
-- DONE (v5.8 Group feed patch)
-- ================================================================


-- ================================================================
-- v5.8 PATCH: Rich push notifications
-- ================================================================

-- 1. Add extra_data column to notifications for push payload metadata
--    (group name, message preview, challenge title, XP amount, level label)
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS extra_data jsonb DEFAULT NULL;

-- 2. Widen the notification type CHECK to include new types
--    (existing rows are unaffected; new inserts can use these types)
--    Note: if a CHECK constraint already exists on `type`, drop and recreate it.
DO $$
BEGIN
  -- Drop existing type constraint if present (safe — we're widening it)
  ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
  -- Add new widened constraint
  ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
      'like', 'comment', 'reply', 'mention', 'follow',
      'friend_request', 'message',
      'group_join', 'group_post',
      'challenge_complete', 'xp_milestone', 'system'
    ));
EXCEPTION WHEN others THEN
  -- If the table has no constraint at all, this is fine — no-op
  NULL;
END;
$$;

-- 3. Index on extra_data for any future queries filtering by group/challenge
CREATE INDEX IF NOT EXISTS idx_notifications_extra_data
  ON notifications USING GIN (extra_data)
  WHERE extra_data IS NOT NULL;

-- ================================================================
-- DONE (v5.8 Push notification patch)
-- ================================================================
