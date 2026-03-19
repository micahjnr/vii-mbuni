/**
 * Tests for the Groq AI utility helper
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Import after mocking
const { askGroq } = await import('@/lib/groq')

describe('askGroq', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('calls the Groq endpoint with correct payload', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ text: 'Great post!' }] }),
    })

    const result = await askGroq('Write a comment')
    expect(result).toBe('Great post!')
    expect(mockFetch).toHaveBeenCalledWith(
      '/.netlify/functions/groq',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('throws on API error response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Rate limited' }),
    })

    await expect(askGroq('test')).rejects.toThrow('Rate limited')
  })

  it('returns empty string when content is missing', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [] }),
    })

    const result = await askGroq('test')
    expect(result).toBe('')
  })

  it('accepts custom system prompt and maxTokens', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ text: 'response' }] }),
    })

    await askGroq('prompt', { system: 'Custom system', maxTokens: 500 })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.system).toBe('Custom system')
    expect(body.max_tokens).toBe(500)
  })
})
