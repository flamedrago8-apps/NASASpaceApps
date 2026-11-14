import { ReactFlowProvider, useEdgesState, useNodesState, useReactFlow } from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CanvasToolbar, NodeDrawer, StatsPill } from './components/canvas/CanvasChrome';
import { FlowCanvas } from './components/canvas/FlowCanvas';
import { NodeInspector } from './components/inspector/NodeInspector';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { LiveTrace } from './components/trace/LiveTrace';
import { useTrafficSimulator } from './hooks/useTrafficSimulator';
import { CATALOG } from './lib/catalog';
import { LiveContext, type Highlight } from './lib/live';
import { initialEdges, initialNodes, makeNode, NODE_H, NODE_W } from './lib/pipeline';
import { computeEdgeShare, computeNodeStats } from './lib/stats';
import type { AppNode, ConfigValue, NodeKind, PacketEdge, PipelineNode, Trace } from './types';

export default function App() {
  return (
    <ReactFlowProvider>
      <Dashboard />
    </ReactFlowProvider>
  );
}

const LOGS_COLLAPSED = 44;

function Dashboard() {
  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<PacketEdge>(initialEdges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [running, setRunning] = useState(true);
  const [rate, setRate] = useState(1);
  const [hovered, setHovered] = useState<Trace | null>(null);
  const [pinned, setPinned] = useState<Trace | null>(null);
  const [dirty, setDirty] = useState(0);
  const [version, setVersion] = useState(14);
  const [toast, setToast] = useState<string | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logsH, setLogsH] = useState(() => Math.round(Math.min(420, Math.max(240, window.innerHeight * 0.38))));
  const { screenToFlowPosition } = useReactFlow();

  const { traces, totals, emit } = useTrafficSimulator(nodes, running, rate);
  const nodeStats = useMemo(() => computeNodeStats(traces), [traces]);
  const edgeShare = useMemo(() => computeEdgeShare(traces), [traces]);

  const focus = hovered ?? pinned;
  const highlight: Highlight = useMemo(() => (focus ? { nodes: new Set(focus.path), edges: new Set(focus.edges) } : null), [focus]);
  const live = useMemo(() => ({ nodeStats, edgeShare, lastTrace: traces[0], highlight, dimPillar: null }), [nodeStats, edgeShare, traces, highlight]);

  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const selected = nodes.find((n): n is PipelineNode => n.id === selectedId && n.type === 'pipeline');

  useEffect(() => {
    setNodes((ns) => ns.map((n) => (n.selected === (n.id === selectedId) ? n : { ...n, selected: n.id === selectedId })));
  }, [selectedId, setNodes]);

  const patchNode = useCallback(
    (id: string, patch: { enabled?: boolean; config?: Record<string, ConfigValue> }) => {
      setNodes((ns) => ns.map((n) => (n.id === id && n.type === 'pipeline' ? { ...n, data: { ...n.data, ...patch } } : n)));
      setDirty((d) => d + 1);
    },
    [setNodes],
  );

  const addNode = useCallback(
    (kind: NodeKind, x?: number, y?: number) => {
      if (x === undefined || y === undefined) {
        const el = document.getElementById('canvas-area')?.getBoundingClientRect();
        const p = screenToFlowPosition({ x: (el?.left ?? 0) + (el?.width ?? 800) / 2 - NODE_W / 2, y: (el?.top ?? 0) + (el?.height ?? 600) / 2 - NODE_H / 2 });
        x = p.x;
        y = p.y;
      }
      const id = `${kind}-${Date.now().toString(36).slice(-4)}`;
      setNodes((ns) => [...ns, makeNode(kind, id, x!, y!)]);
      setSelectedId(id);
      setDirty((d) => d + 1);
      showToast(`Added ${CATALOG[kind].label}. Connect it to route traffic through it.`);
    },
    [screenToFlowPosition, setNodes, showToast],
  );

  const sendTest = (forceAttack: boolean) => {
    const t = emit({ forceAttack });
    setPinned(t);
    setTimeout(() => setPinned((p) => (p?.id === t.id ? null : p)), 2500);
    showToast(
      forceAttack
        ? `Attack ${t.status === 'blocked' ? 'blocked' : t.status === 'flagged' ? 'flagged' : 'was not detected'}`
        : `${t.status === 'cache_hit' ? 'Cache hit' : 'Completed'} in ${Math.round(t.latency)}ms${t.saved > 0 ? ` · saved $${t.saved.toFixed(4)}` : ''}`,
    );
  };

  const startResize = (e: React.PointerEvent) => {
    if (!logsOpen) return;
    const startY = e.clientY;
    const startH = logsH;
    const move = (ev: PointerEvent) => setLogsH(Math.min(window.innerHeight - 220, Math.max(160, startH - (ev.clientY - startY))));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <LiveContext.Provider value={live}>
      <div className="flex h-screen w-full overflow-hidden bg-canvas text-fg">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            dirty={dirty}
            version={version}
            running={running}
            onToggleRunning={() => setRunning((r) => !r)}
            onDeploy={() => {
              if (!dirty) return;
              setVersion((v) => v + 1);
              setDirty(0);
              showToast(`Deployed v${version + 1}`);
            }}
          />

          <div id="canvas-area" className="relative min-h-0 flex-1">
            <FlowCanvas nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} setEdges={setEdges} onSelect={setSelectedId} onAddNode={addNode} />
            <StatsPill traces={traces} totals={totals} />
            {!selected && <NodeDrawer onAdd={(k) => addNode(k)} />}
            <CanvasToolbar onTest={() => sendTest(false)} onAttack={() => sendTest(true)} />

            {selected && (
              <aside className="absolute bottom-3 right-3 top-3 z-30 w-[360px] max-w-[calc(100%-1.5rem)] animate-toast-in overflow-hidden rounded-2xl border border-[#26262c] bg-[#111114]/95 shadow-2xl shadow-black/60 backdrop-blur">
                <NodeInspector
                  key={selected.id}
                  node={selected}
                  stats={nodeStats[selected.id]}
                  traces={traces}
                  onChange={(p) => patchNode(selected.id, p)}
                  onClose={() => setSelectedId(null)}
                  onDelete={() => {
                    setNodes((ns) => ns.filter((n) => n.id !== selected.id));
                    setEdges((es) => es.filter((e) => e.source !== selected.id && e.target !== selected.id));
                    setSelectedId(null);
                    setDirty((d) => d + 1);
                  }}
                  onDuplicate={() => {
                    const id = `${selected.data.kind}-${Date.now().toString(36).slice(-4)}`;
                    const copy = makeNode(selected.data.kind, id, selected.position.x + 30, selected.position.y + 90);
                    copy.data = { ...copy.data, config: { ...selected.data.config } };
                    setNodes((ns) => [...ns, copy]);
                    setSelectedId(id);
                  }}
                />
              </aside>
            )}
          </div>

          <div className="relative shrink-0 border-t border-[#1c1c21]" style={{ height: logsOpen ? logsH : LOGS_COLLAPSED }}>
            {logsOpen && <div onPointerDown={startResize} className="absolute inset-x-0 -top-1 z-10 h-2 cursor-row-resize" role="separator" aria-orientation="horizontal" aria-label="Resize logs" />}
            <LiveTrace traces={traces} expanded={logsOpen} onToggleExpanded={() => setLogsOpen((o) => !o)} rate={rate} onRate={setRate} onHover={setHovered} onSelectNode={setSelectedId} />
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-16 left-1/2 z-50 -translate-x-1/2 animate-toast-in rounded-xl border border-[#2a2a31] bg-[#18181c] px-4 py-2 text-[12.5px] text-fg shadow-2xl shadow-black/60">{toast}</div>
      )}
    </LiveContext.Provider>
  );
}
