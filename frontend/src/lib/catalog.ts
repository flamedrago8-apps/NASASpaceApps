import {
  Archive,
  Ban,
  Cpu,
  Database,
  EyeOff,
  Filter,
  Globe,
  Layers,
  ScanEye,
  Send,
  ShieldAlert,
  Shrink,
  Split,
  Webhook,
  type LucideIcon,
} from 'lucide-react';
import type { Accent, NodeConfig, NodeKind, Pillar } from '../types';

export type Field =
  | { key: string; label: string; type: 'slider'; min: number; max: number; step: number; unit?: string; hint?: string }
  | { key: string; label: string; type: 'select'; options: string[]; hint?: string }
  | { key: string; label: string; type: 'toggle'; hint?: string }
  | { key: string; label: string; type: 'number'; min: number; max: number; unit?: string; hint?: string };

export type HandleSide = 'top' | 'bottom' | 'left' | 'right';

export type CatalogEntry = {
  label: string;
  subtitle: string;
  pillar: Pillar;
  accent: Accent;
  icon: LucideIcon;
  description: string;
  fields: Field[];
  defaults: NodeConfig;
  /** Named outputs. `out` = primary path (right side), `alt` = branch. */
  outputs: { out?: string; alt?: string };
  altSide?: HandleSide;
  input?: HandleSide | null;
  /** Metric labels shown on the node card. */
  metric: 'blocked' | 'hitRate' | 'tokens' | 'skipped' | 'calls' | 'requests' | 'redacted';
};

