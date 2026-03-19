import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Shield, Heart, AlertCircle, Mail } from 'lucide-react'

const R = '#c8102e'
const EFFECTIVE_DATE = 'March 18, 2026'
const CONTACT_EMAIL  = 'Micahiliyajnr@gmail.com'
const APP_NAME       = 'Vii-Mbuni'
const COMPANY        = 'Vii-Mbuni'

export default function Terms() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-white dark:bg-surface-950 animate-fade-in">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white/90 dark:bg-surface-950/90 backdrop-blur-sm border-b border-surface-100 dark:border-white/10 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn-icon text-gray-500 dark:text-gray-400">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="font-bold text-gray-900 dark:text-white text-base">Terms & Conditions</h1>
          <p className="text-xs text-gray-400">Effective {EFFECTIVE_DATE}</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-8 pb-16">

        {/* Hero */}
        <div className="rounded-2xl p-5 text-center" style={{ background: 'linear-gradient(135deg, #c8102e15, #7c3aed15)' }}>
          <Shield size={36} className="mx-auto mb-3" style={{ color: R }} />
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-white mb-1">Our Agreement with You</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            By using {APP_NAME}, you agree to these terms. Please read them carefully.
            They protect both you and us.
          </p>
        </div>

        {/* Sections */}
        {[
          {
            num: '1', title: 'Who We Are',
            content: `${APP_NAME} is a social platform dedicated to the Sayawa people and all who wish to connect, learn the Zaar language, and celebrate Sayawa heritage. We are operated by ${COMPANY}.`
          },
          {
            num: '2', title: 'Accepting These Terms',
            content: `By creating an account or using ${APP_NAME}, you confirm that you are at least 13 years old and agree to be bound by these Terms and Conditions. If you do not agree, please do not use the app.`
          },
          {
            num: '3', title: 'Your Account',
            content: `You are responsible for maintaining the confidentiality of your account password and for all activity that occurs under your account. You must provide accurate information when registering. You may not use another person's account or share your credentials. Notify us immediately at ${CONTACT_EMAIL} if you suspect unauthorized access to your account.`
          },
          {
            num: '4', title: 'What You Can Post',
            content: `You may post text, images, videos, and voice messages that you own or have permission to share. You retain ownership of your content. By posting, you grant ${APP_NAME} a non-exclusive, royalty-free licence to display and distribute your content within the platform. We do not claim ownership of your content.`
          },
          {
            num: '5', title: 'What You Cannot Post',
            content: [
              'Content that harasses, bullies, or threatens any person',
              'Sexually explicit content or anything involving minors in a sexual manner',
              'Hate speech targeting race, ethnicity, religion, gender, or sexuality',
              'Misinformation, fake news, or deliberately misleading content',
              'Content that violates intellectual property rights',
              'Spam, scams, or malicious links',
              'Personal information of others without their consent',
            ]
          },
          {
            num: '6', title: 'Calls & Voice Features',
            content: `Video and voice calls are peer-to-peer and encrypted in transit. We do not record your calls. You consent to the use of your camera and microphone only when you actively initiate or accept a call.`
          },
          {
            num: '7', title: 'Privacy & Data',
            content: `We collect information necessary to operate the platform including your profile data, posts, messages, and usage patterns. We do not sell your personal data to third parties. Messages between users are stored securely. You can delete your account and all associated data at any time from Settings.`
          },
          {
            num: '8', title: 'Zaar Language Content',
            content: `The Zaar dictionary and cultural content in the app is provided for educational and preservation purposes. Entries are sourced from academic and community research. If you believe any content is inaccurate, contact us and we will review it with community elders.`
          },
          {
            num: '9', title: 'Intellectual Property',
            content: `${APP_NAME}, its logo, design, and original content are the property of ${COMPANY}. The Zaar dictionary data is a community resource. Third-party trademarks and content remain the property of their respective owners.`
          },
          {
            num: '10', title: 'Termination',
            content: `We may suspend or terminate accounts that violate these terms. You may delete your account at any time. Upon termination, your content may be removed from public view though some data may be retained for legal or technical reasons for a period of time.`
          },
          {
            num: '11', title: 'Disclaimers',
            content: `${APP_NAME} is provided "as is". We make no warranties about availability, accuracy, or fitness for a particular purpose. We are not liable for content posted by users or for any loss resulting from use of the platform.`
          },
          {
            num: '12', title: 'Changes to These Terms',
            content: `We may update these terms from time to time. We will notify you of material changes via the app. Continued use after changes constitutes acceptance of the updated terms.`
          },
          {
            num: '13', title: 'Governing Law',
            content: `These terms are governed by the laws of the Federal Republic of Nigeria. Any disputes shall be resolved through the courts of Nigeria.`
          },
          {
            num: '14', title: 'Contact Us',
            content: `Questions about these terms? Reach us at ${CONTACT_EMAIL}. We aim to respond within 48 hours.`
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
