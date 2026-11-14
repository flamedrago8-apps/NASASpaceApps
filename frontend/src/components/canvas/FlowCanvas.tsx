import {
  Background,
  BackgroundVariant,
  ReactFlow,
  addEdge,
  useReactFlow,
  type Connection,
  type OnEdgesChange,
  type OnNodesChange,
} from '@xyflow/react';
import { useCallback, type Dispatch, type DragEvent, type SetStateAction } from 'react';
import { CATALOG } from '../../lib/catalog';
import { makeEdge, NODE_H, NODE_W } from '../../lib/pipeline';
import type { AppNode, NodeKind, PacketEdge } from '../../types';
import { LaneNodeView } from './LaneNodeView';
import { PacketEdgeView } from './PacketEdgeView';
import { PipelineNodeView } from './PipelineNodeView';

const nodeTypes = { pipeline: PipelineNodeView, lane: LaneNodeView };
const edgeTypes = { packet: PacketEdgeView };

export const DND_MIME = 'application/x-conduit-node';

type Props = {
  nodes: AppNode[];
  edges: PacketEdge[];
  onNodesChange: OnNodesChange<AppNode>;
  onEdgesChange: OnEdgesChange<PacketEdge>;
  setEdges: Dispatch<SetStateAction<PacketEdge[]>>;
  onSelect: (id: string | null) => void;
  onAddNode: (kind: NodeKind, x: number, y: number) => void;
};

export function FlowCanvas({ nodes, edges, onNodesChange, onEdgesChange, setEdges, onSelect, onAddNode }: Props) {
  const { screenToFlowPosition } = useReactFlow();

  const onConnect = useCallback(
    (c: Connection) => {
      const src = nodes.find((n) => n.id === c.source);
      const kind = src?.type === 'pipeline' ? src.data.kind : 'llm';
      setEdges((eds) => addEdge<PacketEdge>({ ...makeEdge(`${c.source}->${c.target}`, c.source, kind, c.target, c.sourceHandle === 'alt' ? 'alt' : 'out'), targetHandle: c.targetHandle }, eds));
    },
    [nodes, setEdges],
  );

  const onDrop = useCallback(
    (ev: DragEvent) => {
      ev.preventDefault();
      const kind = ev.dataTransfer.getData(DND_MIME) as NodeKind;
      if (!kind || !CATALOG[kind]) return;
      const pos = screenToFlowPosition({ x: ev.clientX - NODE_W / 2, y: ev.clientY - NODE_H / 2 });
      onAddNode(kind, pos.x, pos.y);
    },
    [screenToFlowPosition, onAddNode],
  );

  return (
    <div className="absolute inset-0" onDragOver={(e) => (e.preventDefault(), (e.dataTransfer.dropEffect = 'move'))} onDrop={onDrop}>
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
        fitViewOptions={{ padding: { top: '72px', right: '40px', bottom: '84px', left: '40px' } }}
        minZoom={0.25}
        maxZoom={1.75}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={['Backspace', 'Delete']}
        defaultEdgeOptions={{ type: 'packet' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.1} color="#24242a" />
      </ReactFlow>
    </div>
  );
}
