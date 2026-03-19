## v5.8.1 — APK-Ready Polish (2026-03-18)

### APK / PWA Readiness
- ✅ **Auth guard hardened** — persists user session, 5s safety timeout, never shows pages without login
- ✅ **manifest.json** — TWA-ready: shortcuts, screenshots, maskable icon, scope, display_override
- ✅ **index.html** — full mobile meta tags: apple-mobile-web-app, viewport-fit=cover, OG tags
- ✅ **Safe area insets** — pt-safe/pb-safe/pl-safe/pr-safe utilities for notch + gesture bar
- ✅ **Dynamic viewport** — 100dvh everywhere (Chat, CallScreen) — survives Android keyboard
- ✅ **Splash screen** — dark overlay while JS loads, fades out on mount (no white flash)
- ✅ **Offline page** — /offline.html served by SW when totally offline
- ✅ **Android back button** — history popstate guard prevents accidental app exit
- ✅ **Portrait lock** — video calls lock to portrait on mobile via Screen Orientation API
- ✅ **Audio routing** — setSinkId wired to Speaker toggle (earpiece ↔ speaker)
- ✅ **Tap highlight removed** — no blue flash on touch (Android Chrome default)
- ✅ **assetlinks.json** — TWA Digital Asset Links placeholder at /.well-known/
- ✅ **APK_BUILD_GUIDE.md** — step-by-step instructions for PWABuilder, Bubblewrap, Capacitor
- ✅ **Vite build** — lucide-react + date-fns split into own chunks, ES2020 target, esbuild minify
- ✅ **CSP updated** — relay.metered.ca, numb.viagenie.ca, stun.cloudflare.com added

## v5.8.0 — 2026-03-18

### New Features
- 🧠 **Flashcards (SRS)** — Spaced repetition study mode using SM-2 algorithm. Review due cards or learn new words. Rate each card (Again / Hard / Easy) and the app schedules the next review automatically.
- 🎙️ **Community Pronunciations** — Record and submit your own Zaar word pronunciations. Listen to how others pronounce words, upvote the best recordings.
- 🌍 **AI Post Translation** — Translate any post to English, Hausa, or Zaar inline with one tap using Groq AI.
- ⚡ **Word of the Week** — Scheduled Netlify function sends a Zaar Word of the Week push notification every Monday at 8am.
- 📍 **Nearby People** — Discover friends in your city. Add your city in Profile settings to appear in Nearby.
- 🎙️ **Stories 2.0** — Add text overlays with custom colours and emoji stickers when creating stories.
- 📡 **Live Reactions on Reels** — Tap emoji buttons to send live reactions to other viewers via Supabase Realtime broadcast.
- 🔤 **Zaar Special Character Keyboard** — Virtual keyboard in the Dictionary for inserting tone marks and special Zaar characters.
- 🎨 **Profile Themes** — Pick a custom colour for your profile banner from 8 preset colours.
- 🌙 **Floating Dark/Light Toggle** — Quick-access theme toggle pill on mobile, above the bottom nav.

### Improvements
- Tab transitions in Zaar Culture now animate with a smooth fade-in + slide-up.
- PWA offline support upgraded: zaarDict.json cached on install, more Supabase endpoints cached, offline/online banner shown.
- Dictionary upgraded to 4,205 entries + 433 example sentences (from manual PDF).

# Vii-Mbuni — Patch Notes

## v5.11 — Zaar Dictionary Search Engine + Profile & Offline Fixes

### 🌟 New feature — Zaar–English–Hausa Dictionary

**`src/lib/zaarDict.js`** *(new — 206 KB)*
- Full dictionary data module — **2,766 entries** extracted from the official Zaar–English–Hausa PDF
- Each entry contains: Zaar word, English meaning, Hausa equivalent, part of speech, and usage notes

