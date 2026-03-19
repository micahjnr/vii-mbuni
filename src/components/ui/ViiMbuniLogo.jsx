// src/components/ui/ViiMbuniLogo.jsx
// <ViiMbuniLogo />           full logo (sidebar)
// <ViiMbuniLogo size="lg" /> login/register hero
// <ViiMbuniLogo iconOnly />  just the mark

export default function ViiMbuniLogo({ size = 'md', iconOnly = false }) {
  const heights = { sm: 36, md: 44, lg: 64 }
  const h = heights[size] || 44
  const pad = size === 'lg' ? 10 : size === 'sm' ? 5 : 7

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#111118',
        borderRadius: h * 0.28,
        padding: pad,
        lineHeight: 0,
      }}
    >
      <img
        src="/logo.png"
        alt="Vii-Mbuni"
        height={h}
        style={{ height: h, width: 'auto', objectFit: 'contain', display: 'block' }}
      />
    </div>
  )
}
