/**
 * Shared contract between the gateway backend and the dashboard.
 * Everything here is plain data (JSON-serializable).
 */

// ---- Pipeline graph ---------------------------------------------------------------------------

export type Pillar = 'security' | 'efficiency' | 'search' | 'core';

export type NodeKind =
  | 'ingress'
  | 'injection'
  | 'jailbreak'
  | 'pii'
  | 'block'
  | 'honeypot'
  | 'exactCache'
  | 'semanticCache'
  | 'compressor'
  | 'searchIntent'
  | 'serpCache'
  | 'queryOptimizer'
  | 'serpApi'
  | 'llm'
  | 'response';

export type ConfigValue = number | string | boolean;
export type NodeConfig = Record<string, ConfigValue>;

export type PipelineNodeDTO = {
  id: string; // built-in nodes use their kind as id ("injection", "llm", …)
  kind: NodeKind;
  label: string;
  position: { x: number; y: number };
  enabled: boolean;
  config: NodeConfig;
};

export type PipelineEdgeDTO = { id: string; source: string; sourceHandle: 'out' | 'alt'; target: string };

export type PipelineDoc = {
  id: string;
  name: string;
  deployedVersion: number;
  hasDraft: boolean;
  updatedAt: string;
  nodes: PipelineNodeDTO[];
  edges: PipelineEdgeDTO[];
};

export type Deployment = { version: number; deployedAt: string; author: string; note?: string };

// ---- Routing profile ("Cost vs Speed") --------------------------------------------------------

export type Profile = 'eco' | 'balanced' | 'performance';

// ---- Traces -----------------------------------------------------------------------------------

export type SpanOutcome = 'pass' | 'hit' | 'miss' | 'blocked' | 'flagged' | 'bypassed' | 'skipped' | 'called' | 'redacted' | 'trapped';

export type Span = {
  nodeId: string;
  kind: NodeKind;
  name: string;
  start: number; // ms offset from request start
  duration: number; // ms
  outcome: SpanOutcome;
  detail: string;
  saved: number; // USD attributed to this step
  meta?: string[];
  tokensSaved?: number;
};

export type TraceStatus = 'ok' | 'cache_hit' | 'blocked' | 'flagged' | 'honeypot' | 'error';

export type PiiSwap = { type: string; real: string; synthetic: string };

export type Trace = {
  id: string;
  ts: number;
  app: string;
  route: string;
  model: string; // model that served the request (routed)
  requestedModel: string;
  profile: Profile;
  prompt: string; // last user message (as received; may be masked in logs)
  status: TraceStatus;
  spans: Span[];
  path: string[];
  edges: string[];
  latency: number;
  tokensIn: number; // what a gateway-less client would have sent
  tokensSent: number; // what actually went upstream
  tokensOut: number;
  searchRaw: number; // SerpAPI calls a naive "always search" agent would make
  searchSent: number; // SerpAPI calls actually made
  costBaseline: number;
  costActual: number;
  saved: number;
  threat?: string;
  threatConfidence?: number; // 0..1
  leakedThreat?: boolean; // attack that got through because a guard was off/too lax
  cache?: { kind: 'exact' | 'semantic'; similarity: number; matched?: string };
  searchBypassed?: boolean;
  simulated?: boolean; // upstream calls were simulated (no provider key / demo mode)
  error?: string;
  /** Request/response as each side saw it — powers the PII side-by-side view. */
  io?: {
    input: string;
    upstreamInput?: string;
    upstreamOutput?: string;
    output?: string;
    pii?: PiiSwap[];
  };
};

export type TraceFilter = TraceStatus | 'search' | 'all';
export type TraceQuery = { status?: TraceFilter; q?: string; limit?: number; before?: number };
export type TracePage = { items: Trace[]; nextBefore?: number };

export type TestRequest = { pipelineId: string; attack?: boolean; prompt?: string; model?: string };
export type TestResult = Trace & { response: string };

// ---- Metrics ----------------------------------------------------------------------------------

export type Range = '1h' | '24h' | '7d' | '30d';

export type Summary = {
  range: Range;
  requests: number;
  blocked: number;
  flagged: number;
  honeypotted: number;
  cacheHits: number;
  costNaive: number;
  costActual: number;
  saved: number;
  tokensSaved: number;
  searchesNaive: number;
  searchesSent: number;
  latencyP50: number;
  latencyP95: number;
  savedByPillar: Record<Exclude<Pillar, 'core'>, number>;
  threats: { type: string; count: number }[];
};

export type SeriesPoint = { t: number; requests: number; blocked: number; costNaive: number; costActual: number };

export type Lifetime = { since: number; requests: number; costNaive: number; costActual: number; saved: number; blocked: number; cacheHits: number; searchesAvoided: number };

// ---- Security ---------------------------------------------------------------------------------

export type HoneypotSession = {
  id: string; // fingerprint
  app: string;
  attempts: number;
  firstSeen: number;
  lastSeen: number;
  timeWastedMs: number;
  lastPrompt: string;
  lastReply: string;
};

// ---- Keys & settings --------------------------------------------------------------------------

export type ApiKey = { id: string; name: string; prefix: string; createdAt: string; lastUsedAt?: string; requests: number };
export type NewApiKey = ApiKey & { secret: string };

export type ProviderId = 'anthropic' | 'openai' | 'meta' | 'serpapi';

export type Settings = {
  providers: Record<ProviderId, { configured: boolean; last4?: string; source?: 'env' | 'dashboard' }>;
  budget: { monthlyUsd: number; alertAtPct: number; webhookUrl: string };
  logging: { retentionDays: number; logPayloads: boolean; redactPii: boolean };
  gateway: { baseUrl: string; region: string };
  routing: { profile: Profile };
};

export type SettingsPatch = {
  providerKeys?: Partial<Record<ProviderId, string>>;
  budget?: Partial<Settings['budget']>;
  logging?: Partial<Settings['logging']>;
  gateway?: Partial<Pick<Settings['gateway'], 'region'>>;
  routing?: Partial<Settings['routing']>;
};
