import type { Edge, Node } from '@xyflow/react';

export type Pillar = 'security' | 'efficiency' | 'search' | 'core';
export type Accent = 'purple' | 'amber' | 'green' | 'cyan' | 'neutral' | 'red';

export type NodeKind =
  | 'ingress'
  | 'injection'
  | 'jailbreak'
  | 'pii'
  | 'block'
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

export type PipelineNodeData = {
  kind: NodeKind;
  label: string;
  enabled: boolean;
  config: NodeConfig;
};
export type PipelineNode = Node<PipelineNodeData, 'pipeline'>;

export type LaneNodeData = { pillar: Pillar; title: string; subtitle: string };
export type LaneNode = Node<LaneNodeData, 'lane'>;

export type AppNode = PipelineNode | LaneNode;

export type PacketEdgeData = { color: string; label?: string };
export type PacketEdge = Edge<PacketEdgeData, 'packet'>;

export type SpanOutcome =
  | 'pass'
  | 'hit'
  | 'miss'
  | 'blocked'
  | 'flagged'
  | 'bypassed'
  | 'skipped'
  | 'called'
  | 'redacted';

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

export type TraceStatus = 'ok' | 'cache_hit' | 'blocked' | 'flagged';

export type Trace = {
  id: string;
  ts: number;
  app: string;
  route: string;
  model: string;
  prompt: string;
  status: TraceStatus;
  spans: Span[];
  path: string[];
  edges: string[];
  latency: number;
  tokensIn: number; // tokens a naive client would have sent
  tokensSent: number; // tokens actually sent upstream
  tokensOut: number;
  searchRaw: number; // SerpAPI calls a naive agent would make
  searchSent: number; // SerpAPI calls actually made
  costBaseline: number;
  costActual: number;
  saved: number;
  threat?: string;
  leakedThreat?: boolean; // attack that passed because a guard was off / too lax
};
