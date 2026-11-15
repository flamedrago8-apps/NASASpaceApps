import type { Accent, Pillar } from '../types';

/** Accent tokens. Mirrors tailwind.config.js; used where colors are data-driven (SVG, inline styles). */
export const ACCENT: Record<Accent, { fg: string; soft: string; ring: string }> = {
  purple: { fg: '#A78BFA', soft: 'rgba(167,139,250,0.10)', ring: 'rgba(167,139,250,0.45)' },
  amber: { fg: '#FBBF24', soft: 'rgba(251,191,36,0.10)', ring: 'rgba(251,191,36,0.45)' },
  green: { fg: '#34D399', soft: 'rgba(52,211,153,0.10)', ring: 'rgba(52,211,153,0.45)' },
  cyan: { fg: '#22D3EE', soft: 'rgba(34,211,238,0.10)', ring: 'rgba(34,211,238,0.45)' },
  neutral: { fg: '#A1A1AA', soft: 'rgba(161,161,170,0.08)', ring: 'rgba(161,161,170,0.40)' },
  red: { fg: '#F87171', soft: 'rgba(248,113,113,0.10)', ring: 'rgba(248,113,113,0.45)' },
};

export const PILLAR: Record<Pillar, { label: string; accent: Accent; blurb: string }> = {
  security: { label: 'Security', accent: 'purple', blurb: 'Attack detection and privacy' },
  efficiency: { label: 'Cost savings', accent: 'green', blurb: 'Caching and prompt compression' },
  search: { label: 'Web search', accent: 'cyan', blurb: 'Fewer, cheaper SerpAPI calls' },
  core: { label: 'Core', accent: 'neutral', blurb: 'Ingress, model provider & response' },
};
