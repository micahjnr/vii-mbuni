-- v5.12: Zaar Dictionary Favourites
-- Run this in your Supabase SQL editor

create table if not exists zaar_favourites (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  zaar_word   text not null,
  english     text,
  hausa       text,
  pos         text,
  created_at  timestamptz default now(),
  unique(user_id, zaar_word)
);

-- RLS
alter table zaar_favourites enable row level security;

create policy "Users manage own favourites"
  on zaar_favourites for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Index for fast lookup
create index if not exists idx_zaar_favs_user on zaar_favourites(user_id);
