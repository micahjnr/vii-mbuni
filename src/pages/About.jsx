import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Github, Mail, Globe, Heart, Code2, Smartphone, BookOpen, MessageCircle } from 'lucide-react'

const R = '#c8102e'

const DEVELOPER = {
  name:     'Iliya Micah',
  role:     'Software Developer, Founder of Vii-Mbuni Social App',
  bio:      'I am a software developer and the founder of Vii-Mbuni, a social platform focused on delivering engaging and trend-driven content. I build modern web applications and AI-powered systems to improve how people connect and consume information. My vision is to create innovative digital solutions that empower users and shape the future of social media.',
  email:    'Micahiliyajnr@gmail.com',
  website:  'https://vii-mbuni.netlify.app',
  github:   'https://github.com/micahjnr/Vii-Mbuni',
  location: 'Bauchi, Nigeria 🇳🇬',
}

const STATS = [
  { label: 'Version',   value: '5.8.0'  },
  { label: 'Platform',  value: 'Web + Android' },
  { label: 'Language',  value: 'React + Supabase' },
  { label: 'Released',  value: '2026'   },
]

const FEATURES_BUILT = [
  { icon: MessageCircle, label: 'Real-time chat & messaging'    },
  { icon: Smartphone,    label: 'Video & voice calls (WebRTC)'  },
  { icon: BookOpen,      label: 'Zaar–English–Hausa dictionary' },
  { icon: Globe,         label: 'Cultural stories & proverbs'   },
  { icon: Code2,         label: 'AI-powered features (Groq)'    },
  { icon: Heart,         label: 'Community groups & events'     },
]

