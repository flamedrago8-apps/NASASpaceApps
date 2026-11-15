/**
 * Node type registry: config schema, defaults and outputs for every pipeline node.
 * The engine reads `defaults`; the dashboard renders `fields` as the settings form.
 */
import type { NodeConfig, NodeKind, Pillar } from './types';

export type Accent = 'purple' | 'amber' | 'green' | 'cyan' | 'neutral' | 'red';

export type Field =
  | { key: string; label: string; type: 'slider'; min: number; max: number; step: number; unit?: string; hint?: string }
  | { key: string; label: string; type: 'select'; options: string[]; labels?: Record<string, string>; hint?: string }
  | { key: string; label: string; type: 'toggle'; hint?: string }
  | { key: string; label: string; type: 'number'; min: number; max: number; unit?: string; hint?: string };

export type HandleSide = 'top' | 'bottom' | 'left' | 'right';

export type NodeSpec = {
  label: string;
  subtitle: string;
  pillar: Pillar;
  accent: Accent;
  description: string;
  fields: Field[];
  defaults: NodeConfig;
  /** `out` = primary path (right handle), `alt` = branch. Terminal nodes have neither. */
  outputs: { out?: string; alt?: string };
  altSide?: HandleSide;
  input?: HandleSide | null;
  terminal?: boolean;
  metric: 'blocked' | 'hitRate' | 'tokens' | 'skipped' | 'calls' | 'requests' | 'redacted' | 'trapped';
};

const ATTACK_LABELS = { block: 'Block it (403)', honeypot: 'Send to honeypot', flag: 'Allow, but flag it' };

export const MODEL_OPTIONS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'gpt-4o', 'gpt-4o-mini', 'llama-3.3-70b'];

