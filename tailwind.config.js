/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f3eeff',
          100: '#e4d9ff',
          200: '#ccb8ff',
          300: '#aa8cff',
          400: '#9d78ff',
          500: '#7c4dff',
          600: '#6b35f5',
          700: '#5e1de3',
          800: '#4e18b8',
          900: '#3d1490',
          950: '#1a0a3d',
        },
        surface: {
          50:  '#f8f8fc',
          100: '#f0f0f8',
          200: '#e2e2f0',
          800: '#1e1e2e',
          900: '#13131f',
          950: '#0a0a14',
        },
      },
      boxShadow: {
        card:      '0 1px 3px 0 rgb(0 0 0 / 0.07), 0 1px 2px -1px rgb(0 0 0 / 0.07)',
        'card-lg': '0 10px 40px -4px rgb(0 0 0 / 0.12), 0 4px 16px -4px rgb(0 0 0 / 0.08)',
        'glow-sm': '0 0 12px rgb(124 77 255 / 0.35)',
        glow:      '0 0 24px rgb(124 77 255 / 0.5)',
      },
      keyframes: {
        shimmer: {
          '0%':   { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in': {
          from: { transform: 'translateX(-100%)' },
          to:   { transform: 'translateX(0)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.6' },
        },
        grow: {
          from: { width: '0%' },
          to:   { width: '100%' },
        },
      },
      animation: {
        shimmer:     'shimmer 2s linear infinite',
        'fade-in':   'fade-in 0.2s ease-out',
        'fade-up':   'fade-up 0.25s ease-out',
        'slide-in':  'slide-in 0.25s ease-out',
        'pulse-soft':'pulse-soft 2s ease-in-out infinite',
        grow:        'grow 4s linear forwards',
      },
    },
  },
  plugins: [],
}
