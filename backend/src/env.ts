import path from 'node:path';

const bool = (v: string | undefined, d = false) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(v));

export const env = {
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? '0.0.0.0',
  dataDir: path.resolve(process.env.DATA_DIR ?? './data'),
  /** Protects the dashboard/admin API. Unset = open (local dev only). */
  adminToken: process.env.ADMIN_TOKEN ?? '',
  /** Comma-separated allowed dashboard origins. Unset = reflect any origin (dev). */
  corsOrigins: (process.env.CORS_ORIGIN ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  /** Encrypts provider keys saved from the dashboard. Generated into DATA_DIR if unset. */
  secretKey: process.env.SECRET_KEY ?? '',
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? '',
  /** Generate simulated background traffic (never calls real providers). */
  demoTraffic: bool(process.env.DEMO_TRAFFIC),
  demoTrafficPerMin: Number(process.env.DEMO_TRAFFIC_PER_MIN ?? 40),
  /** 'local' (fast, default) or 'openai' (text-embedding-3-small; needs an OpenAI key). */
  embeddings: (process.env.EMBEDDINGS ?? 'local') as 'local' | 'openai',
  /** Serve the built dashboard from this directory (single-container deploys). */
  staticDir: process.env.STATIC_DIR ?? '',
  providerEnv: {
    anthropic: process.env.ANTHROPIC_API_KEY ?? '',
    openai: process.env.OPENAI_API_KEY ?? '',
    meta: process.env.LLAMA_API_KEY ?? '',
    serpapi: process.env.SERPAPI_API_KEY ?? '',
  },
  llama: { baseUrl: process.env.LLAMA_BASE_URL ?? 'https://api.groq.com/openai/v1', model: process.env.LLAMA_MODEL ?? 'llama-3.3-70b-versatile' },
  honeypot: { baseUrl: process.env.HONEYPOT_BASE_URL ?? '', apiKey: process.env.HONEYPOT_API_KEY ?? '', model: process.env.HONEYPOT_MODEL ?? '' },
};