export default function About() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-white dark:bg-surface-950 animate-fade-in">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white/90 dark:bg-surface-950/90 backdrop-blur-sm border-b border-surface-100 dark:border-white/10 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn-icon text-gray-500 dark:text-gray-400">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="font-bold text-gray-900 dark:text-white text-base">About Vii-Mbuni</h1>
          <p className="text-xs text-gray-400">The story behind the app</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6 pb-16">

        {/* App Hero */}
        <div className="rounded-3xl overflow-hidden text-center"
          style={{ background: 'linear-gradient(135deg, #c8102e 0%, #1a1a1a 100%)', padding: '36px 24px 28px' }}>
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl overflow-hidden border-4 border-white/30 shadow-xl">
            <img src="/icons/icon-192.png" alt="Vii-Mbuni" className="w-full h-full object-cover" />
          </div>
          <h2 className="text-2xl font-extrabold text-white mb-1">Vii-Mbuni</h2>
          <p className="text-white/70 text-sm font-medium mb-3">Chat. Learn. Connect.</p>
          <div className="inline-flex items-center gap-1.5 bg-white/15 rounded-full px-3 py-1 text-xs font-semibold text-white/90">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
            v5.8.0 · Live
          </div>
        </div>

        {/* Mission */}
        <div className="card p-5">
          <h3 className="font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <span>🌍</span> Our Mission
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
            Vii-Mbuni was built to preserve and celebrate Sayawa culture through technology.
            The name <span className="font-semibold text-gray-900 dark:text-white">"Vii-Mbuni"</span> means{' '}
            <span className="italic">"community meeting place"</span> in Zaar — because that's exactly what this app is.
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mt-3">
            From the <span className="font-semibold">4,200+ word Zaar dictionary</span> to real-time video calls,
            we are building a space where Sayawa people — whether in Bauchi, Lagos, London, or anywhere in the world —
            can stay connected to their roots and each other.
          </p>
        </div>

        {/* Developer Card */}
        <div className="card overflow-hidden">
          <div className="px-5 pt-5 pb-3 border-b border-surface-100 dark:border-white/5">
            <h3 className="font-bold text-gray-900 dark:text-white text-sm uppercase tracking-wider opacity-60 mb-3">
              Built by
            </h3>
            <div className="flex items-center gap-4">
              {/* Developer photo — place your photo at public/dev-photo.jpg */}
              <div className="w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0 border-2 border-surface-200 dark:border-white/20 shadow-lg"
                style={{ background: 'linear-gradient(135deg, #c8102e, #7c3aed)' }}>
                <img
                  src="/dev-photo.jpg" onError={e => { if(e.currentTarget.src.includes("dev-photo.jpg")) { e.currentTarget.src="/dev-photo.svg"; return; } e.currentTarget.src="/dev-photo.svg" }}
                  alt="Iliya Micah"
                  className="w-full h-full object-cover"
                  onError={e => { if(e.currentTarget.src.includes("dev-photo.jpg")) { e.currentTarget.src="/dev-photo.svg"; return; }
                    // Fallback to initials if photo not found
                    e.target.style.display = 'none'
                    e.target.parentElement.innerHTML = '<span style="font-size:28px;font-weight:900;color:#fff;display:flex;align-items:center;justify-content:center;width:100%;height:100%">I</span>'
                  }}
                />
              </div>
              <div>
                <div className="text-lg font-extrabold text-gray-900 dark:text-white">{DEVELOPER.name}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">{DEVELOPER.role}</div>
                <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                  <span>📍</span> {DEVELOPER.location}
                </div>
              </div>
            </div>
          </div>
          <div className="px-5 py-4">
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-4">
              {DEVELOPER.bio}
            </p>
            <div className="flex flex-wrap gap-2">
              <a href={`mailto:${DEVELOPER.email}`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white transition-opacity hover:opacity-80"
                style={{ background: R }}>
                <Mail size={12} /> Email Me
              </a>
              <a href={DEVELOPER.website} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-surface-100 dark:bg-white/10 text-gray-700 dark:text-gray-200 transition-opacity hover:opacity-80">
                <Globe size={12} /> Website
              </a>
              <a href={DEVELOPER.github} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-surface-100 dark:bg-white/10 text-gray-700 dark:text-gray-200 transition-opacity hover:opacity-80">
                <Github size={12} /> GitHub
              </a>
            </div>
          </div>
        </div>

        {/* App Stats */}
        <div className="grid grid-cols-2 gap-3">
          {STATS.map(s => (
            <div key={s.label} className="card p-4 text-center">
              <div className="text-lg font-extrabold text-gray-900 dark:text-white" style={{ color: s.label === 'Version' ? R : undefined }}>
                {s.value}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Features built */}
        <div className="card p-5">
          <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Code2 size={16} style={{ color: R }} /> What's inside
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {FEATURES_BUILT.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-surface-50 dark:bg-white/5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: `${R}20` }}>
                  <Icon size={14} style={{ color: R }} />
                </div>
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300 leading-tight">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tech stack */}
        <div className="card p-5">
          <h3 className="font-bold text-gray-900 dark:text-white mb-3 text-sm">🛠️ Technology Stack</h3>
          <div className="flex flex-wrap gap-2">
            {['React 18', 'Vite', 'Tailwind CSS', 'Supabase', 'WebRTC', 'Groq AI',
              'Netlify', 'React Query', 'Zustand', 'PWA / TWA'].map(tech => (
              <span key={tech}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-surface-100 dark:bg-white/10 text-gray-600 dark:text-gray-300">
                {tech}
              </span>
            ))}
          </div>
        </div>

        {/* Feedback / Suggest */}
        <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(135deg, #c8102e15, #7c3aed15)', border: '1px solid #c8102e30' }}>
          <h3 className="font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
            <span>💡</span> Have a suggestion?
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-3">
            Your feedback shapes Vii-Mbuni. If you have ideas, found a bug, or want to contribute
            to Zaar language preservation, we'd love to hear from you.
          </p>
          <a href={"mailto:Micahiliyajnr@gmail.com?subject=Vii-Mbuni Feedback"}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white"
            style={{ background: R }}>
            <Mail size={14} /> Send Feedback
          </a>
        </div>

        {/* Footer */}
        <div className="text-center space-y-1 py-2">
          <p className="text-xs text-gray-400">
            Made with <span style={{ color: R }}>♥</span> for the Sayawa people
          </p>
          <p className="text-xs text-gray-400">© 2026 Iliya Micah · All rights reserved</p>
        </div>

      </div>
    </div>
  )
}