**`src/pages/ZaarCulture.jsx`** — new **📚 Dictionary** tab (first tab, most prominent)
- **Live search** with 250ms debounce — searches as you type with no lag
- **3 search modes**: search by Zaar word, English meaning, or Hausa equivalent
- **Part-of-speech badges** — colour-coded by type (noun=blue, verb=green, exclamation=amber, etc.)
- **Expandable entries** — tap any result to see a full card with Zaar / English / Hausa / POS / Notes panels
- **🔊 Pronunciation button** — uses Web Speech API to speak the Zaar word aloud (Hausa voice, 0.85x rate)
- **Stats row** when no search active: total entries, noun count, verb count
- Shows first 60 results with a refine-your-search prompt if more exist

### 🟡 UX fixes

**`src/pages/Profile.jsx`**
- Settings → Edit Profile now navigates to `/profile?edit=1` and opens the edit form directly — no more hunting for the Edit button on the profile page

**`src/App.jsx`**
- **Offline detection banner** — persistent `📡 You are offline` toast appears instantly when internet is lost; `Back online!` toast when it restores; also checks on mount if already offline

---
## v5.10 — Reels, Events, Friends, Bookmarks & Analytics Polish

### 🔴 Bug fixes

**`src/pages/Reels.jsx`**
- **Autoplay on scroll** — `IntersectionObserver` (60% visibility threshold) now auto-activates the reel in view; no more needing to tap each reel to start it
- **`preload="metadata"`** added to every reel `<video>` — browser pre-fetches duration/dimensions so playback starts instantly instead of buffering
- **View count fixed** — guarded by a `useRef` flag so one activation = one view, no matter how many re-renders happen while the reel is playing (likes, comment updates, etc.)
- **Progress bar** — thin white bar at the top of each active reel shows playback position in real time
- **Swipe gestures** — swipe up/down (min 50px) on mobile navigates to next/prev reel; no more relying only on the chevron buttons

### 🟡 UX improvements

**`src/pages/Groups.jsx`**
- **Leave confirmation** — tapping "Leave" now shows inline "Yes, leave / Cancel" buttons instead of firing immediately; prevents accidental group exits

**`src/pages/Events.jsx`**
- **Optimistic RSVP** — Going/Not Going toggles instantly in the UI (no flicker/refetch delay); rolls back cleanly if the DB write fails; shows a toast confirmation on every tap

**`src/pages/Bookmarks.jsx`**
- **Infinite scroll pagination** — rewrote from a single unlimited query to `useInfiniteQuery` with 10 posts per page and an `IntersectionObserver` sentinel at the bottom; badge shows count with `+` when more pages remain

**`src/pages/Analytics.jsx`**
- **Date range filter** — added 7 / 30 / 90 day selector at the top; the posts-per-day chart, query window, and heading all update dynamically

**`src/pages/Friends.jsx`**
- **Online green dots on Suggestions & Requests** — `SuggestionCard` and `RequestCard` now receive `isOnline` from the existing `onlineUsers` store and render the same gradient ring + green dot that `FriendCard` already had; the store was already tracking presence, it just wasn't being used in these two cards

---
## v5.9.1 — HD Video Call Quality

### Root causes fixed

The video call system had **no quality constraints** anywhere in the media pipeline — the browser was defaulting to the lowest safe resolution (often 320×240 at 15 fps) and capping its own bitrate conservatively.

**`src/hooks/useWebRTCCall.js`**

- **`getMedia`** — now requests **720p HD @ 30fps** as the ideal, with automatic fallback to 480p then bare minimum if the device can't do HD. Also added proper audio constraints (`echoCancellation`, `noiseSuppression`, `sampleRate: 48000`) for cleaner voice
- **`createPeer`** — added `applyVideoEncoding()` helper that calls `RTCRtpSender.setParameters()` to set:
  - `maxBitrate: 2,500,000` (2.5 Mbps — clear HD video)
  - `maxFramerate: 30`
  - `networkPriority: 'high'` + `priority: 'high'`
  - Called on `onnegotiationneeded` so it fires as soon as the connection is established
