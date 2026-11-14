import { ReactFlowProvider, useEdgesState, useNodesState } from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlowCanvas } from './components/canvas/FlowCanvas';
import { NodeInspector } from './components/inspector/NodeInspector';
import { PipelineOverview } from './components/inspector/PipelineOverview';
import { Sidebar } from './components/layout/Sidebar';
import { StatsStrip } from './components/layout/StatsStrip';
import { TopBar } from './components/layout/TopBar';
import { LiveTrace } from './components/trace/LiveTrace';
import { useTrafficSimulator } from './hooks/useTrafficSimulator';
import { LiveContext, type Highlight } from './lib/live';
import { initialEdges, initialNodes, makeNode } from './lib/pipeline';
import { computeEdgeShare, computeNodeStats } from './lib/stats';
import type { AppNode, ConfigValue, PacketEdge, PipelineNode, Trace } from './types';

export default function App() {
  return (
    <ReactFlowProvider>
      <Dashboard />
    </ReactFlowProvider>
  );
}

function Dashboard() {
  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<PacketEdge>(initialEdges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [running, setRunning] = useState(true);
  const [rate, setRate] = useState(1);
  const [hovered, setHovered] = useState<Trace | null>(null);
  const [dimPillar, setDimPillar] = useState<string | null>(null);
  const [dirty, setDirty] = useState(0);
  const [version, setVersion] = useState(14);
  const [toast, setToast] = useState<string | null>(null);
  const [traceH, setTraceH] = useState(() => Math.round(Math.min(380, Math.max(220, window.innerHeight * 0.32))));

  const { traces, totals, emit } = useTrafficSimulator(nodes, running, rate);
  const nodeStats = useMemo(() => computeNodeStats(traces), [traces]);
  const edgeShare = useMemo(() => computeEdgeShare(traces), [traces]);

  const [pinned, setPinned] = useState<Trace | null>(null);
  const focus = hovered ?? pinned;
  const highlight: Highlight = useMemo(() => (focus ? { nodes: new Set(focus.path), edges: new Set(focus.edges) } : null), [focus]);

  const live = useMemo(() => ({ nodeStats, edgeShare, lastTrace: traces[0], highlight, dimPillar }), [nodeStats, edgeShare, traces, highlight, dimPillar]);

  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const selected = nodes.find((n): n is PipelineNode => n.id === selectedId && n.type === 'pipeline');

  // Keep React Flow's own selection state in sync with ours (inspector / trace clicks select too).
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

  const sendTest = (forceAttack: boolean) => {
    const t = emit({ forceAttack });
    setPinned(t);
    setTimeout(() => setPinned((p) => (p?.id === t.id ? null : p)), 2500);
    showToast(forceAttack ? `Attack ${t.id} → ${t.status === 'blocked' ? 'blocked ✓' : t.status === 'flagged' ? 'flagged' : 'NOT detected'}` : `Test ${t.id} → ${t.status.replace('_', ' ')} in ${Math.round(t.latency)}ms`);
  };

  const startResize = (e: React.PointerEvent) => {
    const startY = e.clientY;
    const startH = traceH;
    const move = (ev: PointerEvent) => setTraceH(Math.min(window.innerHeight - 260, Math.max(160, startH - (ev.clientY - startY))));
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
            onTest={() => sendTest(false)}
            onAttack={() => sendTest(true)}
            onDeploy={() => {
              if (!dirty) return showToast('No changes to deploy');
              setVersion((v) => v + 1);
              setDirty(0);
              showToast(`Deployed chat-default v${version + 1} to production`);
            }}
          />
          <StatsStrip traces={traces} totals={totals} />

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1">
              <div className="relative min-w-0 flex-1">
                <FlowCanvas
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  setNodes={setNodes}
                  setEdges={setEdges}
                  onSelect={setSelectedId}
                  dimPillar={dimPillar}
                  onDimPillar={setDimPillar}
                  onToast={showToast}
                />
              </div>
              <aside className="hidden w-[320px] shrink-0 border-l border-line bg-surface lg:block">
                {selected ? (
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
                      const copy = makeNode(selected.data.kind, id, selected.position.x + 30, selected.position.y + 140);
                      copy.data = { ...copy.data, config: { ...selected.data.config } };
                      setNodes((ns) => [...ns, copy]);
                      setSelectedId(id);
                    }}
                  />
                ) : (
                  <PipelineOverview nodes={nodes} nodeStats={nodeStats} traces={traces} onSelect={setSelectedId} onToggle={(id, enabled) => patchNode(id, { enabled })} />
                )}
              </aside>
            </div>

            <div onPointerDown={startResize} className="group relative h-1.5 shrink-0 cursor-row-resize border-t border-line bg-canvas" role="separator" aria-orientation="horizontal" aria-label="Resize trace panel">
              <span className="absolute left-1/2 top-1/2 h-0.5 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-line-strong group-hover:bg-fg-subtle" />
            </div>

            <div style={{ height: traceH }} className="shrink-0">
              <LiveTrace
                traces={traces}
                running={running}
                onToggleRunning={() => setRunning((r) => !r)}
                rate={rate}
                onRate={setRate}
                onHover={setHovered}
                onSelectNode={setSelectedId}
              />
            </div>
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 animate-toast-in rounded-lg border border-line-strong bg-surface-3 px-3.5 py-2 text-[12px] text-fg shadow-2xl shadow-black/60">{toast}</div>
      )}
    </LiveContext.Provider>
  );
}
