/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Base surfaces — layered from the page background upward.
        canvas: '#0A0A0C',
        surface: { DEFAULT: '#0F0F12', 2: '#141418', 3: '#1A1A20' },
        line: { DEFAULT: '#1E1E24', strong: '#2A2A32' },
        fg: { DEFAULT: '#EDEDEF', muted: '#9A9AA4', subtle: '#63636D' },
        // Pillar accents.
        security: { DEFAULT: '#A78BFA', amber: '#FBBF24' },
        efficiency: '#34D399',
        serp: '#22D3EE',
        danger: '#F87171',
      },
      fontFamily: {
        sans: ['Geist', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: { '2xs': ['10px', '14px'] },
      keyframes: {
        'row-in': { from: { opacity: '0', transform: 'translateY(-4px)' }, to: { opacity: '1', transform: 'none' } },
        'pulse-ring': { '0%': { opacity: '0.9', transform: 'scale(1)' }, '100%': { opacity: '0', transform: 'scale(1.06)' } },
        blink: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.35' } },
        'toast-in': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: {
        'row-in': 'row-in 280ms ease-out',
        'pulse-ring': 'pulse-ring 900ms ease-out forwards',
        blink: 'blink 1.6s ease-in-out infinite',
        'toast-in': 'toast-in 200ms ease-out',
      },
    },
  },
  plugins: [],
};
