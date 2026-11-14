import { MarkerType } from '@xyflow/react';
import { CATALOG } from './catalog';
import { ACCENT, PILLAR } from './theme';
import type { AppNode, LaneNode, NodeKind, PacketEdge, Pillar, PipelineNode } from '../types';

export const NODE_W = 208;

const LANE_X = 170;
const LANE_W = 1080;
const LANE_H = 196;
const laneY: Record<Exclude<Pillar, 'core'>, number> = { security: 0, efficiency: 236, search: 472 };
const rowY = (p: Exclude<Pillar, 'core'>) => laneY[p] + 52;

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

const COL = [200, 470, 740, 1010];

export const initialNodes: AppNode[] = [
  lane('security'),
  lane('efficiency'),
  lane('search'),
  makeNode('ingress', 'ingress', -110, rowY('security')),
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
  makeNode('llm', 'llm', 1330, rowY('search')),
  makeNode('response', 'response', 1330, rowY('efficiency')),
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
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: '#3A3A44' },
  };
}

export const initialEdges: PacketEdge[] = [
  e('ingress', 'injection'),
  e('injection', 'jailbreak'),
  e('injection', 'block', 'alt', 'threat'),
  e('jailbreak', 'pii'),
  e('jailbreak', 'block', 'alt', 'threat'),
  e('pii', 'exactCache'),
  e('exactCache', 'semanticCache', 'out', 'miss'),
  e('exactCache', 'response', 'alt', 'hit'),
  e('semanticCache', 'compressor', 'out', 'miss'),
  e('semanticCache', 'response', 'alt', 'hit'),
  e('compressor', 'searchIntent'),
  e('searchIntent', 'serpCache', 'out', 'search'),
  e('searchIntent', 'llm', 'alt', 'no search'),
  e('serpCache', 'queryOptimizer', 'out', 'miss'),
  e('serpCache', 'llm', 'alt', 'hit'),
  e('queryOptimizer', 'serpApi'),
  e('serpApi', 'llm'),
  e('llm', 'response'),
];
