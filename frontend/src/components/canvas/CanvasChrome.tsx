import { useReactFlow } from '@xyflow/react';
import clsx from 'clsx';
import { Bug, Maximize, Minus, Play, Plus, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Summary } from '../../api';
import { CATALOG, PALETTE } from '../../lib/catalog';
import { fmtNum, fmtPct, fmtUsd } from '../../lib/format';
import { ACCENT, PILLAR } from '../../lib/theme';
import type { NodeKind, Trace } from '../../types';
import { DND_MIME } from './FlowCanvas';

const pill = 'rounded-xl border border-[#26262c] bg-[#121215]/90 backdrop-blur';

/** Top-left: four headline numbers, nothing else. */
export function StatsPill({ summary, traces }: { summary: Summary | undefined; traces: Trace[] }) {
  const hit = useMemo(() => traces.filter((t) => t.status === 'cache_hit').length / Math.max(1, traces.length), [traces]);
  const s = summary;
  const items = [
    { k: 'saved · 24h', v: s ? fmtUsd(s.saved) : '—' },
    { k: 'threats blocked', v: s ? fmtNum(s.blocked) : '—' },
    { k: 'cache hit · live', v: traces.length ? fmtPct(hit) : '—' },
    { k: 'searches avoided', v: s ? fmtNum(Math.max(0, s.searchesNaive - s.searchesSent)) : '—' },
  ];
  return (
    <div className={clsx(pill, 'absolute left-4 top-4 z-10 hidden items-center divide-x divide-[#26262c] md:flex')}>
      {items.map((i) => (
        <div key={i.k} className="flex items-baseline gap-1.5 px-3.5 py-2">
          <span className="text-[13px] font-medium tabular-nums text-fg">{i.v}</span>
          <span className="text-[11px] text-fg-subtle">{i.k}</span>
        </div>
      ))}
    </div>
  );
}

/** Bottom-center: zoom + run controls. */
export function CanvasToolbar({ onTest, onAttack }: { onTest: () => void; onAttack: () => void }) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const btn = 'grid h-8 w-8 place-items-center rounded-lg text-fg-muted hover:bg-white/5 hover:text-fg';
  return (
    <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2">
      <div className={clsx(pill, 'flex items-center p-1')}>
        <button className={btn} onClick={() => fitView({ duration: 300, padding: 0.1 })} title="Fit view" aria-label="Fit view">
          <Maximize size={14} />
        </button>
        <button className={btn} onClick={() => zoomIn({ duration: 200 })} title="Zoom in" aria-label="Zoom in">
          <Plus size={15} />
        </button>
        <button className={btn} onClick={() => zoomOut({ duration: 200 })} title="Zoom out" aria-label="Zoom out">
          <Minus size={15} />
        </button>
      </div>
      <button onClick={onTest} className="flex h-10 items-center gap-2 rounded-xl bg-fg px-4 text-[13px] font-medium text-canvas shadow-lg shadow-black/40 hover:bg-white">
        <Play size={14} fill="currentColor" /> Test request
      </button>
      <button onClick={onAttack} className={clsx(pill, 'grid h-10 w-10 place-items-center text-fg-muted hover:text-danger')} title="Simulate an attack" aria-label="Simulate an attack">
        <Bug size={15} />
      </button>
    </div>
  );
}

/** Top-right "+" that opens a searchable node list. Click to add at center, or drag onto the canvas. */
export function NodeDrawer({ onAdd }: { onAdd: (kind: NodeKind) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const groups = PALETTE.map((g) => ({ ...g, kinds: g.kinds.filter((k) => `${CATALOG[k].label} ${CATALOG[k].description}`.toLowerCase().includes(q.toLowerCase())) })).filter((g) => g.kinds.length);

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className={clsx(pill, 'absolute right-4 top-4 z-20 grid h-10 w-10 place-items-center text-fg-muted transition-colors hover:text-fg', open && 'text-fg')}
        aria-label={open ? 'Close node list' : 'Add node'}
        title="Add node"
      >
        {open ? <X size={16} /> : <Plus size={18} />}
      </button>
      {open && (
        <div className={clsx(pill, 'absolute right-4 top-16 z-20 flex max-h-[calc(100%-6rem)] w-72 flex-col overflow-hidden bg-[#121215] shadow-2xl shadow-black/60')}>
          <div className="flex items-center gap-2 border-b border-[#26262c] px-3 py-2.5">
            <Search size={14} className="text-fg-subtle" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search nodes…" className="w-full bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-subtle" />
          </div>
          <div className="overflow-y-auto p-1.5">
            {groups.map((g) => (
              <div key={g.pillar} className="mb-1">
                <div className="px-2 pb-1 pt-2 text-[11px] text-fg-subtle">{PILLAR[g.pillar].label}</div>
                {g.kinds.map((k) => {
                  const c = CATALOG[k];
                  const Icon = c.icon;
                  const a = ACCENT[c.accent];
                  return (
                    <button
                      key={k}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(DND_MIME, k);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onClick={() => {
                        onAdd(k);
                        setOpen(false);
                      }}
                      className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-white/[0.04]"
                    >
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ background: a.soft, color: a.fg }}>
                        <Icon size={14} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[12.5px] text-fg">{c.label}</span>
                        <span className="line-clamp-2 block text-[11px] leading-snug text-fg-subtle">{c.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
            {groups.length === 0 && <div className="px-2 py-6 text-center text-[12px] text-fg-subtle">No matching nodes</div>}
          </div>
        </div>
      )}
    </>
  );
}
