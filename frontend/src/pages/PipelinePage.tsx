import { useEdgesState, useNodesState, useReactFlow } from '@xyflow/react';
import clsx from 'clsx';
import { History, LoaderCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, PIPELINE_ID, type Deployment, type PipelineDoc } from '../api';
import { CanvasToolbar, NodeDrawer, StatsPill } from '../components/canvas/CanvasChrome';
import { ProfileSlider } from '../components/ProfileSlider';
import { FlowCanvas } from '../components/canvas/FlowCanvas';
import { NodeInspector } from '../components/inspector/NodeInspector';
import { LiveTrace } from '../components/trace/LiveTrace';
import { Button, ErrorState, Modal, PageHeader, Spinner, TextInput } from '../components/ui/kit';
import { CATALOG } from '../lib/catalog';
import { LiveContext, type Highlight } from '../lib/live';
import { docSignature, docToFlow, flowToDoc, makeNode, NODE_H, NODE_W } from '../lib/pipeline';
import { computeEdgeShare, computeNodeStats } from '../lib/stats';
import { navigate, type Route } from '../state/router';
import { useToast } from '../state/toast';
import { useTraces } from '../state/traces';
import { useAsync } from '../state/useAsync';
import type { AppNode, ConfigValue, NodeKind, PacketEdge, PipelineNode, Trace } from '../types';

const LOGS_COLLAPSED = 44;
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function PipelinePage({ route }: { route: Route }) {
  const doc = useAsync(() => api.getPipeline(PIPELINE_ID), []);
  if (doc.error && !doc.data)
    return (
      <div className="flex h-full flex-col">
        <PageHeader title={PIPELINE_ID} />
        <ErrorState error={doc.error} onRetry={doc.reload} />
      </div>
    );
  if (!doc.data)
    return (
      <div className="flex h-full flex-col">
        <PageHeader title={PIPELINE_ID} />
        <Spinner label="Loading pipeline" />
      </div>
    );
  return <Editor key={doc.data.updatedAt + doc.data.deployedVersion} initial={doc.data} route={route} onReload={doc.reload} />;
}