export const NODE_SPECS: Record<NodeKind, NodeSpec> = {
  ingress: {
    label: 'Ingress',
    subtitle: 'POST /v1/chat/completions',
    pillar: 'core',
    accent: 'neutral',
    description: 'OpenAI-compatible entrypoint. Authenticates the gateway API key and stamps a trace id on every payload.',
    fields: [{ key: 'rateLimit', label: 'Rate limit', type: 'number', min: 1, max: 100000, unit: 'req/min' }],
    defaults: { rateLimit: 600 },
    outputs: { out: 'request' },
    input: null,
    metric: 'requests',
  },
  injection: {
    label: 'Prompt Injection',
    subtitle: 'Pattern + structure scoring',
    pillar: 'security',
    accent: 'purple',
    description: 'Scores user and tool content for instruction-override attempts: system-prompt leaks, role hijacks, hidden directives, secret exfiltration.',
    fields: [
      { key: 'action', label: 'When an attack is detected', type: 'select', options: ['block', 'honeypot', 'flag'], labels: ATTACK_LABELS },
      { key: 'threshold', label: 'Sensitivity threshold', type: 'slider', min: 0.3, max: 0.99, step: 0.01, hint: 'How sure it must be before acting. Lower catches more but may flag normal prompts.' },
      { key: 'scanTools', label: 'Scan tool / assistant messages', type: 'toggle' },
    ],
    defaults: { threshold: 0.75, action: 'block', scanTools: true },
    outputs: { out: 'clean', alt: 'threat' },
    altSide: 'top',
    metric: 'blocked',
  },
  jailbreak: {
    label: 'Jailbreak Detector',
    subtitle: 'Persona · obfuscation · evasion',
    pillar: 'security',
    accent: 'amber',
    description: 'Detects persona attacks (DAN, “no rules”), obfuscation (base64, leetspeak) and policy-evasion framing.',
    fields: [
      { key: 'action', label: 'When an attack is detected', type: 'select', options: ['block', 'honeypot', 'flag'], labels: ATTACK_LABELS },
      { key: 'threshold', label: 'Sensitivity threshold', type: 'slider', min: 0.3, max: 0.99, step: 0.01 },
    ],
    defaults: { threshold: 0.7, action: 'honeypot' },
    outputs: { out: 'clean', alt: 'threat' },
    altSide: 'top',
    metric: 'blocked',
  },
  pii: {
    label: 'PII Token Swapper',
    subtitle: 'Synthetic swap · restore',
    pillar: 'security',
    accent: 'purple',
    description: 'Swaps names, emails, phones, SSNs and card numbers for realistic synthetic values before the model sees them, then swaps the real values back into the response.',
    fields: [
      { key: 'mode', label: 'Mode', type: 'select', options: ['synthetic', 'redact', 'mask'], hint: 'synthetic = two-way swap. redact/mask are one-way.' },
      { key: 'names', label: 'Detect person names', type: 'toggle' },
    ],
    defaults: { mode: 'synthetic', names: true },
    outputs: { out: 'sanitized' },
    metric: 'redacted',
  },
  block: {
    label: 'Block · 403',
    subtitle: 'policy_violation',
    pillar: 'security',
    accent: 'red',
    description: 'Rejects the request with a 403 before it reaches (or bills) any model, and raises a live alert.',
    fields: [],
    defaults: {},
    outputs: {},
    input: 'top',
    terminal: true,
    metric: 'requests',
  },
  honeypot: {
    label: 'Honeypot',
    subtitle: 'Sandboxed decoy model',
    pillar: 'security',
    accent: 'red',
    description: 'Routes attackers to an isolated, ultra-cheap decoy that pretends to be compromised — fake secrets, plausible stalling — while your real models and data stay untouched.',
    fields: [
      { key: 'tarpitMs', label: 'Tarpit delay', type: 'slider', min: 0, max: 8000, step: 250, unit: 'ms', hint: 'Extra latency to waste the attacker’s time.' },
      { key: 'persona', label: 'Decoy persona', type: 'select', options: ['leaky-admin', 'confused-intern', 'fake-shell'] },
    ],
    defaults: { tarpitMs: 1500, persona: 'leaky-admin' },
    outputs: {},
    input: 'top',
    terminal: true,
    metric: 'trapped',
  },
  exactCache: {
    label: 'Exact Cache',
    subtitle: 'SHA-256 of normalized prompt',
    pillar: 'efficiency',
    accent: 'green',
    description: 'Identical prompt + model family → instant cached answer, zero model cost.',
    fields: [{ key: 'ttl', label: 'TTL', type: 'number', min: 10, max: 604800, unit: 's' }],
    defaults: { ttl: 3600 },
    outputs: { out: 'miss', alt: 'hit' },
    altSide: 'top',
    metric: 'hitRate',
  },
  semanticCache: {
    label: 'Semantic Cache',
    subtitle: 'Embeddings · entity-guarded',
    pillar: 'efficiency',
    accent: 'green',
    description: 'Embeds the prompt and serves a cached answer when an earlier prompt means the same thing (“weather in Austin?” ≈ “is it raining in Austin, TX?”). Named entities must match, so Austin never answers for Dallas.',
    fields: [
      { key: 'similarity', label: 'Similarity threshold', type: 'slider', min: 0.7, max: 0.99, step: 0.01, hint: 'Lower = more hits, higher risk of mismatched answers.' },
      { key: 'ttl', label: 'TTL', type: 'number', min: 10, max: 604800, unit: 's', hint: 'Prompts that need live data are capped at 10 minutes.' },
      { key: 'entityGuard', label: 'Require matching entities', type: 'toggle' },
    ],
    defaults: { similarity: 0.85, ttl: 7200, entityGuard: true },
    outputs: { out: 'miss', alt: 'hit' },
    altSide: 'top',
    metric: 'hitRate',
  },
  compressor: {
    label: 'Token Compressor',
    subtitle: 'Context pruning',
    pillar: 'efficiency',
    accent: 'green',
    description: 'Removes duplicated content, collapses whitespace and trims old conversation turns before the model call.',
    fields: [
      { key: 'keepTurns', label: 'Keep full history turns', type: 'slider', min: 2, max: 20, step: 1 },
      { key: 'strategy', label: 'Strategy', type: 'select', options: ['extractive', 'dedupe-only'] },
    ],
    defaults: { keepTurns: 6, strategy: 'extractive' },
    outputs: { out: 'compressed' },
    metric: 'tokens',
  },
  searchIntent: {
    label: 'Search Intent Router',
    subtitle: 'Needs live data?',
    pillar: 'search',
    accent: 'cyan',
    description: 'Sub-millisecond classifier that decides whether a prompt truly needs live web data. “What is 5 + 5?” never costs a search credit.',
    fields: [{ key: 'threshold', label: 'Search threshold', type: 'slider', min: 0.2, max: 0.95, step: 0.01, hint: 'Live-data confidence needed to search. Eco raises it, Performance lowers it.' }],
    defaults: { threshold: 0.5 },
    outputs: { out: 'search', alt: 'no search' },
    altSide: 'bottom',
    metric: 'skipped',
  },
  serpCache: {
    label: 'SERP Result Cache',
    subtitle: 'Normalized query key',
    pillar: 'search',
    accent: 'cyan',
    description: 'Reuses raw SerpAPI results for equivalent queries within the freshness window.',
    fields: [{ key: 'maxAge', label: 'Max age', type: 'select', options: ['5m', '10m', '1h', '6h'] }],
    defaults: { maxAge: '10m' },
    outputs: { out: 'miss', alt: 'hit' },
    altSide: 'bottom',
    metric: 'hitRate',
  },
  queryOptimizer: {
    label: 'Query Optimizer',
    subtitle: 'Dedupe · merge · cap',
    pillar: 'search',
    accent: 'cyan',
    description: 'Collapses a fan-out of near-duplicate queries into the minimum set, and joins identical in-flight searches across concurrent requests.',
    fields: [{ key: 'maxQueries', label: 'Max queries / request', type: 'slider', min: 1, max: 5, step: 1 }],
    defaults: { maxQueries: 2 },
    outputs: { out: 'queries' },
    metric: 'calls',
  },
  serpApi: {
    label: 'SerpAPI',
    subtitle: 'Live web search',
    pillar: 'search',
    accent: 'cyan',
    description: 'Live web search, billed per call. In Performance mode it aggregates multiple engines and de-duplicates results by URL.',
    fields: [
      { key: 'engine', label: 'Primary engine', type: 'select', options: ['google', 'bing', 'brave', 'duckduckgo'] },
      { key: 'num', label: 'Results per query', type: 'slider', min: 3, max: 20, step: 1 },
    ],
    defaults: { engine: 'google', num: 6 },
    outputs: { out: 'results' },
    metric: 'calls',
  },
  llm: {
    label: 'LLM Router',
    subtitle: 'Cost vs speed routing',
    pillar: 'core',
    accent: 'neutral',
    description: 'Calls the model, routed by the global Cost vs Speed profile: Eco → cheapest capable model, Performance → frontier model. Falls back automatically on errors.',
    fields: [
      { key: 'fallback', label: 'Fallback model', type: 'select', options: MODEL_OPTIONS },
      { key: 'maxTokens', label: 'Max output tokens', type: 'number', min: 64, max: 64000 },
    ],
    defaults: { fallback: 'claude-haiku-5-5', maxTokens: 4096 },
    outputs: { out: 'completion' },
    metric: 'requests',
  },
  response: {
    label: 'Response',
    subtitle: 'Restore PII · store caches',
    pillar: 'core',
    accent: 'neutral',
    description: 'Swaps real PII back in, stores cache entries and returns an OpenAI-format completion with ROI headers.',
    fields: [],
    defaults: {},
    outputs: {},
    terminal: true,
    metric: 'requests',
  },
};

export const PALETTE: { pillar: Pillar; kinds: NodeKind[] }[] = [
  { pillar: 'security', kinds: ['injection', 'jailbreak', 'pii', 'block', 'honeypot'] },
  { pillar: 'efficiency', kinds: ['exactCache', 'semanticCache', 'compressor'] },
  { pillar: 'search', kinds: ['searchIntent', 'serpCache', 'queryOptimizer', 'serpApi'] },
  { pillar: 'core', kinds: ['llm'] },
];
