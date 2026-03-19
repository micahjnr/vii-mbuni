// netlify/functions/push-send.js
const { createClient } = require('@supabase/supabase-js')
const webpush = require('web-push')
const crypto = require('crypto')

const ALLOWED_ORIGIN = process.env.SITE_URL || '*'
const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', ...CORS },
  body: JSON.stringify(body),
})

// Validate env vars at cold start so misconfiguration is obvious in logs
const MISSING = ['VAPID_EMAIL','VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','WEBHOOK_SECRET']
  .filter(k => !process.env[k])

if (!MISSING.length) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )
}

function buildPayload({ type, actorName, actorAvatar, referenceId, extra }) {
  const base = {
    icon:               '/icons/icon-512.png',
    badge:              '/icons/badge-96.png',
    vibrate:            [100, 50, 100],
    renotify:           true,
    requireInteraction: false,
    image:              actorAvatar || null,
    silent:             false,
  }

  const configs = {
    like: {
      title: 'Vii-Mbuni',
      body:  extra?.isVideo ? `${actorName} liked your video 🎬👍` : `${actorName} liked your post 👍`,
      tag:   'likes',
      data:  { url: referenceId ? `/?post=${referenceId}` : '/' },
      actions: [{ action: 'view', title: extra?.isVideo ? 'View video' : 'View post' }],
    },
    comment: {
      title: 'New comment',
      body:  extra?.isVideo ? `${actorName} commented on your video 🎬💬` : `${actorName} commented on your post 💬`,
      tag:   'comments',
      data:  { url: referenceId ? `/?post=${referenceId}` : '/' },
      actions: [
        { action: 'view',  title: extra?.isVideo ? 'View video' : 'View post' },
        { action: 'reply', title: 'Reply' },
      ],
    },
    reply: {
      title: 'New reply',
      body:  `${actorName} replied to your comment`,
      tag:   'comments',
      data:  { url: referenceId ? `/?post=${referenceId}` : '/' },
      actions: [
        { action: 'view',  title: 'View' },
        { action: 'reply', title: 'Reply' },
      ],
    },
    mention: {
      title: 'You were mentioned',
      body:  `${actorName} mentioned you in a post`,
      tag:   'mentions',
      data:  { url: referenceId ? `/?post=${referenceId}` : '/' },
      actions: [{ action: 'view', title: 'View post' }],
    },
    follow: {
      title: extra?.accepted ? 'Friend request accepted' : 'New follower',
      body:  extra?.accepted
        ? `${actorName} accepted your friend request 🤝`
        : `${actorName} started following you 🎉`,
      tag:   'social',
      data:  { url: extra?.actorId ? `/profile/${extra.actorId}` : '/' },
      actions: [{ action: 'view', title: 'View profile' }],
    },
    friend_request: {
      title: 'Friend request',
      body:  `${actorName} sent you a friend request`,
      tag:   'social',
      data:  { url: '/friends' },
      actions: [{ action: 'view', title: 'View' }],
    },
    message: {
      title: actorName,
      body:  extra?.preview || 'Sent you a message 💬',
      tag:   `dm-${extra?.actorId}`,
      requireInteraction: true,
      data:  { url: extra?.actorId ? `/messages/${extra.actorId}` : '/messages' },
      actions: [
        { action: 'reply', title: 'Reply' },
        { action: 'view',  title: 'Open' },
      ],
    },
    group_join: {
      title: 'New group member',
      body:  `${actorName} joined "${extra?.groupName || 'your group'}" 👥`,
      tag:   'groups',
      data:  { url: '/groups' },
      actions: [{ action: 'view', title: 'View group' }],
    },
    group_post: {
      title: extra?.groupName || 'New group post',
      body:  `${actorName} posted in "${extra?.groupName || 'your group'}"`,
      tag:   'groups',
      data:  { url: referenceId ? `/?post=${referenceId}` : '/groups' },
      actions: [{ action: 'view', title: 'See post' }],
    },
    challenge_complete: {
      title: '🏆 Challenge complete!',
      body:  extra?.challengeTitle
        ? `You completed "${extra.challengeTitle}" — +${extra.xp || 0} XP!`
        : 'You completed a challenge!',
      tag:   'achievements',
      data:  { url: '/challenges' },
      actions: [{ action: 'view', title: 'View challenges' }],
    },
    xp_milestone: {
      title: '⚡ Level up!',
      body:  extra?.levelLabel ? `You reached ${extra.levelLabel}!` : 'You reached a new level!',
      tag:   'achievements',
      data:  { url: '/' },
    },
    // ── Story interactions ────────────────────────────────────────────────────
    story_like: {
      title: 'Vii-Mbuni',
      body:  `${actorName} reacted ${extra?.emoji || '❤️'} to your story`,
      tag:   'story-likes',
      data:  { url: '/' },
      actions: [{ action: 'view', title: 'View story' }],
    },
    story_comment: {
      title: 'Story reply',
      body:  extra?.preview ? `${actorName}: ${extra.preview}` : `${actorName} replied to your story 💬`,
      tag:   'story-comments',
      data:  { url: '/' },
      actions: [
        { action: 'view',  title: 'View story' },
        { action: 'reply', title: 'Reply' },
      ],
    },
    // ── Event RSVP ───────────────────────────────────────────────────────────
    event_rsvp: {
      title: 'New RSVP',
      body:  extra?.eventTitle
        ? `${actorName} is going to "${extra.eventTitle}" 🎉`
        : `${actorName} RSVPed to your event 🎉`,
      tag:   'events',
      data:  { url: '/events' },
      actions: [{ action: 'view', title: 'View event' }],
    },
    // ── Incoming call ─────────────────────────────────────────────────────────
    incoming_call: {
      title: extra?.callType === 'video' ? '📹 Incoming video call' : '📞 Incoming voice call',
      body:  `${actorName} is calling you — tap to answer`,
      tag:   `call-${extra?.sessionId || 'call'}`,
      requireInteraction: true,
      renotify: true,
      vibrate: [200, 100, 200, 100, 200],
      // FIX: was `actor_id` (undefined in this scope) — use extra.actorId
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

  // Supabase webhook wraps the row in body.record
  const notification = body.record || body
  const { user_id, type, actor_id, reference_id, extra_data } = notification

  console.log('[push-send] Received:', { user_id, type, actor_id, reference_id })

  if (!user_id) return json(400, { error: 'Missing user_id in payload' })

  const extra = typeof extra_data === 'string'
    ? (() => { try { return JSON.parse(extra_data) } catch { return {} } })()
    : (extra_data || {})

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

  // ── Send with retry ──────────────────────────────────────────────────────
  const sendWithRetry = async (sub, attempt = 0) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
      console.log('[push-send] Sent to endpoint:', sub.endpoint.slice(-20))
    } catch (err) {
      // Expired/invalid subscription — clean it up
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