function Editor({ initial, route, onReload }: { initial: PipelineDoc; route: Route; onReload: () => void }) {
  const flow = useMemo(() => docToFlow(initial), [initial]);
  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>(flow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<PacketEdge>(flow.edges);
  const [meta, setMeta] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(route.query.get('node'));
  const [hovered, setHovered] = useState<Trace | null>(null);
  const [pinned, setPinned] = useState<Trace | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logsH, setLogsH] = useState(() => Math.round(Math.min(420, Math.max(240, window.innerHeight * 0.38))));
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [deployOpen, setDeployOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { screenToFlowPosition } = useReactFlow();
  const toast = useToast();
  const { traces, live, setLive, add } = useTraces();
  const summary = useAsync(() => api.getSummary('24h'), [], 15_000);

  const nodeStats = useMemo(() => computeNodeStats(traces), [traces]);
  const edgeShare = useMemo(() => computeEdgeShare(traces), [traces]);
  const focus = hovered ?? pinned;
  const highlight: Highlight = useMemo(() => (focus ? { nodes: new Set(focus.path), edges: new Set(focus.edges) } : null), [focus]);
  const liveCtx = useMemo(() => ({ nodeStats, edgeShare, lastTrace: traces[0], highlight, dimPillar: null }), [nodeStats, edgeShare, traces, highlight]);

  const selected = nodes.find((n): n is PipelineNode => n.id === selectedId && n.type === 'pipeline');

  // Sync selection into React Flow, and deep-link (?node=) when it changes.
  useEffect(() => {
    setNodes((ns) => ns.map((n) => (n.selected === (n.id === selectedId) ? n : { ...n, selected: n.id === selectedId })));
  }, [selectedId, setNodes]);
  useEffect(() => {
    const id = route.query.get('node');
    if (id) setSelectedId(id);
  }, [route]);

  // ---- Autosave draft (debounced), only when the graph actually changed ----
  const lastSig = useRef(docSignature(initial));
  useEffect(() => {
    const next = flowToDoc(nodes, edges, meta);
    const sig = docSignature(next);
    if (sig === lastSig.current) return;
    const t = setTimeout(async () => {
      setSaveState('saving');
      try {
        const saved = await api.saveDraft(next);
        lastSig.current = sig;
        setMeta((m) => ({ ...m, hasDraft: saved.hasDraft, updatedAt: saved.updatedAt }));
        setSaveState('saved');
      } catch (e) {
        setSaveState('error');
        toast(e instanceof Error ? `Couldn’t save draft: ${e.message}` : 'Couldn’t save draft', 'error');
      }
    }, 600);
    return () => clearTimeout(t);
  }, [nodes, edges, meta, toast]);

  const patchNode = useCallback(
    (id: string, patch: { enabled?: boolean; config?: Record<string, ConfigValue> }) => {
      setNodes((ns) => ns.map((n) => (n.id === id && n.type === 'pipeline' ? { ...n, data: { ...n.data, ...patch } } : n)));
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
      toast(`Added ${CATALOG[kind].label}. Connect it to route traffic through it.`);
    },
    [screenToFlowPosition, setNodes, toast],
  );

  const sendTest = async (attack: boolean) => {
    try {
      const t = await api.sendTestRequest({ pipelineId: PIPELINE_ID, attack });
      add(t);
      setPinned(t);
      setTimeout(() => setPinned((p) => (p?.id === t.id ? null : p)), 2500);
      if (attack) toast(t.status === 'blocked' ? 'Attack blocked' : t.status === 'flagged' ? 'Attack flagged' : 'Attack was not detected', t.status === 'blocked' ? 'ok' : 'error');
      else toast(`${t.status === 'cache_hit' ? 'Cache hit' : 'Completed'} in ${Math.round(t.latency)}ms${t.saved > 0 ? ` · saved $${t.saved.toFixed(4)}` : ''}`, 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Test request failed', 'error');
    }
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

  // Esc closes the inspector.
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === 'Escape' && !deployOpen && !historyOpen && setSelectedId(null);
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [deployOpen, historyOpen]);

  return (
    <LiveContext.Provider value={liveCtx}>
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader
          title={meta.name}
          subtitle={<span className="rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[11px]">v{meta.deployedVersion}</span>}
          actions={
            <>
              <span className="hidden lg:block">
                <ProfileSlider compact />
              </span>
              <SaveIndicator state={saveState} hasDraft={meta.hasDraft} />
              <button onClick={() => setLive(!live)} className="flex items-center gap-2 text-[12px] text-fg-muted hover:text-fg" aria-pressed={live}>
                <span className={clsx('relative h-[18px] w-8 rounded-full transition-colors', live ? 'bg-efficiency' : 'bg-[#2a2a32]')}>
                  <span className={clsx('absolute top-[2px] h-3.5 w-3.5 rounded-full bg-canvas transition-all', live ? 'left-[16px]' : 'left-[2px]')} />
                </span>
                <span className="hidden sm:inline">{live ? 'Live' : 'Paused'}</span>
              </button>
              <Button size="sm" variant="ghost" onClick={() => setHistoryOpen(true)} aria-label="Version history">
                <History size={13} /> <span className="hidden sm:inline">History</span>
              </Button>
              <Button size="sm" variant={meta.hasDraft ? 'primary' : 'secondary'} disabled={!meta.hasDraft || saveState === 'saving'} onClick={() => setDeployOpen(true)}>
                {meta.hasDraft ? 'Deploy' : 'Deployed'}
              </Button>
            </>
          }
        />

        <div id="canvas-area" className="relative min-h-0 flex-1">
          <FlowCanvas nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} setEdges={setEdges} onSelect={setSelectedId} onAddNode={addNode} />
          <StatsPill summary={summary.data} traces={traces} />
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
          <LiveTrace traces={traces} expanded={logsOpen} onToggleExpanded={() => setLogsOpen((o) => !o)} onHover={setHovered} onSelectNode={setSelectedId} toolbarExtra={<Button size="sm" variant="ghost" onClick={() => navigate('/traces')}>Open traces</Button>} />
        </div>
      </div>

      <DeployModal
        open={deployOpen}
        nextVersion={meta.deployedVersion + 1}
        onClose={() => setDeployOpen(false)}
        onDeploy={async (note) => {
          try {
            const d = await api.deploy(PIPELINE_ID, note);
            setMeta((m) => ({ ...m, deployedVersion: d.version, hasDraft: false }));
            setDeployOpen(false);
            toast(`Deployed v${d.version} to production`, 'ok');
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Deploy failed', 'error');
          }
        }}
      />
      <HistoryModal
        open={historyOpen}
        current={meta.deployedVersion}
        onClose={() => setHistoryOpen(false)}
        onRestore={async (v) => {
          try {
            await api.restoreVersion(PIPELINE_ID, v);
            setHistoryOpen(false);
            toast(`Restored v${v} as a draft. Deploy to make it live.`, 'ok');
            onReload();
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Restore failed', 'error');
          }
        }}
      />
    </LiveContext.Provider>
  );
}

function SaveIndicator({ state, hasDraft }: { state: SaveState; hasDraft: boolean }) {
  const text = state === 'saving' ? 'Saving…' : state === 'error' ? 'Not saved' : hasDraft ? 'Draft saved · not deployed' : 'All changes deployed';
  return (
    <span className={clsx('hidden items-center gap-1.5 text-[12px] md:flex', state === 'error' ? 'text-danger' : 'text-fg-subtle')}>
      {state === 'saving' && <LoaderCircle size={12} className="animate-spin" />}
      {text}
    </span>
  );
}

function DeployModal({ open, nextVersion, onClose, onDeploy }: { open: boolean; nextVersion: number; onClose: () => void; onDeploy: (note: string) => Promise<void> }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    await onDeploy(note.trim());
    setBusy(false);
    setNote('');
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Deploy v${nextVersion} to production`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={go}>
            Deploy
          </Button>
        </>
      }
    >
      <p className="mb-3">Live traffic switches to the current draft immediately. You can roll back from History at any time.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
      >
        <TextInput label="Note (optional)" placeholder="What changed?" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} />
      </form>
    </Modal>
  );
}

function HistoryModal({ open, current, onClose, onRestore }: { open: boolean; current: number; onClose: () => void; onRestore: (v: number) => void }) {
  const [list, setList] = useState<Deployment[] | null>(null);
  const [err, setErr] = useState<Error | null>(null);
  useEffect(() => {
    if (!open) return;
    setList(null);
    setErr(null);
    api.listDeployments(PIPELINE_ID).then(setList, (e) => setErr(e instanceof Error ? e : new Error(String(e))));
  }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="Version history" width={480}>
      {err ? (
        <ErrorState error={err} />
      ) : !list ? (
        <Spinner />
      ) : (
        <ul className="-mx-2 max-h-[50vh] overflow-y-auto">
          {list.map((d) => (
            <li key={d.version} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-white/[0.03]">
              <span className="w-10 text-[12.5px] tabular-nums text-fg">v{d.version}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] text-fg-muted">{d.note || 'No note'}</div>
                <div className="text-[11.5px] text-fg-subtle">
                  {new Date(d.deployedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {d.author}
                </div>
              </div>
              {d.version === current ? (
                <span className="rounded-md bg-efficiency/10 px-2 py-0.5 text-[11px] text-efficiency">Live</span>
              ) : (
                <Button size="sm" onClick={() => onRestore(d.version)}>
                  Restore
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
