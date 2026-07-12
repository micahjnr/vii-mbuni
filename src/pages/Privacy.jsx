import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Lock, Heart, Mail } from 'lucide-react'

const R = '#c8102e'
const EFFECTIVE_DATE = 'July 12, 2026'
const CONTACT_EMAIL  = 'Micahiliyajnr@gmail.com'
const APP_NAME       = 'Vii-Mbuni'
const COMPANY        = 'Vii-Mbuni'

export default function Privacy() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-white dark:bg-surface-950 animate-fade-in">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white/90 dark:bg-surface-950/90 backdrop-blur-sm border-b border-surface-100 dark:border-white/10 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn-icon text-gray-500 dark:text-gray-400">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="font-bold text-gray-900 dark:text-white text-base">Privacy Policy</h1>
          <p className="text-xs text-gray-400">Effective {EFFECTIVE_DATE}</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-8 pb-16">

        {/* Hero */}
        <div className="rounded-2xl p-5 text-center" style={{ background: 'linear-gradient(135deg, #c8102e15, #7c3aed15)' }}>
          <Lock size={36} className="mx-auto mb-3" style={{ color: R }} />
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-white mb-1">What we collect, and why</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            This page describes, plainly, what {APP_NAME} actually stores and who it's shared with.
            No data broker relationships, no ad networks, no hidden trackers.
          </p>
        </div>

        {/* Sections */}
        {[
          {
            num: '1', title: 'Account information',
            content: `When you sign up, we store your full name, username, and either your email or phone number (whichever method you chose), plus your password in encrypted form via our authentication provider, Supabase. If you add a profile photo, that's stored too. You choose what to share; only your name and username are required.`
          },
          {
            num: '2', title: 'Content you create',
            content: `Posts, comments, likes, stories, photos, videos, and voice notes you post are stored so the app can show them to you and others per your privacy settings. You can delete any of your content at any time, and it's removed from our database.`
          },
          {
            num: '3', title: 'Messages and calls',
            content: `Private messages are stored so your conversation history is available when you return to the app. Video and voice calls are peer-to-peer: audio/video itself is not recorded or stored by us. When a direct connection between two devices isn't possible, call data is relayed through a third-party TURN server (Metered.ca) purely to establish the connection — that provider does not have access to your account data.`
          },
          {
            num: '4', title: 'Social graph & moderation',
            content: `We store your friend connections, group memberships, and who you've blocked, so those features work. If you or someone else files a report, we store the report content and the accounts involved so we can review it.`
          },
          {
            num: '5', title: 'Zaar learning progress',
            content: `If you use the Zaar dictionary, tutor, or pronunciation features, we store which words you've favourited, your pronunciation practice recordings (if you choose to record), and your spaced-repetition learning progress, so the app can track what you've learned across sessions.`
          },
          {
            num: '6', title: 'AI features',
            content: `Messages you send to the Vii-Mbuni AI Assistant or the Zaar Tutor are sent to our AI provider, Groq, to generate a response. We do not send your other account data (posts, messages, contacts) to Groq — only the conversation you're actively having with the assistant.`
          },
          {
            num: '7', title: 'Push notifications',
            content: `If you enable push notifications, your browser generates a subscription token which we store so we know where to send notifications. You can revoke this at any time from Settings, which deletes the stored token.`
          },
          {
            num: '8', title: 'Daily Accumulator (where enabled)',
            content: `On deployments where this feature is turned on, football data is pulled from third-party odds providers (The Odds API / API-Football). This feature does not process bets, wagers, or payments — no financial or betting-account information is collected from you.`
          },
          {
            num: '9', title: 'What we do not collect',
            content: [
              'We do not access your device location (no GPS/geolocation is requested by the app)',
              'We do not sell or rent your personal data to advertisers or data brokers',
              'We do not run third-party ad trackers or analytics pixels',
              'We do not read your private messages except to investigate a report or legal request',
            ]
          },
          {
            num: '10', title: 'Where your data lives',
            content: `Your account and content data is hosted by Supabase (database) and served via Netlify (hosting). Both are reputable infrastructure providers under their own security and compliance practices; we don't operate our own servers.`
          },
          {
            num: '11', title: 'Your rights',
            content: `You can view, edit, or delete most of your data directly in Settings. Deleting your account removes your profile and associated content from active use. If you'd like a full copy of your data, or have a request we haven't built self-service tools for yet, email us and we'll handle it directly.`
          },
          {
            num: '12', title: "Children's privacy",
            content: `${APP_NAME} is not directed at children under 13, and we do not knowingly collect data from children under that age. If you believe a child has created an account, contact us and we will remove it.`
          },
          {
            num: '13', title: 'Changes to this policy',
            content: `If we materially change what we collect or how we use it, we'll notify you in the app before the change takes effect. This policy was last substantively reviewed on ${EFFECTIVE_DATE}.`
          },
          {
            num: '14', title: 'Contact us',
            content: `Questions about your data, or want something deleted that isn't covered by an in-app option? Reach us at ${CONTACT_EMAIL}. We aim to respond within 48 hours.`
          },
        ].map(s => (
          <div key={s.num} className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                style={{ background: R }}>
                {s.num}
              </div>
              <h3 className="font-bold text-gray-900 dark:text-white">{s.title}</h3>
            </div>
            {Array.isArray(s.content) ? (
              <ul className="ml-9 space-y-1.5">
                {s.content.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ml-9 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{s.content}</p>
            )}
          </div>
        ))}

        {/* Footer */}
        <div className="rounded-2xl border border-surface-200 dark:border-white/10 p-5 text-center space-y-2">
          <Heart size={20} className="mx-auto text-red-400" />
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Made with love for the Sayawa community</p>
          <p className="text-xs text-gray-400">Last updated: {EFFECTIVE_DATE}</p>
          <a href={`mailto:${CONTACT_EMAIL}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold mt-1"
            style={{ color: R }}>
            <Mail size={12} /> {CONTACT_EMAIL}
          </a>
        </div>
      </div>
    </div>
  )
}
