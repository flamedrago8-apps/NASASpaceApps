import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  addEdge,
  useReactFlow,
  type Connection,
  type OnEdgesChange,
  type OnNodesChange,
} from '@xyflow/react';
import { useCallback, useRef, type Dispatch, type DragEvent, type SetStateAction } from 'react';
import { CATALOG } from '../../lib/catalog';
import { edgeColor, makeNode, NODE_W } from '../../lib/pipeline';
import type { AppNode, NodeKind, PacketEdge } from '../../types';
import { LaneNodeView } from './LaneNodeView';
import { NodePalette } from './NodePalette';
import { PacketEdgeView } from './PacketEdgeView';
import { PillarLegend } from './PillarLegend';
import { PipelineNodeView } from './PipelineNodeView';

const nodeTypes = { pipeline: PipelineNodeView, lane: LaneNodeView };
const edgeTypes = { packet: PacketEdgeView };

type Props = {
  nodes: AppNode[];
  edges: PacketEdge[];
  onNodesChange: OnNodesChange<AppNode>;
  onEdgesChange: OnEdgesChange<PacketEdge>;
  setNodes: Dispatch<SetStateAction<AppNode[]>>;
  setEdges: Dispatch<SetStateAction<PacketEdge[]>>;
  onSelect: (id: string | null) => void;
  dimPillar: string | null;
  onDimPillar: (p: string | null) => void;
  onToast: (msg: string) => void;
};

export function FlowCanvas({ nodes, edges, onNodesChange, onEdgesChange, setNodes, setEdges, onSelect, dimPillar, onDimPillar, onToast }: Props) {
  const { screenToFlowPosition } = useReactFlow();
  const counter = useRef(1);

  const onConnect = useCallback(
    (c: Connection) => {
      const src = nodes.find((n) => n.id === c.source);
      const kind = src?.type === 'pipeline' ? src.data.kind : 'llm';
      setEdges((eds) =>
        addEdge<PacketEdge>(
          { ...c, id: `${c.source}->${c.target}`, type: 'packet', data: { color: edgeColor(kind) }, markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: '#3A3A44' } },
          eds,
        ),
      );
    },
    [nodes, setEdges],
  );

  const onDrop = useCallback(
    (ev: DragEvent) => {
      ev.preventDefault();
      const kind = ev.dataTransfer.getData('application/x-conduit-node') as NodeKind;
      if (!kind || !CATALOG[kind]) return;
      const pos = screenToFlowPosition({ x: ev.clientX - NODE_W / 2, y: ev.clientY - 30 });
      const id = `${kind}-${++counter.current}`;
      setNodes((ns) => [...ns, makeNode(kind, id, pos.x, pos.y)]);
      onSelect(id);
      onToast(`Added ${CATALOG[kind].label} — wire it up to route traffic through it`);
    },
    [screenToFlowPosition, setNodes, onSelect, onToast],
  );

  return (
    <div className="relative h-full w-full" onDragOver={(e) => (e.preventDefault(), (e.dataTransfer.dropEffect = 'move'))} onDrop={onDrop}>
      <ReactFlow<AppNode, PacketEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, n) => n.type === 'pipeline' && onSelect(n.id)}
        onPaneClick={() => onSelect(null)}
        colorMode="dark"
        fitView
        fitViewOptions={{ padding: { top: '64px', right: '28px', bottom: '28px', left: '28px' } }}
        minZoom={0.25}
        maxZoom={1.75}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={['Backspace', 'Delete']}
        defaultEdgeOptions={{ type: 'packet' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#26262D" />
        <Controls position="bottom-left" showInteractive={false} />
      </ReactFlow>
      <NodePalette />
      <PillarLegend active={dimPillar} onToggle={onDimPillar} />
    </div>
  );
}
