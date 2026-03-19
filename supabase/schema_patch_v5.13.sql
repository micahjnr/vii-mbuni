-- ─── v5.13 — Voice Pronunciations + SRS Flashcards ──────────────────────────

-- Community pronunciation recordings
CREATE TABLE IF NOT EXISTS zaar_pronunciations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  zaar_word     text NOT NULL,
  audio_url     text NOT NULL,
  upvotes       int DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_zaar_pronunciations_word ON zaar_pronunciations(zaar_word);
ALTER TABLE zaar_pronunciations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read pronunciations"  ON zaar_pronunciations FOR SELECT USING (true);
CREATE POLICY "Users insert own pronunciation" ON zaar_pronunciations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own pronunciation" ON zaar_pronunciations FOR DELETE USING (auth.uid() = user_id);

-- Upvotes for pronunciations
CREATE TABLE IF NOT EXISTS zaar_pronunciation_votes (
  user_id       uuid REFERENCES profiles(id) ON DELETE CASCADE,
  pronunciation_id uuid REFERENCES zaar_pronunciations(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, pronunciation_id)
);
ALTER TABLE zaar_pronunciation_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own votes" ON zaar_pronunciation_votes FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Public read votes" ON zaar_pronunciation_votes FOR SELECT USING (true);

-- SRS (Spaced Repetition) flashcard progress per user
CREATE TABLE IF NOT EXISTS zaar_srs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  zaar_word     text NOT NULL,
  ease_factor   float DEFAULT 2.5,       -- SM-2 ease factor
  interval_days int DEFAULT 1,           -- days until next review
  repetitions   int DEFAULT 0,           -- successful reviews in a row
  next_review   date DEFAULT CURRENT_DATE,
  last_review   date,
  created_at    timestamptz DEFAULT now(),
  UNIQUE(user_id, zaar_word)
);
CREATE INDEX IF NOT EXISTS idx_zaar_srs_user_review ON zaar_srs(user_id, next_review);
ALTER TABLE zaar_srs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own SRS" ON zaar_srs FOR ALL USING (auth.uid() = user_id);
