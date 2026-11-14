/**
 * Backend contract. Every request/response the dashboard makes is typed here.
 * The HTTP client (./http.ts) maps these 1:1 onto the REST endpoints in API.md.
 */
import type { NodeConfig, NodeKind, Pillar, Trace, TraceStatus } from '../types';

export type { Trace, Span, TraceStatus, SpanOutcome, NodeKind, NodeConfig } from '../types';

// ---- Pipelines -------------------------------------------------------------------------------

export type PipelineNodeDTO = {
  id: string; // canonical nodes use their kind as id ("injection", "llm", …)
  kind: NodeKind;
  label: string;
  position: { x: number; y: number };
  enabled: boolean;
  config: NodeConfig;
};

export type PipelineEdgeDTO = {
  id: string;
  source: string;
  sourceHandle: 'out' | 'alt';
  target: string;
};

export type PipelineDoc = {
  id: string;
  name: string;
  /** Version currently deployed to production. */
  deployedVersion: number;
  /** True when the saved draft differs from the deployed version. */
  hasDraft: boolean;
  updatedAt: string; // ISO
  nodes: PipelineNodeDTO[];
  edges: PipelineEdgeDTO[];
};

export type Deployment = {
  version: number;
  deployedAt: string; // ISO
  author: string;
  note?: string;
};

// ---- Traces ----------------------------------------------------------------------------------

export type TraceFilter = TraceStatus | 'search' | 'all';

export type TraceQuery = {
  status?: TraceFilter;
  q?: string;
  limit?: number;
  /** Cursor: return traces strictly older than this timestamp (ms). */
  before?: number;
};

export type TracePage = { items: Trace[]; nextBefore?: number };

export type TestRequest = { pipelineId: string; attack?: boolean; prompt?: string };

// ---- Metrics ---------------------------------------------------------------------------------

export type Range = '1h' | '24h' | '7d' | '30d';

export type Summary = {
  range: Range;
  requests: number;
  blocked: number;
  flagged: number;
  cacheHits: number;
  costNaive: number; // USD a gateway-less client would have spent
  costActual: number; // USD actually spent
  saved: number; // costNaive - costActual
  tokensSaved: number;
  searchesNaive: number;
  searchesSent: number;
  latencyP50: number; // ms
  latencyP95: number; // ms
  savedByPillar: Record<Exclude<Pillar, 'core'>, number>;
  threats: { type: string; count: number }[];
};

export type SeriesPoint = {
  t: number; // bucket start, ms
  requests: number;
  blocked: number;
  costNaive: number;
  costActual: number;
};

// ---- API keys --------------------------------------------------------------------------------

export type ApiKey = {
  id: string;
  name: string;
  prefix: string; // e.g. "cdt_live_4f2a"
  createdAt: string;
  lastUsedAt?: string;
  requests: number;
};

/** Returned once, at creation. `secret` is never retrievable again. */
export type NewApiKey = ApiKey & { secret: string };

// ---- Settings --------------------------------------------------------------------------------

export type ProviderId = 'anthropic' | 'openai' | 'meta' | 'serpapi';

export type Settings = {
  providers: Record<ProviderId, { configured: boolean; last4?: string }>;
  budget: { monthlyUsd: number; alertAtPct: number; webhookUrl: string };
  logging: { retentionDays: number; logPayloads: boolean; redactPii: boolean };
  gateway: { baseUrl: string; region: string };
};

export type SettingsPatch = {
  /** Write-only. Send a provider's key to set or replace it; empty string clears it. */
  providerKeys?: Partial<Record<ProviderId, string>>;
  budget?: Partial<Settings['budget']>;
  logging?: Partial<Settings['logging']>;
  gateway?: Partial<Pick<Settings['gateway'], 'region'>>;
};
