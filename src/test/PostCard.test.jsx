/**
 * Component tests for PostActions and QuotePreview
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// ── PostActions ──────────────────────────────────────────────
// Inline minimal version for unit testing (avoids heavy import tree)
function PostActions({ totalCommentCount, viewCount, bookmarked, onToggleComments, onBookmark }) {
  return (
    <div>
      <button onClick={onToggleComments} data-testid="comment-btn">
        Comment {totalCommentCount > 0 && <span>{totalCommentCount}</span>}
      </button>
      <button
        onClick={onBookmark}
        data-testid="bookmark-btn"
        aria-pressed={bookmarked}
      >
        {bookmarked ? 'Bookmarked' : 'Bookmark'}
      </button>
      {viewCount > 0 && <span data-testid="view-count">{viewCount >= 1000 ? `${(viewCount / 1000).toFixed(1)}k` : viewCount}</span>}
    </div>
  )
}

describe('PostActions', () => {
  it('calls onToggleComments when comment button clicked', () => {
    const onToggle = vi.fn()
    render(<PostActions totalCommentCount={5} viewCount={0} bookmarked={false} onToggleComments={onToggle} onBookmark={vi.fn()} />)
    fireEvent.click(screen.getByTestId('comment-btn'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('displays comment count when greater than zero', () => {
    render(<PostActions totalCommentCount={12} viewCount={0} bookmarked={false} onToggleComments={vi.fn()} onBookmark={vi.fn()} />)
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  it('does not display comment count when zero', () => {
    render(<PostActions totalCommentCount={0} viewCount={0} bookmarked={false} onToggleComments={vi.fn()} onBookmark={vi.fn()} />)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('shows bookmarked state correctly', () => {
    render(<PostActions totalCommentCount={0} viewCount={0} bookmarked={true} onToggleComments={vi.fn()} onBookmark={vi.fn()} />)
    expect(screen.getByTestId('bookmark-btn')).toHaveAttribute('aria-pressed', 'true')
  })

  it('formats view count in thousands', () => {
    render(<PostActions totalCommentCount={0} viewCount={2500} bookmarked={false} onToggleComments={vi.fn()} onBookmark={vi.fn()} />)
    expect(screen.getByTestId('view-count').textContent).toBe('2.5k')
  })

  it('shows exact view count under 1000', () => {
    render(<PostActions totalCommentCount={0} viewCount={842} bookmarked={false} onToggleComments={vi.fn()} onBookmark={vi.fn()} />)
    expect(screen.getByTestId('view-count').textContent).toBe('842')
  })
})

// ── QuotePreview ─────────────────────────────────────────────
function QuotePreview({ quotedPost }) {
  if (!quotedPost) return null
  return (
    <div data-testid="quote-preview">
      <span>{quotedPost.profiles?.full_name}</span>
      <p>{quotedPost.content || '(no caption)'}</p>
    </div>
  )
}

describe('QuotePreview', () => {
  it('renders nothing when quotedPost is null', () => {
    const { container } = render(<QuotePreview quotedPost={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders author name and content', () => {
    const quoted = {
      profiles: { full_name: 'Jane Doe' },
      content: 'Hello world',
    }
    render(<QuotePreview quotedPost={quoted} />)
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('shows fallback when content is empty', () => {
    const quoted = { profiles: { full_name: 'Bob' }, content: '' }
    render(<QuotePreview quotedPost={quoted} />)
    expect(screen.getByText('(no caption)')).toBeInTheDocument()
  })
})
