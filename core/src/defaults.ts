import { NODE_SPECS } from './catalog';
import type { NodeKind, PipelineDoc } from './types';

export const LANE = { x: 170, width: 1052, height: 156, y: { security: 0, efficiency: 204, search: 408 } };
const row = (p: keyof typeof LANE.y) => LANE.y[p] + 62;
const COL = [210, 460, 710, 960];

const LAYOUT: [NodeKind, number, number][] = [
  ['ingress', -90, row('security')],
  ['injection', COL[0], row('security')],
  ['jailbreak', COL[1], row('security')],
  ['pii', COL[2], row('security')],
  ['block', COL[3], row('security')],
  ['honeypot', 1290, row('security')],
  ['exactCache', COL[0], row('efficiency')],
  ['semanticCache', COL[1], row('efficiency')],
  ['compressor', COL[2], row('efficiency')],
  ['searchIntent', COL[0], row('search')],
  ['serpCache', COL[1], row('search')],
  ['queryOptimizer', COL[2], row('search')],
  ['serpApi', COL[3], row('search')],
  ['llm', 1290, row('search')],
  ['response', 1540, (row('efficiency') + row('search')) / 2],
];

const EDGES: [NodeKind, NodeKind, ('out' | 'alt')?][] = [
  ['ingress', 'injection'],
  ['injection', 'jailbreak'],
  ['injection', 'block', 'alt'], // injections get a hard 403
  ['jailbreak', 'pii'],
  ['jailbreak', 'honeypot', 'alt'], // jailbreakers get trapped
  ['pii', 'exactCache'],
  ['exactCache', 'semanticCache'],
  ['exactCache', 'response', 'alt'],
  ['semanticCache', 'compressor'],
  ['semanticCache', 'response', 'alt'],
  ['compressor', 'searchIntent'],
  ['searchIntent', 'serpCache'],
  ['searchIntent', 'llm', 'alt'],
  ['serpCache', 'queryOptimizer'],
  ['serpCache', 'llm', 'alt'],
  ['queryOptimizer', 'serpApi'],
  ['serpApi', 'llm'],
  ['llm', 'response'],
];

export function defaultPipelineDoc(id = 'chat-default'): PipelineDoc {
  return {
    id,
    name: id,
    deployedVersion: 1,
    hasDraft: false,
    updatedAt: new Date().toISOString(),
    nodes: LAYOUT.map(([kind, x, y]) => ({ id: kind, kind, label: NODE_SPECS[kind].label, position: { x, y }, enabled: true, config: { ...NODE_SPECS[kind].defaults } })),
    edges: EDGES.map(([s, t, h = 'out']) => ({ id: `${s}->${t}`, source: s, target: t, sourceHandle: h })),
  };
}

/** Fill in config keys added by newer versions so old saved pipelines keep working. */
export function upgradeDoc(doc: PipelineDoc): PipelineDoc {
  return { ...doc, nodes: doc.nodes.filter((n) => NODE_SPECS[n.kind]).map((n) => ({ ...n, config: { ...NODE_SPECS[n.kind].defaults, ...n.config } })) };
}
