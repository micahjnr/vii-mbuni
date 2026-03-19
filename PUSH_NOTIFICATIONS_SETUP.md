# 🔔 Push Notifications Setup Guide

## Why notifications aren't popping up

There are **3 things** that must ALL be working:

```
User action (like/message)
        ↓
  DB INSERT into notifications table
        ↓
  Supabase Webhook fires → push-send.js   ← THIS IS USUALLY MISSING
        ↓
  push-send.js calls web-push library
        ↓
  Phone/browser shows the popup
```

If the webhook in Step 4 is not set up, nothing pops up — even though
the notification is saved in the database.

---

## Step 1 — Generate VAPID Keys (do this once)

Run in any terminal:

```bash
npx web-push generate-vapid-keys
```

Output:
```
Public Key:  BExamplePublicKeyHere...
Private Key: ExamplePrivateKeyHere...
```

Save both values.

---

## Step 2 — Add Environment Variables in Netlify

Go to: **Netlify → Your Site → Site Configuration → Environment Variables**

| Variable | Value |
|---|---|
| `VITE_VAPID_PUBLIC_KEY` | Your public key from Step 1 |
| `VAPID_PUBLIC_KEY` | Same public key |
| `VAPID_PRIVATE_KEY` | Your private key from Step 1 |
| `VAPID_EMAIL` | `mailto:your@email.com` |
| `WEBHOOK_SECRET` | Any random string e.g. `vii-mbuni-secret-abc123` |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key |
| `SITE_URL` | Your full Netlify URL e.g. `https://vii-mbuni.netlify.app` |

After adding all variables → **Trigger a redeploy** (Deploys → Trigger deploy).

---

## Step 3 — Run the Schema SQL

Go to: **Supabase → SQL Editor** → paste and run `supabase/schema.sql`
(safe to re-run — everything uses IF NOT EXISTS / OR REPLACE)

---

## Step 4 — Create the Supabase Webhook ⚠️ MOST IMPORTANT STEP

This is what actually fires the push notification when a like or message happens.

Go to: **Supabase → Database → Webhooks → Create a new hook**

Fill in **exactly**:

| Field | Value |
|---|---|
| Name | `push_on_notification_insert` |
| Table | `notifications` |
| Events | ✅ INSERT only |
| Type | HTTP Request |
| Method | POST |
| URL | `https://YOUR-SITE.netlify.app/.netlify/functions/push-send` |

Under **HTTP Headers** add:
| Key | Value |
|---|---|
| `x-webhook-secret` | Same value as `WEBHOOK_SECRET` from Step 2 |
| `Content-Type` | `application/json` |

Click **Create webhook**.

### ✅ Test the webhook
After creating it, Supabase shows a **Test** button. Click it — if it returns
`{"sent":0,"reason":"no_subscriptions"}` that means the webhook is working
(just no devices subscribed yet). Any other error means check the URL or secret.

---

## Step 5 — Enable notifications in the app

Open your Vii-Mbuni app → tap the 🔔 bell icon in the sidebar → Allow.

Once allowed, your device is registered. Any new like, message, comment,
or group post will now pop up even when the browser is minimized.

---

## Troubleshooting

### "I allowed notifications but still no popup"
1. Check Netlify Function logs: **Netlify → Functions → push-send → Logs**
2. Check the webhook fired: **Supabase → Database → Webhooks → (your hook) → Logs**
3. Make sure `VAPID_EMAIL` starts with `mailto:` e.g. `mailto:admin@viimbuni.com`

### "Works on desktop but not Android when minimized"
- Make sure you've installed the app as a PWA:
  Chrome → Menu (⋮) → "Add to Home Screen" → Open from home screen
- Then allow notifications when prompted

### "iOS Safari not working"
- iOS requires the app to be installed as a PWA first:
  Safari → Share → "Add to Home Screen" → open from there
- iOS 16.4+ only

### Platform support
| Platform | Support |
|---|---|
| Chrome Android (minimized) | ✅ Works — shows in notification shade |
| Chrome Desktop | ✅ Works |
| Firefox Android | ✅ Works |
| Safari macOS 13+ | ✅ Works |
| iOS Safari (PWA) | ✅ iOS 16.4+ only, must be installed as PWA |
| iOS Safari (browser tab) | ❌ Not supported by Apple |

---

## Notification types that trigger popups

| Event | Notification type | What the popup says |
|---|---|---|
| Someone likes your post | `like` | "Amina liked your post 👍" |
| Someone comments | `comment` | "Amina commented on your post 💬" |
| Someone replies | `reply` | "Amina replied to your comment" |
| Someone messages you | `message` | "Amina · Hey are you coming..." |
| Someone follows you | `follow` | "Amina started following you 🎉" |
| Friend request | `friend_request` | "Amina sent you a friend request" |
| Group post | `group_post` | "Amina posted in Peace Makers" |
| Group join | `group_join` | "Amina joined Peace Makers 👥" |
| Challenge done | `challenge_complete` | "🏆 Challenge complete! +150 XP" |
