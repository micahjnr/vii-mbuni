// netlify/functions/push-send.js
const { createClient } = require('@supabase/supabase-js')
const webpush = require('web-push')
const crypto = require('crypto')

// ── FIXED: No wildcard fallback — if SITE_URL is missing, fail loudly at
//   startup rather than silently allowing all origins at runtime.
const ALLOWED_ORIGIN = process.env.SITE_URL
if (!ALLOWED_ORIGIN) {
  console.error('[push-send] SITE_URL env var is not set — CORS will be misconfigured.')
}

const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN || 'null',
  'Access-Control-Allow-Headers': 'Content-Type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', ...CORS },
  body: JSON.stringify(body),
})

// Validate env vars at cold start so misconfiguration is obvious in logs
const MISSING = ['VAPID_EMAIL','VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','WEBHOOK_SECRET','SITE_URL']
  .filter(k => !process.env[k])

if (!MISSING.length) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )
}

// ── FIXED: Sanitize all user-supplied strings before they enter payloads.
//   Prevents oversized or injection-style content in notification bodies.
const sanitize = (str, maxLen = 120) => {
  if (typeof str !== 'string') return ''
  return str.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, maxLen)
}

function buildPayload({ type, actorName, actorAvatar, referenceId, extra }) {
  const name   = sanitize(actorName, 60)   || 'Someone'
  const avatar = (typeof actorAvatar === 'string' && actorAvatar.startsWith('https://'))
    ? actorAvatar
    : '/icons/icon-512.png'

  const base = {
    icon:               avatar,
    badge:              '/icons/badge-96.png',
    vibrate:            [100, 50, 100],
    renotify:           true,
    requireInteraction: false,
    silent:             false,
  }

  // ── FIXED: all user-controlled strings (preview, groupName, etc.) sanitized
  const preview     = sanitize(extra?.preview,     100)
  const groupName   = sanitize(extra?.groupName,    60)
  const challengeTitle = sanitize(extra?.challengeTitle, 80)
  const levelLabel  = sanitize(extra?.levelLabel,   40)
  const eventTitle  = sanitize(extra?.eventTitle,   80)
  const emoji       = sanitize(extra?.emoji,         4)
  const mediaUrl    = (typeof extra?.mediaUrl === 'string' && extra.mediaUrl.startsWith('https://'))
    ? extra.mediaUrl
    : null

  const configs = {
    like: {
      title: extra?.isVideo ? '🎬 New like on your video' : '👍 New like',
      body:  extra?.isVideo ? `${name} liked your video` : `${name} liked your post`,
      tag:   'likes',
      data:  { url: referenceId ? `/?post=${referenceId}` : '/' },
      actions: [{ action: 'view', title: 'View' }],
    },
    comment: {
      title: `💬 ${name}`,
      body:  preview
        ? `"${preview}"`
        : extra?.isVideo ? 'Commented on your video' : 'Commented on your post',
      tag:   'comments',
      data:  { url: referenceId ? `/?post=${referenceId}` : '/' },
      actions: [
        { action: 'view',  title: 'View' },
        { action: 'reply', title: '↩ Reply' },
      ],
    },
    reply: {
      title: 'New reply',
      body:  `${name} replied to your comment`,
      tag:   'comments',
      data:  { url: referenceId ? `/?post=${referenceId}` : '/' },
      actions: [
        { action: 'view',  title: 'View' },
        { action: 'reply', title: 'Reply' },
      ],
    },
    mention: {
      title: 'You were mentioned',
      body:  `${name} mentioned you in a post`,
      tag:   'mentions',
      data:  { url: referenceId ? `/?post=${referenceId}` : '/' },
      actions: [{ action: 'view', title: 'View post' }],
    },
    follow: {
      title: extra?.accepted ? 'Friend request accepted' : 'New follower',
      body:  extra?.accepted
        ? `${name} accepted your friend request 🤝`
        : `${name} started following you 🎉`,
      tag:   'social',
      data:  { url: extra?.actorId ? `/profile/${extra.actorId}` : '/' },
      actions: [{ action: 'view', title: 'View profile' }],
    },
    friend_request: {
      title: 'Friend request',
      body:  `${name} sent you a friend request`,
      tag:   'social',
      data:  { url: '/friends' },
      actions: [{ action: 'view', title: 'View' }],
    },
    message: {
      title: name,
      body:  preview || '📨 Sent you a message',
      tag:   `dm-${extra?.actorId}`,
      requireInteraction: true,
      ...(mediaUrl ? { image: mediaUrl } : {}),
      data:  { url: extra?.actorId ? `/messages/${extra.actorId}` : '/messages' },
      actions: [
        { action: 'reply', title: '↩ Reply' },
        { action: 'view',  title: 'Open' },
      ],
    },
    group_join: {
      title: 'New group member',
      body:  `${name} joined "${groupName || 'your group'}" 👥`,
      tag:   'groups',
      data:  { url: '/groups' },
      actions: [{ action: 'view', title: 'View group' }],
    },
    group_post: {
      title: groupName || 'New group post',
      body:  `${name} posted in "${groupName || 'your group'}"`,
      tag:   'groups',
      data:  { url: referenceId ? `/?post=${referenceId}` : '/groups' },
      actions: [{ action: 'view', title: 'See post' }],
    },
    challenge_complete: {
      title: '🏆 Challenge complete!',
      body:  challengeTitle
        ? `You completed "${challengeTitle}" — +${extra.xp || 0} XP!`
        : 'You completed a challenge!',
      tag:   'achievements',
      data:  { url: '/challenges' },
      actions: [{ action: 'view', title: 'View challenges' }],
    },
    xp_milestone: {
      title: '⚡ Level up!',
      body:  levelLabel ? `You reached ${levelLabel}!` : 'You reached a new level!',
      tag:   'achievements',
      data:  { url: '/' },
    },
    story_like: {
      title: 'Vii-Mbuni',
      body:  `${name} reacted ${emoji || '❤️'} to your story`,
      tag:   'story-likes',
      data:  { url: '/' },
      actions: [{ action: 'view', title: 'View story' }],
    },
    story_comment: {
      title: 'Story reply',
      body:  preview ? `${name}: ${preview}` : `${name} replied to your story 💬`,
      tag:   'story-comments',
      data:  { url: '/' },
      actions: [
        { action: 'view',  title: 'View story' },
        { action: 'reply', title: 'Reply' },
      ],
    },
    event_rsvp: {
      title: 'New RSVP',
      body:  eventTitle
        ? `${name} is going to "${eventTitle}" 🎉`
        : `${name} RSVPed to your event 🎉`,
      tag:   'events',
      data:  { url: '/events' },
      actions: [{ action: 'view', title: 'View event' }],
    },
    incoming_call: {
      title: extra?.callType === 'video' ? '📹 Incoming video call' : '📞 Incoming voice call',
      body:  `${name} is calling you — tap to answer`,
      tag:   `call-${extra?.sessionId || 'call'}`,
      requireInteraction: true,
      renotify: true,
      vibrate: [200, 100, 200, 100, 200],
      data:  { url: `/messages/${extra?.actorId}`, sessionId: extra?.sessionId, callType: extra?.callType },
      actions: [
        { action: 'answer',  title: '✅ Answer' },
        { action: 'decline', title: '❌ Decline' },
      ],
    },
  }

  const cfg = configs[type] ?? {
    title: 'Vii-Mbuni',
    body:  'You have a new notification',
    tag:   'general',
    data:  { url: '/' },
  }

  return JSON.stringify({ ...base, ...cfg })
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST')    return json(405, { error: 'Method Not Allowed' })

  // ── Guard: missing env vars ──────────────────────────────────────────────
  if (MISSING.length) {
    console.error('[push-send] Missing env vars:', MISSING.join(', '))
    return json(500, { error: 'Server misconfigured', missing: MISSING })
  }

  // ── Guard: webhook secret ────────────────────────────────────────────────
  const secret   = event.headers['x-webhook-secret'] || ''
  const expected = process.env.WEBHOOK_SECRET || ''
  if (
    !secret.length ||
    secret.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(expected))
  ) {
    console.error('[push-send] Unauthorized — secret mismatch')
    return json(401, { error: 'Unauthorized' })
  }

  // ── Parse body ───────────────────────────────────────────────────────────
  let body
  try { body = JSON.parse(event.body || '{}') }
  catch { return json(400, { error: 'Invalid JSON' }) }

  const notification = body.record || body
  const { user_id, type, actor_id, reference_id, extra_data } = notification

  console.log('[push-send] Received:', { user_id, type, actor_id, reference_id })

  if (!user_id) return json(400, { error: 'Missing user_id in payload' })

  // ── FIXED: Log a warning when extra_data can't be parsed instead of
  //   silently swallowing the error with an empty object.
  let extra = {}
  if (extra_data) {
    if (typeof extra_data === 'string') {
      try {
        extra = JSON.parse(extra_data)
      } catch (e) {
        console.warn('[push-send] Failed to parse extra_data, ignoring:', e.message)
      }
    } else if (typeof extra_data === 'object') {
      extra = extra_data
    }
  }

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  // ── Fetch actor profile ──────────────────────────────────────────────────
  const { data: actor } = actor_id
    ? await sb.from('profiles').select('full_name, avatar_url').eq('id', actor_id).single()
    : { data: null }

  const actorName   = actor?.full_name  ?? 'Someone'
  const actorAvatar = actor?.avatar_url ?? null

  // ── Fetch subscriptions ──────────────────────────────────────────────────
  const { data: subs, error: subsError } = await sb
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', user_id)

  if (subsError) {
    console.error('[push-send] Error fetching subscriptions:', subsError.message)
    return json(500, { error: subsError.message })
  }

  console.log('[push-send] Subscriptions found:', subs?.length ?? 0)
  if (!subs?.length) return json(200, { sent: 0, reason: 'no_subscriptions' })

  const payload = buildPayload({
    type, actorName, actorAvatar,
    referenceId: reference_id,
    extra: { ...extra, actorId: actor_id },
  })

  // ── FIXED: sendWithRetry now properly awaits the stale-subscription cleanup
  //   before throwing, so the delete isn't fire-and-forget on the error path.
  //   Also wraps sendNotification in a timeout so a slow push service can't
  //   hang the Netlify function indefinitely.
  const withTimeout = (promise, ms = 8000) =>
    Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(Object.assign(new Error('Push timeout'), { isTimeout: true })), ms)
      ),
    ])

  const sendWithRetry = async (sub, attempt = 0) => {
    try {
      await withTimeout(
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        )
      )
      console.log('[push-send] Sent to endpoint:', sub.endpoint.slice(-20))
    } catch (err) {
      if (err.isTimeout) {
        console.error('[push-send] Timed out sending to:', sub.endpoint.slice(-20))
        throw err
      }
      // Expired/invalid subscription — await cleanup before throwing
      if (err.statusCode === 410 || err.statusCode === 404) {
        console.warn('[push-send] Removing dead subscription:', sub.endpoint.slice(-20))
        await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        throw err
      }
      // Rate-limited or server error — retry once after 1s
      if ((err.statusCode === 429 || err.statusCode >= 500) && attempt === 0) {
        console.warn('[push-send] Retrying after error:', err.statusCode)
        await new Promise(r => setTimeout(r, 1000))
        return sendWithRetry(sub, 1)
      }
      console.error('[push-send] Failed to send:', err.statusCode, err.message)
      throw err
    }
  }

  const results = await Promise.allSettled(subs.map(sub => sendWithRetry(sub)))
  const sent    = results.filter(r => r.status === 'fulfilled').length
  const failed  = results.filter(r => r.status === 'rejected').map(r => r.reason?.message)

  console.log('[push-send] Result:', { sent, total: subs.length, failed })

  return json(200, { sent, total: subs.length, ...(failed.length ? { failed } : {}) })
}
