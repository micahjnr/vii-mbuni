// sw.js — auto-versioned by vite.config.js on every build
const CACHE = 'vii-mbuni-v58-__BUILD_VERSION__'
const FEED_CACHE = 'vii-mbuni-feed-v1'

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll([
        '/',
        '/index.html',
        '/offline.html',
        '/manifest.json',
        '/zaarDict.json',
        '/icons/icon-192.png',
        '/icons/icon-512.png',
        '/icons/badge-96.png',
      ]))
      .then(() => {
        // Always skip waiting — take control immediately on every deploy
        self.skipWaiting()
      })
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        // Delete ALL old caches — including any vii-mbuni-* from previous deploys
        keys.filter(k => k !== CACHE && k !== FEED_CACHE).map(k => {
          console.log('[SW] Deleting old cache:', k)
          return caches.delete(k)
        })
      ))
      .then(() => self.clients.claim())
      .then(() => {
        // Tell all tabs to hard-reload so they use the new SW immediately
        // This clears the black screen caused by stale SW serving bad assets
        return self.clients.matchAll({ type: 'window' }).then(clients => {
          clients.forEach(client => {
            // Only reload if the page is already loaded (not mid-navigation)
            if (client.url && client.url.includes(self.location.origin)) {
              client.postMessage({ type: 'SW_UPDATED' })
            }
          })
        })
      })
      .then(async () => {
        const clients = await self.clients.matchAll({ type: 'window' })
        clients.forEach(c => c.postMessage({ type: 'SW_UPDATED' }))
      })
  )
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)

  if (e.request.method !== 'GET') return
  if (!url.protocol.startsWith('http')) return

  // Skip Netlify functions & Groq — always live
  if (url.pathname.includes('netlify/functions')) return

  // Supabase — network-first with offline fallback for key endpoints
  if (url.hostname.includes('supabase')) {
    const cacheable = ['/rest/v1/posts', '/rest/v1/profiles', '/rest/v1/stories']
    if (cacheable.some(p => url.pathname.includes(p))) {
      e.respondWith(
        fetch(e.request)
          .then(res => {
            if (res.ok) {
              caches.open(FEED_CACHE)
                .then(c => c.put(e.request, res.clone()))
                .catch(() => {})
              // Tell the page we're back online
              self.clients.matchAll({ type: 'window' }).then(clients =>
                clients.forEach(c => c.postMessage({ type: 'ONLINE' }))
              )
            }
            return res
          })
          .catch(async () => {
            // Offline — tell the page
            self.clients.matchAll({ type: 'window' }).then(clients =>
              clients.forEach(c => c.postMessage({ type: 'OFFLINE' }))
            )
            const cached = await caches.open(FEED_CACHE)
              .then(c => c.match(e.request))
              .catch(() => null)
            return cached || Response.error()
          })
      )
      return
    }
    return
  }

  // HTML — always network first
  // If app is installed and request comes from browser (not standalone), redirect to ?source=pwa
  // so the OS launch_handler focuses/opens the installed app window instead
  if (e.request.destination === 'document' || e.request.mode === 'navigate') {
    const reqUrl = new URL(e.request.url)
    const isStandalone = reqUrl.searchParams.has('source') && reqUrl.searchParams.get('source') === 'pwa'
    if (!isStandalone) {
      // Let the page's inline script handle the redirect after checking localStorage
      e.respondWith(
        fetch(e.request, { cache: 'no-store' }).catch(() => caches.match('/offline.html') || caches.match('/index.html'))
      )
    } else {
      e.respondWith(
        fetch(e.request, { cache: 'no-store' }).catch(() => caches.match('/offline.html') || caches.match('/index.html'))
      )
    }
    return
  }

  // Static large files — cache first (zaarDict.json changes only on deploy)
  if (url.pathname === '/zaarDict.json') {
    e.respondWith(
      caches.match(e.request)
        .then(cached => cached || fetch(e.request).then(res => {
          if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()))
          return res
        }))
    )
    return
  }

  // Assets — network first, cache fallback
  // On miss: unregister stale SW and tell clients to hard-reload
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(CACHE).then(c => c.put(e.request, clone))
          }
          return res
        })
        .catch(async () => {
          // Try cache first
          const cached = await caches.match(e.request)
          if (cached) return cached
          // Asset not cached and network failed — SW is stale.
          // Unregister so next load fetches fresh assets, then tell clients.
          try {
            await self.registration.unregister()
            const clients = await self.clients.matchAll({ type: 'window' })
            clients.forEach(c => c.postMessage({ type: 'SW_RELOAD' }))
          } catch (_) {}
          // Return the raw network fetch without SW interception
          // so the browser can at least attempt a direct load
          return fetch(e.request, { cache: 'no-store' }).catch(() =>
            new Response('', { status: 503, statusText: 'Service Unavailable' })
          )
        })
    )
    return
  }
})

self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

// ── Push notifications ────────────────────────────────────────────────────────
// IMPORTANT: showNotification MUST be called inside e.waitUntil() or the
// browser will kill the SW before the notification appears (especially on Android).
self.addEventListener('push', e => {
  // Always call waitUntil — even if we have no data, we must show *something*
  // or the browser will log "This site has been updated in the background"
  e.waitUntil((async () => {
    let d = {}
    try {
      if (e.data) d = e.data.json()
    } catch {
      d = { body: e.data ? e.data.text() : '' }
    }

    const title = d.title || 'Vii-Mbuni'
    const body  = d.body  || 'You have a new notification'

    // Build options — only include fields that are defined and non-null
    // Passing undefined/null for image crashes showNotification on some Android versions
    const options = {
      body,
      icon:    d.icon  || '/icons/icon-512.png',
      badge:   d.badge || '/icons/badge-96.png',
      tag:     d.tag   || 'general',
      data:    d.data  || { url: '/' },
      vibrate: d.vibrate || [100, 50, 100],
      renotify:           d.renotify           !== undefined ? d.renotify           : true,
      requireInteraction: d.requireInteraction !== undefined ? d.requireInteraction : false,
      silent:             d.silent             !== undefined ? d.silent             : false,
    }

    // Only add image if it's a real URL — undefined/null crashes Android
    if (d.image && typeof d.image === 'string' && d.image.startsWith('http')) {
      options.image = d.image
    }

    // Only add actions if array is non-empty — empty array causes issues on some devices
    if (Array.isArray(d.actions) && d.actions.length > 0) {
      options.actions = d.actions
    }

    await self.registration.showNotification(title, options)
  })())
})

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close()

  const notifData = e.notification.data || {}
  const action    = e.action
  const target    = notifData.url || '/'

  // For incoming call notifications, post a message to the app so it can
  // show the call screen immediately without waiting for a DB poll
  const openAndSignal = (client, msg) => {
    if (msg) client.postMessage(msg)
    client.navigate(target)
    return client.focus()
  }

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // Build a message to post into the page if this is a call notification
      let callMsg = null
      if (notifData.sessionId) {
        callMsg = {
          type:      action === 'decline' ? 'DECLINE_CALL' : 'INCOMING_CALL',
          sessionId: notifData.sessionId,
          callType:  notifData.callType || 'voice',
        }
      }

      for (const client of clients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          return openAndSignal(client, callMsg)
        }
      }
      // No window open — open in installed app context
      const appUrl = new URL(target, self.location.origin)
      appUrl.searchParams.set('source', 'pwa')
      return self.clients.openWindow(appUrl.toString())
    })
  )
})

self.addEventListener('notificationclose', e => {
  // no-op — event handled cleanly
})
