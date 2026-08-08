/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#FAF9F7',
          dark: '#0F0F0E',
          elevated: '#FFFFFF',
          card: '#F3F1ED',
        },
        ink: {
          DEFAULT: '#1A1917',
          muted: '#5C5A56',
          faint: '#8A8782',
        },
        amber: {
          DEFAULT: '#B8860B',
          soft: '#C4A574',
          glow: '#E8D5B0',
        },
        teal: {
          DEFAULT: '#3D8B8B',
          soft: '#5BA3A3',
        },
      },
      fontFamily: {
        serif: ['"Instrument Serif"', 'Georgia', 'serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      animation: {
        'pulse-soft': 'pulse-soft 4s ease-in-out infinite',
        shimmer: 'shimmer 2.5s linear infinite',
      },
      keyframes: {
        'pulse-soft': {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '0.8' },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