- **`createPeer`** RTCPeerConnection config — added `bundlePolicy: 'max-bundle'` and `rtcpMuxPolicy: 'require'` which reduce latency by multiplexing audio/video/RTCP onto a single transport
- **`acceptCall`** — applies HD encoding 500ms after the callee answers (callee side)
- **`subscribeToSession`** — applies HD encoding 500ms after the caller detects the call went active (caller side)
- **`flipCamera`** — now requests HD constraints when switching cameras instead of bare `{ facingMode }` (quality was dropping after every flip)
- **`stopScreenShare`** — now restores HD camera instead of bare default quality

**`src/components/ui/CallScreen.jsx`**
- Video elements get `imageRendering: 'auto'` so the browser's compositor uses highest-quality scaling

### Result
- Local camera: **720p @ 30fps** instead of 240-480p @ 15fps
- Bitrate: up to **2.5 Mbps** instead of browser default ~500 Kbps
- Audio: **48 kHz stereo-grade mono** with echo/noise cancellation
- Camera flip & screen share restore: **no more quality drop**

---
## v5.9 — Security, UX Fixes & Polish

### 🔴 Bug fixes

**`src/pages/ResetPassword.jsx`** *(new file)*
- Added the missing `/reset-password` route that the "Forgot Password" email links to
- Validates the Supabase recovery session on mount — redirects to `/login` if token is expired or already used
- Shows a loading spinner while session resolves, success screen on completion, then auto-redirects to the app

**`src/App.jsx`**
- Registered the new `/reset-password` route (outside AuthGuard so it works while logged out)

**`src/pages/Settings.jsx`** — Change Password form
- Added **Current Password** field — users must verify their existing password before updating
- Re-authenticates via `signInWithPassword` first; shows a clear error if the current password is wrong
- Fixed the form container background (`dark:bg-surface-800`) — white-on-white bug is gone
- Account deletion now actually deletes posts, messages, friends, notifications, and profile rows before signing out (previously just showed a toast saying "contact support")

### 🟡 UX improvements

**`src/pages/Chat.jsx`**
- Unread message badge now clears **instantly** when you open a conversation (optimistic update) — no more stale badge after reading messages
- Counts remaining unread messages from *other* conversations correctly so the badge only drops by the right amount

**`src/components/layout/Layout.jsx`**
- Removed the duplicate 🔔/🔕 push-toggle emoji button sitting next to the bell — one bell icon now does everything
- Bell still shows the red unread count badge and the brand-coloured dot when push is enabled
- **Hold the bell for 600 ms** (or right-click on desktop) to toggle push notifications on/off
- FAB `+ Post` button raised from `-mt-5` to `-mt-7` so it clears the nav bar and no longer overlaps notification badges

**`src/pages/AIAssistant.jsx`**
- Chat history now persists across navigation via `localStorage` — switching pages no longer wipes your conversation
- History is capped at the last 40 messages to stay within storage limits
- Clearing chat also wipes `localStorage` cleanly

---


## v5.11 — Zaar Dictionary Search Engine + Profile & Offline Fixes

### 🌟 New feature — Zaar–English–Hausa Dictionary

**`src/lib/zaarDict.js`** *(new — 206 KB)*
- Full dictionary data module — **2,766 entries** extracted from the official Zaar–English–Hausa PDF
- Each entry contains: Zaar word, English meaning, Hausa equivalent, part of speech, and usage notes

**`src/pages/ZaarCulture.jsx`** — new **📚 Dictionary** tab (first tab, most prominent)
- **Live search** with 250ms debounce — searches as you type with no lag
- **3 search modes**: search by Zaar word, English meaning, or Hausa equivalent
- **Part-of-speech badges** — colour-coded by type (noun=blue, verb=green, exclamation=amber, etc.)
- **Expandable entries** — tap any result to see a full card with Zaar / English / Hausa / POS / Notes panels
- **🔊 Pronunciation button** — uses Web Speech API to speak the Zaar word aloud (Hausa voice, 0.85x rate)
- **Stats row** when no search active: total entries, noun count, verb count
- Shows first 60 results with a refine-your-search prompt if more exist

