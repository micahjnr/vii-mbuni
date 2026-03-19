import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore, useUIStore } from '@/store'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { usePermissions } from '@/hooks/usePermissions'
import sb from '@/lib/supabase'
import {
  Bell, BellOff, Moon, Sun, Lock, Trash2, LogOut,
  Shield, Eye, EyeOff, ChevronRight, User, Palette,
  Smartphone, Info, Mail, Check, X, UserX
} from 'lucide-react'
import Avatar from '@/components/ui/Avatar'
import toast from 'react-hot-toast'
import clsx from 'clsx'

function Section({ title, children }) {
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-2.5 bg-surface-50 dark:bg-white/5 border-b border-surface-100 dark:border-white/5">
        <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{title}</span>
      </div>
      <div className="divide-y divide-surface-100 dark:divide-white/5">{children}</div>
      {/* About & Legal */}
      <Section title="About & Legal">
        <SettingRow
          icon={<span className="text-base">ℹ️</span>}
          label="About Vii-Mbuni"
          sublabel="Developer info, mission & tech stack"
          onClick={() => navigate('/about')}
        />
        <SettingRow
          icon={<span className="text-base">📋</span>}
          label="Terms & Conditions"
          sublabel="Our agreement with you"
          onClick={() => navigate('/terms')}
        />
        <div className="px-4 py-3 text-center">
          <p className="text-xs text-gray-400">Vii-Mbuni v5.8.0 · Made with ♥ for Sayawa</p>
        </div>
      </Section>
    </div>
  )
}

function Row({ icon: Icon, label, sublabel, onClick, right, danger, iconColor = 'text-brand-500' }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={clsx(
        'flex items-center gap-3 w-full px-4 py-3.5 text-left transition-colors',
        onClick && !danger && 'hover:bg-surface-50 dark:hover:bg-white/5',
        onClick && danger && 'hover:bg-red-50 dark:hover:bg-red-500/5',
        !onClick && 'cursor-default'
      )}
    >
      <div className={clsx('w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0', danger ? 'bg-red-50 dark:bg-red-500/10' : 'bg-surface-100 dark:bg-white/10')}>
        <Icon size={16} className={danger ? 'text-red-500' : iconColor} />
      </div>
      <div className="flex-1 min-w-0">
        <div className={clsx('text-sm font-semibold', danger ? 'text-red-500' : 'text-gray-900 dark:text-white')}>{label}</div>
        {sublabel && <div className="text-xs text-gray-400 mt-0.5">{sublabel}</div>}
      </div>
      {right || (onClick && <ChevronRight size={16} className="text-gray-400 flex-shrink-0" />)}
    </button>
  )
}

function Toggle({ value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={clsx(
        'relative w-11 h-6 rounded-full transition-colors flex-shrink-0',
        value ? 'bg-brand-500' : 'bg-surface-300 dark:bg-white/20'
      )}
    >
      <span className={clsx(
        'absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200',
        value ? 'translate-x-5.5' : 'translate-x-0.5'
      )} style={{ transform: value ? 'translateX(22px)' : 'translateX(2px)' }} />
    </button>
  )
}


