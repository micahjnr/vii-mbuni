import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock Supabase so tests don't need a real connection
vi.mock('@/lib/supabase', () => ({
  default: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),
    removeChannel: vi.fn(),
  },
  sb: {
    from: vi.fn(),
    auth: { getSession: vi.fn(), onAuthStateChange: vi.fn() },
  },
}))

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
  toast: { success: vi.fn(), error: vi.fn() },
}))

// Suppress console.error noise in tests
const originalError = console.error
beforeAll(() => {
  console.error = (...args) => {
    if (args[0]?.includes?.('Warning:') || args[0]?.includes?.('ReactDOM.render')) return
    originalError(...args)
  }
})
afterAll(() => {
  console.error = originalError
})