### 🟡 UX fixes

**`src/pages/Profile.jsx`**
- Settings → Edit Profile now navigates to `/profile?edit=1` and opens the edit form directly — no more hunting for the Edit button on the profile page

**`src/App.jsx`**
- **Offline detection banner** — persistent `📡 You are offline` toast appears instantly when internet is lost; `Back online!` toast when it restores; also checks on mount if already offline

---
## v5.10 — Reels, Events, Friends, Bookmarks & Analytics Polish

### 🔴 Bug fixes

**`src/pages/Reels.jsx`**
- **Autoplay on scroll** — `IntersectionObserver` (60% visibility threshold) now auto-activates the reel in view; no more needing to tap each reel to start it
- **`preload="metadata"`** added to every reel `<video>` — browser pre-fetches duration/dimensions so playback starts instantly instead of buffering
- **View count fixed** — guarded by a `useRef` flag so one activation = one view, no matter how many re-renders happen while the reel is playing (likes, comment updates, etc.)
- **Progress bar** — thin white bar at the top of each active reel shows playback position in real time
- **Swipe gestures** — swipe up/down (min 50px) on mobile navigates to next/prev reel; no more relying only on the chevron buttons

### 🟡 UX improvements

**`src/pages/Groups.jsx`**
- **Leave confirmation** — tapping "Leave" now shows inline "Yes, leave / Cancel" buttons instead of firing immediately; prevents accidental group exits

**`src/pages/Events.jsx`**
- **Optimistic RSVP** — Going/Not Going toggles instantly in the UI (no flicker/refetch delay); rolls back cleanly if the DB write fails; shows a toast confirmation on every tap

**`src/pages/Bookmarks.jsx`**
- **Infinite scroll pagination** — rewrote from a single unlimited query to `useInfiniteQuery` with 10 posts per page and an `IntersectionObserver` sentinel at the bottom; badge shows count with `+` when more pages remain

**`src/pages/Analytics.jsx`**
- **Date range filter** — added 7 / 30 / 90 day selector at the top; the posts-per-day chart, query window, and heading all update dynamically

**`src/pages/Friends.jsx`**
- **Online green dots on Suggestions & Requests** — `SuggestionCard` and `RequestCard` now receive `isOnline` from the existing `onlineUsers` store and render the same gradient ring + green dot that `FriendCard` already had; the store was already tracking presence, it just wasn't being used in these two cards

---
## v5.9.1 — HD Video Call Quality

### Root causes fixed

The video call system had **no quality constraints** anywhere in the media pipeline — the browser was defaulting to the lowest safe resolution (often 320×240 at 15 fps) and capping its own bitrate conservatively.

**`src/hooks/useWebRTCCall.js`**

- **`getMedia`** — now requests **720p HD @ 30fps** as the ideal, with automatic fallback to 480p then bare minimum if the device can't do HD. Also added proper audio constraints (`echoCancellation`, `noiseSuppression`, `sampleRate: 48000`) for cleaner voice
- **`createPeer`** — added `applyVideoEncoding()` helper that calls `RTCRtpSender.setParameters()` to set:
  - `maxBitrate: 2,500,000` (2.5 Mbps — clear HD video)
  - `maxFramerate: 30`
  - `networkPriority: 'high'` + `priority: 'high'`
  - Called on `onnegotiationneeded` so it fires as soon as the connection is established
