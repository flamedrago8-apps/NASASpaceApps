/** @type {import('tailwindcss').Config} */
import animate from 'tailwindcss-animate';
// shadcn/ui theme (CSS variables in src/index.css) + pillar accents.
const v = (name) => `hsl(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '2rem', screens: { '2xl': '1400px' } },
    extend: {
      colors: {
        // shadcn/ui tokens
        border: v('border'),
        input: v('input'),
        ring: v('ring'),
        background: v('background'),
        foreground: v('foreground'),
        primary: { DEFAULT: v('primary'), foreground: v('primary-foreground') },
        secondary: { DEFAULT: v('secondary'), foreground: v('secondary-foreground') },
        destructive: { DEFAULT: v('destructive'), foreground: v('destructive-foreground') },
        muted: { DEFAULT: v('muted'), foreground: v('muted-foreground') },
        accent: { DEFAULT: v('accent'), foreground: v('accent-foreground') },
        popover: { DEFAULT: v('popover'), foreground: v('popover-foreground') },
        card: { DEFAULT: v('card'), foreground: v('card-foreground') },

        // Legacy names used across the app, mapped onto the shadcn tokens.
        canvas: v('background'),
        surface: { DEFAULT: v('card'), 2: v('muted'), 3: v('accent') },
        line: { DEFAULT: v('border'), strong: v('input') },
        fg: { DEFAULT: v('foreground'), muted: v('muted-foreground'), subtle: v('subtle-foreground') },

        // Pillar accents
        security: { DEFAULT: '#A78BFA', amber: '#FBBF24' },
        efficiency: '#34D399',
        serp: '#22D3EE',
        danger: '#F87171',
      },
      borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)' },
      fontFamily: {
        sans: ['Geist', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: { '2xs': ['10px', '14px'] },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
        'row-in': { from: { opacity: '0', transform: 'translateY(-4px)' }, to: { opacity: '1', transform: 'none' } },
        'pulse-ring': { '0%': { opacity: '0.9', transform: 'scale(1)' }, '100%': { opacity: '0', transform: 'scale(1.06)' } },
        blink: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.35' } },
        'toast-in': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'row-in': 'row-in 280ms ease-out',
        'pulse-ring': 'pulse-ring 900ms ease-out forwards',
        blink: 'blink 1.6s ease-in-out infinite',
        'toast-in': 'toast-in 200ms ease-out',
      },
    },
  },
  plugins: [animate],
};
