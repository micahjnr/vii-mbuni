// netlify/functions/word-of-week.js
// Scheduled function: sends Word of the Week push notification to all subscribers.
// Schedule: every Monday at 8am UTC (set in netlify.toml)

const { createClient } = require('@supabase/supabase-js')
const webpush = require('web-push')

exports.handler = async () => {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const vapidPublic = process.env.VAPID_PUBLIC_KEY
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY
  const vapidEmail = process.env.VAPID_EMAIL || 'admin@vii-mbuni.app'

  if (!supabaseUrl || !supabaseKey || !vapidPublic || !vapidPrivate) {
    return { statusCode: 500, body: 'Missing env vars' }
  }

  webpush.setVapidDetails(`mailto:${vapidEmail}`, vapidPublic, vapidPrivate)

  const sb = createClient(supabaseUrl, supabaseKey)

  // Pick deterministic word of the week (changes weekly, same for all users)
  let wordData
  try {
    const res = await fetch('https://vii-mbuni.netlify.app/zaarDict.json')
    const { zaarDictionary } = await res.json()
    const nouns = zaarDictionary.filter(e =>
      e.pos === 'n' && e.english && e.hausa &&
      !e.english.startsWith('See') && e.zaar.length > 1
    )
    const weekIndex = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000))
    wordData = nouns[weekIndex % nouns.length]
  } catch (e) {
    return { statusCode: 500, body: 'Failed to load dictionary: ' + e.message }
  }

  // Get all push subscriptions
  const { data: subs, error } = await sb.from('push_subscriptions').select('*')
  if (error) return { statusCode: 500, body: error.message }

  const payload = JSON.stringify({
    title: `⚡ Zaar Word of the Week`,
    body: `${wordData.zaar} — ${wordData.english}${wordData.hausa ? ' | ' + wordData.hausa : ''}`,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    url: '/zaar-culture',
    tag: 'word-of-week',
  })

  let sent = 0, failed = 0
  await Promise.allSettled(
    (subs || []).map(async sub => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        )
        sent++
      } catch (e) {
        failed++
        // Remove invalid subscriptions
        if (e.statusCode === 410 || e.statusCode === 404) {
          await sb.from('push_subscriptions').delete().eq('id', sub.id)
        }
      }
    })
  )

  return {
    statusCode: 200,
    body: JSON.stringify({ sent, failed, word: wordData.zaar }),
  }
}