- **`createPeer`** RTCPeerConnection config — added `bundlePolicy: 'max-bundle'` and `rtcpMuxPolicy: 'require'` which reduce latency by multiplexing audio/video/RTCP onto a single transport
- **`acceptCall`** — applies HD encoding 500ms after the callee answers (callee side)
- **`subscribeToSession`** — applies HD encoding 500ms after the caller detects the call went active (caller side)
- **`flipCamera`** — now requests HD constraints when switching cameras instead of bare `{ facingMode }` (quality was dropping after every flip)
- **`stopScreenShare`** — now restores HD camera instead of bare default quality

**`src/components/ui/CallScreen.jsx`**
- Video elements get `imageRendering: 'auto'` so the browser's compositor uses highest-quality scaling

### Result
- Local camera: **720p @ 30fps** instead of 240-480p @ 15fps
- Bitrate: up to **2.5 Mbps** instead of browser default ~500 Kbps
- Audio: **48 kHz stereo-grade mono** with echo/noise cancellation
- Camera flip & screen share restore: **no more quality drop**

---
## v5.9 — Video Posts with Client-Side Compression

Users can now post videos directly in their feed. Videos are automatically compressed and trimmed in the browser before upload — keeping storage costs low regardless of what the user picks.

### New: `src/lib/videoUtils.js`
- **`processVideo(file, onProgress)`** — full client-side video pipeline:
  - Reads the real duration via a `<video>` element before doing any work
  - **Hard trims to 2 minutes** — plays back the first 120 s through a canvas capture loop and stops the recorder there
  - **Re-encodes via `MediaRecorder`** at 1.2 Mbps video + 96 kbps audio (≈ 720p social quality). A 2-minute clip comes out under 20 MB
  - Caps resolution at **1280 × 720** — upscales are skipped
  - Prefers `video/webm` on Chromium, `video/mp4` on Safari — picks whichever the browser supports
  - Only swaps in the compressed file if it's actually smaller (no bloat on already-small clips)
  - **Three graceful fallback levels**: bitrate hints rejected → try without hints → `captureStream` not supported → return original file unchanged
  - `onProgress(0→100)` callback drives the progress bar in the UI

### New: Video upload in `CreatePostModal.jsx`
- **🎬 Video** button in toolbar (purple, beside Photo)
- Accepts any format the browser can decode (`video/*`)
- Pre-check rejects files over 500 MB with a clear toast before processing starts
- Shows the original file as an instant preview, then overlays a **processing UI** during compression:
  - Spinner + "Processing video…" heading
  - Animated progress bar (0 → 100%)
  - Stage label: "Analysing…" / "Compressing 43%" / "Finishing…"
- After processing, badges overlay the preview:
  - File size (`x.x MB`)
  - Duration (`0:47`)
  - **✂️ Trimmed to 2 min** (amber) — if the source was longer
  - **⚡ -62% size** (green) — compression saving shown as a percentage
- Toast notifications: trimmed alert + compression summary (`200 MB → 14.2 MB`)
- Video button shows a spinner and is disabled during processing; Post button is also locked until processing completes

### Infrastructure
- **`supabase/schema_patch_v5.9.sql`** — `videos` bucket limit set to **50 MB** (post-compression ceiling; a full 2-min clip at target bitrate is ~18 MB)

---

## v5.8 — Group Posts in Feed + Group Attribution + Rich Push Notifications

### New: Rich push notifications (LinkedIn/Facebook-style)

**`netlify/functions/push-send.js`** *(rebuilt)*
- Actor's **profile photo** sent as `image` — their face appears in the notification
- **`tag` per type** — likes stack together, comments stack together, each DM thread is its own group — exactly like LinkedIn's notification shade
- **`renotify: true`** — phone still vibrates when a notification group updates
- **Action buttons**: "View post" / "Reply" on comments, "Open" / "Reply" on DMs, "View profile" on follows
- **`requireInteraction: true`** on DMs — message notifications stay until dismissed
- **New types**: `message`, `group_join`, `group_post`, `challenge_complete`, `xp_milestone`, `friend_request`
- Reads `extra_data` JSONB for context: group name, message preview, challenge title, XP, level

