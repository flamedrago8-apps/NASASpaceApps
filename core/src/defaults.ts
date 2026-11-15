import { NODE_SPECS } from './catalog';
import type { NodeKind, PipelineDoc, PipelineEdgeDTO, PipelineNodeDTO } from './types';

/**
 * The pipeline is a single ordered list of tools between Ingestion and the LLM.
 * Order lives in each node's `position.x`; `wireLinear` turns the list into the
 * graph the engine walks (including the branches: attack → Block/Honeypot,
 * cache hit → Return, no search needed → skip ahead to the LLM).
 */

/** Tools a user can switch on/off and reorder, in their recommended default order. */
export const TOOL_KINDS: NodeKind[] = ['injection', 'jailbreak', 'pii', 'exactCache', 'semanticCache', 'compressor', 'searchIntent', 'serpCache', 'queryOptimizer', 'serpApi'];
const FIXED: NodeKind[] = ['ingress', 'llm', 'response', 'block', 'honeypot'];

const node = (kind: NodeKind, x: number, enabled = true): PipelineNodeDTO => ({ id: kind, kind, label: NODE_SPECS[kind].label, position: { x, y: 0 }, enabled, config: { ...NODE_SPECS[kind].defaults } });

/** Enabled tools in flow order. */
export function toolOrder(doc: Pick<PipelineDoc, 'nodes'>): PipelineNodeDTO[] {
  return doc.nodes.filter((n) => TOOL_KINDS.includes(n.kind) && n.enabled).sort((a, b) => a.position.x - b.position.x);
}

export function wireLinear(doc: PipelineDoc): PipelineDoc {
  const nodes = [...doc.nodes];
  for (const k of FIXED) if (!nodes.some((n) => n.kind === k)) nodes.push(node(k, k === 'ingress' ? -1 : 10_000));
  const byKind = (k: NodeKind) => nodes.find((n) => n.kind === k)!;
  const chain = [byKind('ingress'), ...toolOrder({ nodes }), byKind('llm'), byKind('response')];
  const edges: PipelineEdgeDTO[] = [];
  const add = (s: PipelineNodeDTO, t: PipelineNodeDTO, h: 'out' | 'alt') => edges.push({ id: `${s.id}->${t.id}`, source: s.id, target: t.id, sourceHandle: h });
  chain.forEach((n, i) => {
    if (i < chain.length - 1) add(n, chain[i + 1], 'out');
    const cfg = { ...NODE_SPECS[n.kind].defaults, ...n.config };
    if (n.kind === 'injection' || n.kind === 'jailbreak') add(n, byKind(cfg.action === 'honeypot' ? 'honeypot' : 'block'), 'alt');
    if (n.kind === 'exactCache' || n.kind === 'semanticCache') add(n, byKind('response'), 'alt');
    if (n.kind === 'searchIntent' || n.kind === 'serpCache') {
      const after = chain.slice(i + 1).find((m) => NODE_SPECS[m.kind].pillar !== 'search') ?? byKind('llm');
      add(n, after, 'alt');
    }
  });
  return { ...doc, nodes, edges };
}

export function defaultPipelineDoc(id = 'chat-default'): PipelineDoc {
  return wireLinear({
    id,
    name: id,
    deployedVersion: 1,
    hasDraft: false,
    updatedAt: new Date().toISOString(),
    nodes: [node('ingress', -1), ...TOOL_KINDS.map((k, i) => node(k, i * 100)), node('llm', 10_000), node('response', 10_100), node('block', 20_000), node('honeypot', 20_100)],
    edges: [],
  });
}

/**
 * Fill in config keys added by newer versions, and migrate pipelines saved by the old
 * 2D canvas (tools spread over rows) to the linear order.
 */
export function upgradeDoc(doc: PipelineDoc): PipelineDoc {
  let nodes = doc.nodes.filter((n) => NODE_SPECS[n.kind]).map((n) => ({ ...n, config: { ...NODE_SPECS[n.kind].defaults, ...n.config } }));
  const legacy = nodes.some((n) => TOOL_KINDS.includes(n.kind) && n.position.y !== 0);
  if (legacy) nodes = nodes.map((n) => (TOOL_KINDS.includes(n.kind) ? { ...n, position: { x: TOOL_KINDS.indexOf(n.kind) * 100, y: 0 } } : n));
  return legacy ? wireLinear({ ...doc, nodes }) : { ...doc, nodes };
}