function PermissionRow({ name }) {
  const { permissions, request, openSettings, PERMISSION_MAP, PERMISSION_REASONS } = usePermissions()
  const def = PERMISSION_MAP[name]
  const state = permissions[name]
  const [loading, setLoading] = useState(false)

  const handlePress = async () => {
    if (state === 'denied') { openSettings(name); return }
    if (state === 'granted') return
    setLoading(true)
    await request(name).catch(() => {})
    setLoading(false)
  }

  const stateLabel = state === 'granted' ? 'Allowed'
    : state === 'denied' ? 'Blocked — tap to open Settings'
    : state === 'unknown' ? 'Checking…'
    : 'Tap to allow'

  const stateColor = state === 'granted' ? 'text-green-500'
    : state === 'denied' ? 'text-red-500'
    : 'text-gray-400'

  return (
    <button onClick={handlePress}
      disabled={loading || state === 'granted'}
      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-50 dark:hover:bg-white/5 transition-colors disabled:cursor-default">
      <span className="text-xl flex-shrink-0">{def?.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-gray-900 dark:text-white">{def?.label}</div>
        <div className="text-xs text-gray-400 mt-0.5">{PERMISSION_REASONS[name]}</div>
      </div>
      <div className={clsx('text-xs font-semibold flex-shrink-0', stateColor)}>
        {loading ? '…' : stateLabel}
      </div>
    </button>
  )
}

export default function Settings() {
  const { user, profile, signOut } = useAuthStore()
  const qc = useQueryClient()
  const [showBlocked, setShowBlocked] = useState(false)

  const { data: blockedUsers = [] } = useQuery({
    queryKey: ['blocked-users', user?.id],
    queryFn: async () => {
      const { data } = await sb
        .from('blocked_users')
        .select('blocked_id, profiles:blocked_id(id, username, full_name, avatar_url)')
        .eq('user_id', user.id)
      return data || []
    },
    enabled: !!user?.id && showBlocked,
  })

  const unblock = async (blockedId) => {
    await sb.from('blocked_users').delete().eq('user_id', user.id).eq('blocked_id', blockedId)
    await sb.from('friends').delete()
      .eq('user_id', user.id).eq('friend_id', blockedId)
    qc.invalidateQueries({ queryKey: ['blocked-users'] })
    toast.success('User unblocked')
  }
  const { theme, toggleTheme } = useUIStore()
  const { supported: pushSupported, enabled: pushEnabled, loading: pushLoading, toggle: togglePush } = usePushNotifications()
  const navigate = useNavigate()

  const [changingPassword, setChangingPassword] = useState(false)
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [pwLoading, setPwLoading] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleteInput, setDeleteInput] = useState('')

  const handleChangePassword = async () => {
    if (!pwForm.current)           { toast.error('Enter your current password'); return }
    if (pwForm.next.length < 6)    { toast.error('New password must be at least 6 characters'); return }
    if (pwForm.next !== pwForm.confirm) { toast.error('Passwords do not match'); return }
    if (pwForm.next === pwForm.current) { toast.error('New password must be different'); return }
    setPwLoading(true)
    try {
      // Re-authenticate with current password first
      const { error: signInError } = await sb.auth.signInWithPassword({
        email: user.email,
        password: pwForm.current,
      })
      if (signInError) { toast.error('Current password is incorrect'); return }
      const { error } = await sb.auth.updateUser({ password: pwForm.next })
      if (error) throw error
      toast.success('Password updated!')
      setChangingPassword(false)
      setPwForm({ current: '', next: '', confirm: '' })
    } catch (e) {
      toast.error(e.message || 'Failed to update password')
    } finally {
      setPwLoading(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (deleteInput !== 'DELETE') { toast.error('Type DELETE to confirm'); return }
    setDeleteConfirm(false)
    try {
      // Delete all user data in order (posts, messages, etc. cascade via DB FK)
      const uid = user.id
      await sb.from('posts').delete().eq('user_id', uid)
      await sb.from('messages').delete().or(`sender_id.eq.${uid},receiver_id.eq.${uid}`)
      await sb.from('friends').delete().or(`user_id.eq.${uid},friend_id.eq.${uid}`)
      await sb.from('notifications').delete().eq('user_id', uid)
      await sb.from('profiles').delete().eq('id', uid)
      // Sign out and delete auth account
      await sb.auth.admin?.deleteUser?.(uid).catch(() => {})
      await sb.auth.signOut()
      toast.success('Account deleted. Goodbye 👋')
      navigate('/login')
    } catch (e) {
      toast.error('Could not fully delete account. Please contact support.')
    }
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <>
    <div className="space-y-5 animate-fade-in pb-10">
      <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">Settings</h1>

      {/* Account */}
      <Section title="Account">
        <Row
          icon={User}
          label="Edit Profile"
          sublabel="Name, bio, avatar, website"
          onClick={() => navigate('/profile?edit=1')}
        />
        <Row
          icon={Mail}
          label="Email address"
          sublabel={user?.email || 'Not set'}
          onClick={null}
          right={<span className="text-xs text-gray-400">{user?.email}</span>}
        />
        <Row
          icon={Lock}
          label="Change Password"
          sublabel="Update your login password"
          onClick={() => setChangingPassword(v => !v)}
        />
        {changingPassword && (
          <div className="px-4 py-4 space-y-3 bg-surface-100 dark:bg-surface-800 border-t border-surface-200 dark:border-white/10">
            <input
              type="password"
              value={pwForm.current}
              onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))}
              placeholder="Current password"
              className="input"
            />
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={pwForm.next}
                onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))}
                placeholder="New password (min 6 chars)"
                className="input pr-10"
              />
              <button onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <input
              type="password"
              value={pwForm.confirm}
              onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
              placeholder="Confirm new password"
              className="input"
            />
            <div className="flex gap-2">
              <button onClick={handleChangePassword} disabled={pwLoading || !pwForm.current || !pwForm.next || !pwForm.confirm}
                className="btn-primary flex-1 text-sm py-2">
                {pwLoading ? 'Saving…' : 'Update Password'}
              </button>
              <button onClick={() => { setChangingPassword(false); setPwForm({ current: '', next: '', confirm: '' }) }}
                className="btn-secondary text-sm py-2 px-4">Cancel</button>
            </div>
          </div>
        )}
      </Section>

      {/* Appearance */}
      <Section title="Appearance">
        <Row
          icon={theme === 'dark' ? Moon : Sun}
          label="Dark mode"
          sublabel={theme === 'dark' ? 'Currently on' : 'Currently off'}
          onClick={null}
          right={<Toggle value={theme === 'dark'} onChange={toggleTheme} />}
        />
      </Section>

      {/* Notifications */}
      <Section title="Notifications">
        {pushSupported ? (
          <Row
            icon={pushEnabled ? Bell : BellOff}
            label="Push notifications"
            sublabel={pushEnabled ? 'Enabled — you\'ll get notified when minimized' : 'Disabled — tap to enable'}
            onClick={null}
            right={<Toggle value={pushEnabled} onChange={() => !pushLoading && togglePush()} />}
            iconColor={pushEnabled ? 'text-brand-500' : 'text-gray-400'}
          />
        ) : (
          <Row
            icon={BellOff}
            label="Push notifications"
            sublabel="Not supported in this browser"
            onClick={null}
            right={<span className="text-xs text-gray-400">Unavailable</span>}
          />
        )}
      </Section>

      {/* App Permissions */}
      <Section title="App Permissions">
        <PermissionRow name="camera" />
        <PermissionRow name="microphone" />
        <PermissionRow name="notifications" />
        <PermissionRow name="location" />
        <PermissionRow name="storage" />
      </Section>

      {/* Privacy */}
      <Section title="Privacy & Safety">
        <Row
          icon={Shield}
          label="Blocked users"
          sublabel="Manage who you've blocked"
          onClick={() => setShowBlocked(true)}
        />
        <Row
          icon={Eye}
          label="Who can see my posts"
          sublabel="Manage post visibility"
          onClick={() => navigate('/profile')}
        />
      </Section>

      {/* About */}
      <Section title="About">
        <Row
          icon={Info}
          label="App version"
          sublabel="Vii-Mbuni v5.8"
          onClick={null}
          right={<span className="text-xs font-mono text-gray-400">v5.8.0</span>}
        />
        <Row
          icon={Smartphone}
          label="Install as app"
          sublabel="Add to home screen for push notifications"
          onClick={() => toast('Open your browser menu → Add to Home Screen')}
        />
      </Section>

      {/* Danger zone */}
      <Section title="Account Actions">
        <Row
          icon={LogOut}
          label="Sign out"
          sublabel="Sign out of your account"
          onClick={handleSignOut}
          danger
        />
        <Row
          icon={Trash2}
          label="Delete account"
          sublabel="Permanently delete your account and data"
          onClick={() => setDeleteConfirm(true)}
          danger
        />
      </Section>

      {/* Delete confirm modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white dark:bg-surface-900 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="text-center">
              <div className="text-4xl mb-3">⚠️</div>
              <h2 className="font-bold text-lg text-gray-900 dark:text-white">Delete account?</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                This will permanently delete all your posts, messages, and data. This cannot be undone.
              </p>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 block mb-1.5">
                Type <span className="font-bold text-red-500">DELETE</span> to confirm
              </label>
              <input
                value={deleteInput}
                onChange={e => setDeleteInput(e.target.value)}
                placeholder="DELETE"
                className="input"
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setDeleteConfirm(false); setDeleteInput('') }}
                className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleDeleteAccount} disabled={deleteInput !== 'DELETE'}
                className="btn-danger flex-1 disabled:opacity-40">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>

    {/* ── Blocked Users Modal ── */}
    {showBlocked && (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4 pb-4 sm:pb-0"
        onClick={() => setShowBlocked(false)}>
        <div className="bg-white dark:bg-surface-900 rounded-2xl w-full max-w-sm shadow-2xl max-h-[70vh] flex flex-col"
          onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100 dark:border-white/10">
            <h3 className="font-bold text-gray-900 dark:text-white">Blocked Users</h3>
            <button onClick={() => setShowBlocked(false)}><X size={18} className="text-gray-400" /></button>
          </div>
          <div className="overflow-y-auto flex-1">
            {blockedUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Shield size={32} className="text-gray-300" />
                <p className="text-sm text-gray-400">No blocked users</p>
              </div>
            ) : (
              blockedUsers.map(b => (
                <div key={b.blocked_id} className="flex items-center gap-3 px-5 py-3 border-b border-surface-100 dark:border-white/5 last:border-0">
                  <Avatar src={b.profiles?.avatar_url} name={b.profiles?.full_name} size={40} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{b.profiles?.full_name}</p>
                    <p className="text-xs text-gray-400">@{b.profiles?.username}</p>
                  </div>
                  <button onClick={() => unblock(b.blocked_id)}
                    className="text-xs text-brand-500 hover:text-brand-600 font-semibold px-3 py-1.5 rounded-lg border border-brand-200 dark:border-brand-500/30 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-colors flex-shrink-0">
                    Unblock
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    )}
    </>
  )
}