**`public/sw.js`** *(upgraded)*
- Push handler passes all payload fields to `showNotification`: `image`, `tag`, `renotify`, `requireInteraction`, `actions`
- `notificationclick` handles action buttons — "Reply" opens the right conversation, "View" deep-links to post/profile
- Added `notificationclose` event handler
- `matchAll` uses `includeUncontrolled: true` so backgrounded tabs are found

**`supabase/schema.sql`** *(push patch)*
- `notifications.extra_data jsonb` column added for rich notification context
- `notifications_type_check` constraint widened for all new types
- `idx_notifications_extra_data` GIN index

---

### New: Group post attribution on PostCard
- Group attribution now appears in the post header, right after the timestamp — just like Facebook
- Shows the group emoji + name as a tappable brand-coloured link: `@micahjnr · 2m · 👥 Peace Makers`
- Reads from `post.group.name` (joined) or `post.group_name` (fallback) — shows nothing if the post has no group
- Tapping the group name navigates to `/groups`

**`src/pages/Home.jsx`** — `fetchFeed` query now joins `group:group_id (id, name, emoji, privacy, is_private)` so group attribution shows on all feed posts

**`src/pages/Groups.jsx`** — group-posts query now joins `group:group_id(...)` so attribution also shows inside the group view itself

---

### New: Group post discovery in the home feed

Users now see posts from public groups directly in their main feed, even if they haven't joined those groups yet. This lets the community discover active groups organically and join with one tap.

**`src/components/feed/GroupPostCard.jsx`** *(new file)*
- Dedicated card component for group posts appearing in the main feed
- Group banner at top: emoji, group name, member count, public/private indicator
- **Non-members** see a `+ Join Group` button — one tap inserts into `group_members`, awards +5 XP, and flips to `✓ Joined` without a page reload
- **Private groups** show a `🔒 Private` disabled button (no accidental join attempts)
- Inline comment box shown only to members; non-members see a "Join to comment" prompt with a link to the Groups page
- Full reaction picker, bookmark, and share — all wired to the same DB tables as `PostCard`
- Author sub-row shows avatar + username + timestamp beneath the group banner

**`src/pages/Home.jsx`** *(updated)*
- New `fetchGroupFeed(userId)` async function: fetches up to 10 recent posts with `group_id IS NOT NULL`, joins the group row, filters out private groups, resolves the user's current memberships
- New `useQuery(['group-feed'])` with `staleTime: 300_000` (5 min) — runs in parallel with the main infinite feed query, no waterfall
- Feed merge: one group post is injected after every 4th regular post; deduplication by post `id` prevents the same post appearing twice if a user is already a member and the post also appears in the regular feed
- `memberGroupIds` Set passed to each `GroupPostCard` so membership state is resolved from a single query rather than per-card fetches

**No schema changes required** — uses the existing `group_id` column on `posts`, `group_members`, `likes`, `comments`, `bookmarks`, and `notifications` tables.

**`supabase/schema.sql`** *(v5.8 patch block appended)*
- `posts_group_id_fkey` FK constraint added: `posts.group_id → groups.id ON DELETE SET NULL` (was an unlinked uuid; safe idempotent `DO $$ … $$` block)
- `groups.privacy` text column added (`'public' | 'private'`, default `'public'`); backfilled from existing `is_private` boolean on first run
- `trg_sync_group_privacy` trigger keeps `privacy` and `is_private` in sync on UPDATE so existing code using either column stays correct
- `idx_posts_group_feed` partial index on `posts(group_id, is_published, created_at DESC) WHERE group_id IS NOT NULL AND is_published = true` — powers the feed discovery query
- `idx_group_members_group_id` index — fast member-count aggregation per group
- `idx_group_members_user_id` index — fast membership lookup per user (used on every feed load)

---

## v5.8 — Zaar Culture: Full Content Build-out

### 🏺 New: Zaar Culture Page (Complete Rebuild)

