import { useNavigate } from 'react-router-dom'
import { Home, ArrowLeft } from 'lucide-react'

export default function NotFound() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50 dark:bg-surface-950 p-4">
      <div className="text-center space-y-5 animate-fade-up max-w-sm">
        <div className="text-8xl font-extrabold text-brand-500 opacity-20 select-none leading-none">404</div>
        <div className="space-y-2">
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">Page not found</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </div>
        <div className="flex gap-3 justify-center pt-2">
          <button onClick={() => navigate(-1)} className="btn-secondary gap-2">
            <ArrowLeft size={16} /> Go back
          </button>
          <button onClick={() => navigate('/')} className="btn-primary gap-2">
            <Home size={16} /> Home
          </button>
        </div>
      </div>
    </div>
  )
}
