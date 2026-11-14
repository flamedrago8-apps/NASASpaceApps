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

const COL = [210, 460, 710, 960];

export const initialNodes: AppNode[] = [
  lane('security'),
  lane('efficiency'),
  lane('search'),
  makeNode('ingress', 'ingress', -90, rowY('security')),
  makeNode('injection', 'injection', COL[0], rowY('security')),
  makeNode('jailbreak', 'jailbreak', COL[1], rowY('security')),
  makeNode('pii', 'pii', COL[2], rowY('security')),
  makeNode('block', 'block', COL[3], rowY('security')),
  makeNode('exactCache', 'exactCache', COL[0], rowY('efficiency')),
  makeNode('semanticCache', 'semanticCache', COL[1], rowY('efficiency')),
  makeNode('compressor', 'compressor', COL[2], rowY('efficiency')),
  makeNode('searchIntent', 'searchIntent', COL[0], rowY('search')),
  makeNode('serpCache', 'serpCache', COL[1], rowY('search')),
  makeNode('queryOptimizer', 'queryOptimizer', COL[2], rowY('search')),
  makeNode('serpApi', 'serpApi', COL[3], rowY('search')),
  makeNode('llm', 'llm', 1290, rowY('search')),
  makeNode('response', 'response', 1540, (rowY('efficiency') + rowY('search')) / 2),
];

export function edgeColor(sourceKind: NodeKind): string {
  return ACCENT[CATALOG[sourceKind].accent].fg;
}

function e(source: NodeKind, target: NodeKind, handle: 'out' | 'alt' = 'out', label?: string): PacketEdge {
  const color = handle === 'alt' && CATALOG[source].pillar === 'security' ? ACCENT.red.fg : edgeColor(source);
  return {
    id: `${source}->${target}`,
    source,
    target,
    sourceHandle: handle,
    targetHandle: 'in',
    type: 'packet',
    data: { color, label },
  };
}

export const initialEdges: PacketEdge[] = [
  e('ingress', 'injection'),
  e('injection', 'jailbreak'),
  e('injection', 'block', 'alt', 'threat'),
  e('jailbreak', 'pii'),
  e('jailbreak', 'block', 'alt', 'threat'),
  e('pii', 'exactCache'),
  e('exactCache', 'semanticCache'),
  e('exactCache', 'response', 'alt', 'hit'),
  e('semanticCache', 'compressor'),
  e('semanticCache', 'response', 'alt', 'hit'),
  e('compressor', 'searchIntent'),
  e('searchIntent', 'serpCache'),
  e('searchIntent', 'llm', 'alt', 'no search'),
  e('serpCache', 'queryOptimizer'),
  e('serpCache', 'llm', 'alt', 'hit'),
  e('queryOptimizer', 'serpApi'),
  e('serpApi', 'llm'),
  e('llm', 'response'),
];