export const CATALOG: Record<NodeKind, CatalogEntry> = {
  ingress: {
    label: 'Ingress',
    subtitle: 'POST /v1/chat/completions',
    pillar: 'core',
    accent: 'neutral',
    icon: Webhook,
    description: 'OpenAI-compatible entrypoint. Authenticates the API key and stamps a trace id on every payload.',
    fields: [
      { key: 'rateLimit', label: 'Rate limit', type: 'number', min: 10, max: 10000, unit: 'req/min' },
      { key: 'auth', label: 'Auth', type: 'select', options: ['api-key', 'jwt', 'mTLS'] },
    ],
    defaults: { rateLimit: 2400, auth: 'api-key' },
    outputs: { out: 'request' },
    input: null,
    metric: 'requests',
  },
  injection: {
    label: 'Prompt Injection',
    subtitle: 'Classifier · guard-v3',
    pillar: 'security',
    accent: 'purple',
    icon: ScanEye,
    description: 'Scores user and tool content for instruction-override attempts (system prompt leaks, role hijacks, hidden directives).',
    fields: [
      { key: 'threshold', label: 'Block threshold', type: 'slider', min: 0.3, max: 0.99, step: 0.01, hint: 'Lower = stricter. Below ~0.5 expect false positives.' },
      { key: 'action', label: 'On detection', type: 'select', options: ['block', 'flag', 'log'] },
      { key: 'scanTools', label: 'Scan tool outputs', type: 'toggle' },
    ],
    defaults: { threshold: 0.8, action: 'block', scanTools: true },
    outputs: { out: 'clean', alt: 'threat' },
    altSide: 'top',
    metric: 'blocked',
  },
  jailbreak: {
    label: 'Jailbreak Detector',
    subtitle: 'Heuristics + LLM judge',
    pillar: 'security',
    accent: 'amber',
    icon: ShieldAlert,
    description: 'Detects persona attacks, obfuscation (base64, leetspeak) and policy-evasion framing.',
    fields: [
      { key: 'threshold', label: 'Block threshold', type: 'slider', min: 0.3, max: 0.99, step: 0.01 },
      { key: 'action', label: 'On detection', type: 'select', options: ['block', 'flag', 'log'] },
      { key: 'judge', label: 'Judge model', type: 'select', options: ['guard-mini', 'guard-large'] },
    ],
    defaults: { threshold: 0.75, action: 'block', judge: 'guard-mini' },
    outputs: { out: 'clean', alt: 'threat' },
    altSide: 'top',
    metric: 'blocked',
  },
  pii: {
    label: 'PII Redactor',
    subtitle: 'NER · 14 entity types',
    pillar: 'security',
    accent: 'purple',
    icon: EyeOff,
    description: 'Redacts emails, phone numbers, card numbers and secrets before the payload leaves your network.',
    fields: [
      { key: 'mode', label: 'Mode', type: 'select', options: ['redact', 'mask', 'hash'] },
      { key: 'secrets', label: 'Detect API keys & secrets', type: 'toggle' },
    ],
    defaults: { mode: 'redact', secrets: true },
    outputs: { out: 'sanitized' },
    metric: 'redacted',
  },
  block: {
    label: 'Block · 403',
    subtitle: 'policy_violation',
    pillar: 'security',
    accent: 'red',
    icon: Ban,
    description: 'Terminates the request with a 403 and writes an audit event. Nothing reaches the model provider.',
    fields: [{ key: 'notify', label: 'Alert webhook', type: 'toggle' }],
    defaults: { notify: true },
    outputs: {},
    input: 'top',
    metric: 'requests',
  },
  exactCache: {
    label: 'Exact Cache',
    subtitle: 'SHA-256 · Redis',
    pillar: 'efficiency',
    accent: 'green',
    icon: Database,
    description: 'Byte-identical prompt + params hash lookup. Sub-millisecond, zero model cost on hit.',
    fields: [
      { key: 'ttl', label: 'TTL', type: 'number', min: 60, max: 86400, unit: 's' },
      { key: 'scope', label: 'Scope', type: 'select', options: ['global', 'per-user', 'per-key'] },
    ],
    defaults: { ttl: 3600, scope: 'global' },
    outputs: { out: 'miss', alt: 'hit' },
    altSide: 'top',
    metric: 'hitRate',
  },
  semanticCache: {
    label: 'Semantic Cache',
    subtitle: 'Embeddings · cosine',
    pillar: 'efficiency',
    accent: 'green',
    icon: Layers,
    description: 'Embeds the prompt and serves a cached answer when a previous request is similar enough.',
    fields: [
      { key: 'similarity', label: 'Similarity threshold', type: 'slider', min: 0.8, max: 0.99, step: 0.01, hint: 'Lower = more hits, higher risk of stale/mismatched answers.' },
      { key: 'ttl', label: 'TTL', type: 'number', min: 60, max: 86400, unit: 's' },
      { key: 'embedder', label: 'Embedding model', type: 'select', options: ['embed-small', 'embed-large'] },
    ],
    defaults: { similarity: 0.92, ttl: 7200, embedder: 'embed-small' },
    outputs: { out: 'miss', alt: 'hit' },
    altSide: 'top',
    metric: 'hitRate',
  },
  compressor: {
    label: 'Token Compressor',
    subtitle: 'Context pruning',
    pillar: 'efficiency',
    accent: 'green',
    icon: Shrink,
    description: 'Prunes redundant history, boilerplate and low-information tokens before the model call.',
    fields: [
      { key: 'ratio', label: 'Target reduction', type: 'slider', min: 0.05, max: 0.6, step: 0.01, unit: '%' },
      { key: 'strategy', label: 'Strategy', type: 'select', options: ['extractive', 'summarize-history', 'dedupe-only'] },
      { key: 'keepSystem', label: 'Never touch system prompt', type: 'toggle' },
    ],
    defaults: { ratio: 0.35, strategy: 'extractive', keepSystem: true },
    outputs: { out: 'compressed' },
    metric: 'tokens',
  },
  searchIntent: {
    label: 'Search Intent Router',
    subtitle: 'Needs live data?',
    pillar: 'search',
    accent: 'cyan',
    icon: Split,
    description: 'Decides whether the request truly needs fresh web results, or can be answered from model knowledge.',
    fields: [
      { key: 'confidence', label: 'Skip confidence', type: 'slider', min: 0.5, max: 0.99, step: 0.01 },
      { key: 'freshness', label: 'Freshness window', type: 'select', options: ['24h', '7d', '30d'] },
    ],
    defaults: { confidence: 0.8, freshness: '7d' },
    outputs: { out: 'search', alt: 'no search' },
    altSide: 'bottom',
    metric: 'skipped',
  },
  serpCache: {
    label: 'SERP Result Cache',
    subtitle: 'Normalized query key',
    pillar: 'search',
    accent: 'cyan',
    icon: Archive,
    description: 'Reuses recent SerpAPI results for equivalent queries within the freshness window.',
    fields: [
      { key: 'maxAge', label: 'Max age', type: 'select', options: ['5m', '1h', '6h', '24h'] },
      { key: 'normalize', label: 'Normalize queries', type: 'toggle' },
    ],
    defaults: { maxAge: '1h', normalize: true },
    outputs: { out: 'miss', alt: 'hit' },
    altSide: 'bottom',
    metric: 'hitRate',
  },
  queryOptimizer: {
    label: 'Query Optimizer',
    subtitle: 'Dedupe · merge · rewrite',
    pillar: 'search',
    accent: 'cyan',
    icon: Filter,
    description: 'Collapses an agent’s fan-out of near-duplicate queries into the minimum set of precise searches.',
    fields: [
      { key: 'maxQueries', label: 'Max queries / request', type: 'slider', min: 1, max: 5, step: 1 },
      { key: 'merge', label: 'Merge overlapping queries', type: 'toggle' },
    ],
    defaults: { maxQueries: 2, merge: true },
    outputs: { out: 'queries' },
    metric: 'calls',
  },
  serpApi: {
    label: 'SerpAPI',
    subtitle: 'engine=google',
    pillar: 'search',
    accent: 'cyan',
    icon: Globe,
    description: 'Live web search. Billed per call — every call avoided upstream is money saved.',
    fields: [
      { key: 'engine', label: 'Engine', type: 'select', options: ['google', 'bing', 'duckduckgo'] },
      { key: 'num', label: 'Results', type: 'slider', min: 3, max: 20, step: 1 },
    ],
    defaults: { engine: 'google', num: 8 },
    outputs: { out: 'results' },
    metric: 'calls',
  },
  llm: {
    label: 'LLM Provider',
    subtitle: 'Primary + fallback',
    pillar: 'core',
    accent: 'neutral',
    icon: Cpu,
    description: 'Forwards the optimized payload to the configured model, with automatic fallback on 429/5xx.',
    fields: [
      { key: 'model', label: 'Primary model', type: 'select', options: ['claude-sonnet-5-5', 'claude-haiku-5-5', 'gpt-5-mini', 'llama-4-70b'] },
      { key: 'fallback', label: 'Fallback', type: 'select', options: ['claude-haiku-5-5', 'gpt-5-mini', 'llama-4-70b'] },
    ],
    defaults: { model: 'claude-sonnet-5-5', fallback: 'claude-haiku-5-5' },
    outputs: { out: 'completion' },
    metric: 'requests',
  },
  response: {
    label: 'Response',
    subtitle: '200 · streamed',
    pillar: 'core',
    accent: 'neutral',
    icon: Send,
    description: 'Streams the completion back to the client and records ROI for the trace.',
    fields: [],
    defaults: {},
    outputs: {},
    metric: 'requests',
  },
};

export const PALETTE: { pillar: Pillar; kinds: NodeKind[] }[] = [
  { pillar: 'security', kinds: ['injection', 'jailbreak', 'pii', 'block'] },
  { pillar: 'efficiency', kinds: ['exactCache', 'semanticCache', 'compressor'] },
  { pillar: 'search', kinds: ['searchIntent', 'serpCache', 'queryOptimizer', 'serpApi'] },
  { pillar: 'core', kinds: ['llm'] },
];
