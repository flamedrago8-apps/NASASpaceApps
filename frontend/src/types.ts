import type { Edge, Node } from '@xyflow/react';
import type { NodeConfig, NodeKind, Pillar } from '@conduit/core';

export type * from '@conduit/core';
export type { Accent } from '@conduit/core';

export type PipelineNodeData = { kind: NodeKind; label: string; enabled: boolean; config: NodeConfig };
export type PipelineNode = Node<PipelineNodeData, 'pipeline'>;

export type LaneNodeData = { pillar: Pillar; title: string; subtitle: string };
export type LaneNode = Node<LaneNodeData, 'lane'>;

export type AppNode = PipelineNode | LaneNode;

export type PacketEdgeData = { color: string; label?: string };
export type PacketEdge = Edge<PacketEdgeData, 'packet'>;