`src/pages/ZaarCulture.jsx`

Replaced the "Coming Soon" placeholder with a fully functional, tabbed cultural heritage page. The page preserves the existing hero design (animated fire icon, crimson/black gradient, tribal SVG border) and extends it with five content sections accessible via a scrollable tab bar.

**Tab 1 — 🗣️ Language Lessons**
- 9 Sayawa phrases across 4 categories: Greetings, Family, Daily Life, Spirituality
- Filterable by category via pill buttons
- Each lesson is an expandable accordion card showing: Sayawa text (Georgia serif), phonetic transcription, English translation, and a cultural usage note
- Volume icon hints at future audio playback integration

**Tab 2 — 📜 Proverbs & Wisdom**
- 6 traditional Sayawa proverbs in a 2-column card grid
- Cards flip on tap: front shows the Sayawa proverb + English translation; back (crimson background) reveals the deeper cultural meaning
- Uses CSS transform with React state (no library dependency)

**Tab 3 — 📖 Cultural Stories**
- 3 long-form oral history stories: founding of Tafawa Balewa, the Kokis drum ceremony, the women of the grinding stone
- Expandable accordion layout — collapsed state shows title + era badge + preview text
- Full story rendered in Georgia serif with paragraph spacing; attribution footer per story

**Tab 4 — 🖼️ Heritage Gallery**
- 6-photo grid (2-col mobile, 3-col desktop) with `aspect-ratio: 4/3`
- Hover reveals caption overlay with gradient fade
- Tap opens a full-screen lightbox (fixed overlay, high-res image, caption, X to close)
- Year/category badge on each photo

**Tab 5 — 🤝 Community Board**
- Full live discussion board powered by Supabase
- Compose box with character counter (500 char limit) — posts saved as `post_type = 'zaar_discussion'` in the existing `posts` table (no new table required)
- Optimistic like/unlike with heart animation
- Threaded replies: expandable per-post reply section with avatar, timestamp, and inline reply compose
- Delete own posts (with confirmation)
- Skeleton loading states, empty state, error handling via toast
- TanStack Query with `staleTime: 30_000` to avoid over-fetching

**`supabase/schema.sql`**
- Added `idx_posts_zaar_discussion` partial index on `(post_type, is_published, created_at DESC)` for fast community board queries
- No new tables — discussion board reuses existing `posts`, `likes`, and `comments` tables with `post_type = 'zaar_discussion'`

---

## v5.6 — Bug Fixes (Post-Deploy Worldwide)

### 🔴 Critical Fixes

**`src/pages/Chat.jsx`**
- Fixed iOS Safari voice recording crash on cancel. The old code called `mr.stop()` before nulling out `mr.onstop`, causing `onstop` to fire synchronously on iOS and set state after cancel had already cleared everything. Reordered: null handlers first, then stop. Also guarded `URL.revokeObjectURL` in a try/catch and cleared `mediaRecorderRef` and `streamRef` after cancel to prevent stale refs.

**`src/pages/Groups.jsx`**
- Fixed crash when loading groups. The `Promise.all` destructure `[{ data: all }, { data: mine }]` would throw if Supabase returned an error object (e.g. on RLS violation or network hiccup). Refactored to capture both results, check `groupsRes.error` explicitly, and fall back to `[]` for member list failures rather than crashing the whole page.

**`supabase/schema.sql`** *(run in Supabase → SQL Editor)*
- **`handle_new_user` trigger hardened**: Now captures `avatar_url`/`picture` from OAuth providers (Google, GitHub) so new social-login users have avatars immediately. Also handles `name` metadata field (GitHub). EXCEPTION block now emits a `RAISE WARNING` so failures appear in Supabase logs instead of being silently swallowed.
- **Storage `images_insert` policy fixed**: Old policy only checked the path prefix, allowing any authenticated user to write to any other user's folder. New policy verifies the UID segment in the path matches `auth.uid()` for both subfolder paths (`posts/{uid}/`) and flat paths (`avatars/{uid}.ext`).
- **Back-fill hardened**: The `INSERT INTO profiles ... FROM auth.users` back-fill now handles OAuth users with `NULL` email (some providers omit email scope) and also back-fills `avatar_url` from `raw_user_meta_data`.
- **`cleanup_dead_push_subscriptions()` function added**: Safe to call on a Supabase cron schedule to remove push subscriptions older than 90 days.

