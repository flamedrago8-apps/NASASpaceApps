import type { PipelineDoc, PipelineEdgeDTO, PipelineNodeDTO } from '../api/types';
import { CATALOG } from './catalog';
import { ACCENT, PILLAR } from './theme';
import type { AppNode, LaneNode, NodeKind, PacketEdge, Pillar, PipelineNode } from '../types';

export const NODE_W = 196;
export const NODE_H = 54;

const LANE_X = 170;
const LANE_W = 1052;
const LANE_H = 156;
const laneY: Record<Exclude<Pillar, 'core'>, number> = { security: 0, efficiency: 204, search: 408 };
const rowY = (p: Exclude<Pillar, 'core'>) => laneY[p] + 62;

function lane(pillar: Exclude<Pillar, 'core'>): LaneNode {
  return {
    id: `lane-${pillar}`,
    type: 'lane',
    position: { x: LANE_X, y: laneY[pillar] },
    data: { pillar, title: PILLAR[pillar].label, subtitle: PILLAR[pillar].blurb },
    style: { width: LANE_W, height: LANE_H },
    draggable: false,
    selectable: false,
    deletable: false,
    focusable: false,
    zIndex: -1,
  };
}

const LANES = [lane('security'), lane('efficiency'), lane('search')];

export function makeNode(kind: NodeKind, id: string, x: number, y: number): PipelineNode {
  const c = CATALOG[kind];
  return {
    id,
    type: 'pipeline',
    position: { x, y },
    data: { kind, label: c.label, enabled: true, config: { ...c.defaults } },
    deletable: kind !== 'ingress' && kind !== 'response',
  };
}

export function edgeColor(sourceKind: NodeKind, handle: 'out' | 'alt' = 'out'): string {
  return handle === 'alt' && CATALOG[sourceKind].pillar === 'security' ? ACCENT.red.fg : ACCENT[CATALOG[sourceKind].accent].fg;
}

/** Visual edge for a source node/handle. Branch (alt) edges carry their output's label. */
export function makeEdge(id: string, source: string, sourceKind: NodeKind, target: string, handle: 'out' | 'alt'): PacketEdge {
  return {
    id,
    source,
    target,
    sourceHandle: handle,
    targetHandle: 'in',
    type: 'packet',
    data: { color: edgeColor(sourceKind, handle), label: handle === 'alt' ? CATALOG[sourceKind].outputs.alt : undefined },
  };
}

// ---- Default pipeline -----------------------------------------------------------------------

const COL = [210, 460, 710, 960];
const DEFAULT_LAYOUT: [NodeKind, number, number][] = [
  ['ingress', -90, rowY('security')],
  ['injection', COL[0], rowY('security')],
  ['jailbreak', COL[1], rowY('security')],
  ['pii', COL[2], rowY('security')],
  ['block', COL[3], rowY('security')],
  ['exactCache', COL[0], rowY('efficiency')],
  ['semanticCache', COL[1], rowY('efficiency')],
  ['compressor', COL[2], rowY('efficiency')],
  ['searchIntent', COL[0], rowY('search')],
  ['serpCache', COL[1], rowY('search')],
  ['queryOptimizer', COL[2], rowY('search')],
  ['serpApi', COL[3], rowY('search')],
  ['llm', 1290, rowY('search')],
  ['response', 1540, (rowY('efficiency') + rowY('search')) / 2],
];

const DEFAULT_EDGES: [NodeKind, NodeKind, ('out' | 'alt')?][] = [
  ['ingress', 'injection'],
  ['injection', 'jailbreak'],
  ['injection', 'block', 'alt'],
  ['jailbreak', 'pii'],
  ['jailbreak', 'block', 'alt'],
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

export function defaultPipelineDoc(id: string): PipelineDoc {
  return {
    id,
    name: id,
    deployedVersion: 14,
    hasDraft: false,
    updatedAt: new Date().toISOString(),
    nodes: DEFAULT_LAYOUT.map(([kind, x, y]) => ({ id: kind, kind, label: CATALOG[kind].label, position: { x, y }, enabled: true, config: { ...CATALOG[kind].defaults } })),
    edges: DEFAULT_EDGES.map(([s, t, h = 'out']) => ({ id: `${s}->${t}`, source: s, target: t, sourceHandle: h })),
  };
}

// ---- Doc <-> React Flow ---------------------------------------------------------------------

export function docToFlow(doc: PipelineDoc): { nodes: AppNode[]; edges: PacketEdge[] } {
  const kindOf = new Map(doc.nodes.map((n) => [n.id, n.kind]));
  const nodes: AppNode[] = [
    ...LANES,
    ...doc.nodes.map((n) => {
      const node = makeNode(n.kind, n.id, n.position.x, n.position.y);
      node.data = { kind: n.kind, label: n.label, enabled: n.enabled, config: { ...CATALOG[n.kind].defaults, ...n.config } };
      return node;
    }),
  ];
  const edges = doc.edges.filter((e) => kindOf.has(e.source) && kindOf.has(e.target)).map((e) => makeEdge(e.id, e.source, kindOf.get(e.source)!, e.target, e.sourceHandle));
  return { nodes, edges };
}

export function flowToDoc(nodes: AppNode[], edges: PacketEdge[], base: PipelineDoc): PipelineDoc {
  const ns: PipelineNodeDTO[] = [];
  for (const n of nodes) {
    if (n.type !== 'pipeline') continue;
    ns.push({ id: n.id, kind: n.data.kind, label: n.data.label, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) }, enabled: n.data.enabled, config: n.data.config });
  }
  const es: PipelineEdgeDTO[] = edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle === 'alt' ? 'alt' : 'out' }));
  return { ...base, nodes: ns, edges: es };
}

/** Stable string of the parts of a doc that matter for saving (ignores timestamps/flags). */
export function docSignature(doc: Pick<PipelineDoc, 'nodes' | 'edges'>): string {
  return JSON.stringify([doc.nodes, doc.edges]);
}
