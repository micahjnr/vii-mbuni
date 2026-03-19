# Vii-Mbuni — Supabase Database

## Setup

Run `schema.sql` in **Supabase → SQL Editor → Run**.

That single file sets up everything:
- All 35 tables
- Indexes
- RLS policies
- Storage buckets (images + voice)
- Triggers (signup, follow counts)
- RPCs (award_xp, claim_daily_streak, increment_view_count, etc.)
- Realtime subscriptions

## Re-running

The file is fully idempotent — safe to run again at any time on an existing project.  
It will only add what is missing, never drops data.

## Fresh project checklist

1. Run `schema.sql`
2. Set environment variables in Netlify (see `.env.example`)
3. Deploy frontend