---

### 🟡 High Priority Fixes

**`src/App.jsx`**
- Fixed cross-user feed cache poisoning on shared devices. When a user signs out, the SW `FEED_CACHE` (`vii-mbuni-feed-v1`) is now explicitly deleted via the Cache API. The SW fix (v5.5) handled the auth-header cache key mismatch, but the cache store itself was never flushed on logout.

**`src/pages/Home.jsx`**
- Fixed pagination jumping and duplicate posts. The flat post list was being sorted a second time after `flatMap`, undoing the per-page `_score` ordering from `fetchFeed`. Removed the redundant sort — `fetchFeed` already returns posts in correct order.

**`src/store/index.js`**
- Fixed stale persisted profile shown on new login. `signOut` now removes the `vii-mbuni-auth` localStorage entry, so a second user logging in on the same browser never briefly sees the first user's name, XP, or streak in the compose box.

**`netlify/functions/push-send.js`**
- Added retry logic for transient push errors (429, 5xx): waits 1 second and retries once before giving up. Also cleans up 404 (not just 410) expired subscriptions. Non-retriable errors are now logged to `console.error` so they appear in Netlify function logs.

---

### 🟢 Medium Fixes

**`src/components/feed/PostCard.jsx`**
- Fixed unhandled rejection from `increment_view_count` RPC. The old code chained `.then()` inside `try`, which meant RPC error objects (not thrown exceptions) bypassed the `catch`. Refactored to `await` and destructure `{ data, error }` — errors are now silently ignored (as intended) without any unhandled promise rejections.

**`src/lib/supabase.js`**
- Added startup validation for `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. If either is missing (e.g. branch deploy without env vars set), the app now throws a clear human-readable error at module init instead of cryptic "Failed to fetch" or "invalid URL" errors at runtime.

**`src/main.jsx`**
- Fixed `SW_UPDATED` race condition on slow mobile devices. If the service worker activates before React fully mounts, `showUpdateBanner` was called before `document.body` existed. Added a guard: falls back to `window.addEventListener('load', ...)` if `document.body` is not yet available.

---

## v5.5 — Bug Fixes (Previous)

**`src/pages/Chat.jsx`**
- Fixed `audioUrlRef` used before declaration — crash when cancelling/resetting voice recording.

**`src/pages/Home.jsx`**
- Added missing `initialPageParam: 0` for TanStack Query v5 (first page was returning no posts).
- Fixed `getNextPageParam` to return `undefined` instead of `null`.
- **New posts now appear first** — added a recency boost so posts under 2 hours old always surface at the top of the feed before older posts, regardless of engagement score.

**`src/components/feed/PostCard.jsx`**
- Fixed comment count initialised without reply count (showed lower number than actual).

**`src/components/layout/Layout.jsx`**
- Added missing `clearMsgCount` to `useEffect` dependency array.

**`src/components/ui/NotifPanel.jsx`**
- Added missing `qc` and `user?.id` to `useEffect` dependency array.

**`src/pages/Profile.jsx`**
- Fixed `Object.assign` on a `const` in the timeline post fallback path — post ID was silently lost, causing notifications to drop.

**`public/sw.js`**
- Fixed Chrome "could not load feed" for other users (cross-user SW cache poisoning).

**`supabase/fix_new_user_errors.sql`** *(now merged into schema.sql)*
- Fixed "Upload failed" storage policy, foreign key constraint on posts, and hardened profile creation trigger.
