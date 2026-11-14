import type { Profile } from './types';

export type Provider = 'anthropic' | 'openai' | 'meta';
export type ModelInfo = { id: string; provider: Provider; in: number; out: number; tier: 'small' | 'mid' | 'frontier' };

/** USD per 1M tokens. Update when providers change prices. */
export const MODELS: Record<string, ModelInfo> = {
  'claude-opus-5-5': { id: 'claude-opus-5-5', provider: 'anthropic', in: 4, out: 20, tier: 'frontier' },
  'claude-sonnet-5-5': { id: 'claude-sonnet-5-5', provider: 'anthropic', in: 2, out: 10, tier: 'mid' },
  'claude-haiku-5-5': { id: 'claude-haiku-5-5', provider: 'anthropic', in: 0.1, out: 0.5, tier: 'small' },
  'gpt-4o': { id: 'gpt-4o', provider: 'openai', in: 2.5, out: 10, tier: 'frontier' },
  'gpt-4o-mini': { id: 'gpt-4o-mini', provider: 'openai', in: 0.15, out: 0.6, tier: 'small' },
  'llama-3.3-70b': { id: 'llama-3.3-70b', provider: 'meta', in: 0.59, out: 0.79, tier: 'mid' },
};

/** Price of one SerpAPI search (USD). Paid plans run roughly $0.01–0.025 per search. */
export const SERP_COST = 0.015;
/** Tokens of search context injected into the prompt per search. */
export const SERP_CTX_TOKENS = 650;
/** Honeypot decoy model price (USD / 1M tokens) — a tiny open-source model. */
export const HONEYPOT_PRICE = { in: 0.05, out: 0.08 };
/** Local embedding cost is zero; remote embeddings are ~$0.02 / 1M tokens. */
export const EMBED_PRICE = 0.02;

export function modelInfo(id: string): ModelInfo {
  if (MODELS[id]) return MODELS[id];
  const provider: Provider = id.startsWith('claude') ? 'anthropic' : id.startsWith('llama') ? 'meta' : 'openai';
  // Unknown model: price like the mid tier of its provider so savings stay conservative.
  const ref = provider === 'anthropic' ? MODELS['claude-sonnet-5-5'] : provider === 'meta' ? MODELS['llama-3.3-70b'] : MODELS['gpt-4o'];
  return { ...ref, id, provider };
}

export const tokenCost = (model: string, inTok: number, outTok: number) => {
  const m = modelInfo(model);
  return (inTok * m.in + outTok * m.out) / 1e6;
};

/** Cost vs Speed routing. Picks a model in the same provider family as the one requested. */
export function routeModel(requested: string, profile: Profile): string {
  const m = modelInfo(requested);
  if (profile === 'balanced') return m.id;
  const family = Object.values(MODELS).filter((x) => x.provider === m.provider);
  const want = profile === 'eco' ? 'small' : 'frontier';
  return family.find((x) => x.tier === want)?.id ?? m.id;
}

export const PROFILE_SEARCH: Record<Profile, { threshold: number; maxQueries: number; engines: number; num: number }> = {
  eco: { threshold: 0.75, maxQueries: 1, engines: 1, num: 4 },
  balanced: { threshold: 0, maxQueries: 2, engines: 1, num: 6 }, // 0 = use node config
  performance: { threshold: 0.35, maxQueries: 3, engines: 2, num: 8 },
};
