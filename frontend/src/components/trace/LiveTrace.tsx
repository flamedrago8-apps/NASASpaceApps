import clsx from 'clsx';
import { ChevronRight, Pause, Play, Search, TriangleAlert } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { CATALOG } from '../../lib/catalog';
import { fmtMs, fmtTime, fmtUsd } from '../../lib/format';
import { ACCENT } from '../../lib/theme';
import type { Span, Trace, TraceStatus } from '../../types';
import { OutcomeBadge, StatusBadge } from './badges';

const COLS = 'grid grid-cols-[18px_96px_112px_minmax(150px,1.3fr)_92px_minmax(220px,2fr)_70px_108px_76px_80px] items-center gap-x-3';
const SCALE_MS = 4000;
const TICKS = [0, 1000, 2000, 3000, 4000];

type Filter = 'all' | TraceStatus | 'search';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'ok', label: 'Completed' },
  { id: 'cache_hit', label: 'Cache hits' },
  { id: 'search', label: 'Web search' },
  { id: 'flagged', label: 'Flagged' },
  { id: 'blocked', label: 'Blocked' },
];

type Props = {
  traces: Trace[];
  running: boolean;
  onToggleRunning: () => void;
  rate: number;
  onRate: (r: number) => void;
  onHover: (t: Trace | null) => void;
  onSelectNode: (id: string) => void;
};

export function LiveTrace({ traces, running, onToggleRunning, rate, onRate, onHover, onSelectNode }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return traces
      .filter((t) => (filter === 'all' ? true : filter === 'search' ? t.searchRaw > 0 && t.status !== 'blocked' : t.status === filter))
      .filter((t) => !ql || t.id.includes(ql) || t.prompt.toLowerCase().includes(ql) || t.app.includes(ql) || t.model.includes(ql))
      .slice(0, 120);
  }, [traces, filter, q]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: traces.length, search: 0 };
    for (const t of traces) {
      c[t.status] = (c[t.status] ?? 0) + 1;
      if (t.searchRaw > 0 && t.status !== 'blocked') c.search++;
    }
    return c;
  }, [traces]);

  const rps = useMemo(() => {
    const now = traces[0]?.ts ?? Date.now();
    return traces.filter((t) => now - t.ts < 10_000).length / 10;
  }, [traces]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-2">
        <div className="flex items-center gap-2">
          <span className={clsx('h-1.5 w-1.5 rounded-full', running ? 'animate-blink bg-efficiency' : 'bg-fg-subtle')} />
          <h2 className="text-[13px] font-medium text-fg">Live Trace</h2>
          <span className="font-mono text-2xs text-fg-subtle">{rps.toFixed(1)} req/s</span>
        </div>
        <div className="flex items-center gap-0.5 overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={clsx('whitespace-nowrap rounded-md px-2 py-1 text-[12px] transition-colors', filter === f.id ? 'bg-surface-3 text-fg' : 'text-fg-subtle hover:text-fg-muted')}
            >
              {f.label}
              <span className="ml-1.5 font-mono text-2xs text-fg-subtle">{counts[f.id] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex h-7 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-2 focus-within:border-fg-subtle">
            <Search size={13} className="text-fg-subtle" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by id, prompt, app…" className="w-44 bg-transparent text-[12px] text-fg outline-none placeholder:text-fg-subtle" />
          </div>
          <div className="flex h-7 items-center rounded-md border border-line-strong bg-surface p-0.5">
            {[1, 2, 5].map((r) => (
              <button key={r} onClick={() => onRate(r)} className={clsx('h-full rounded px-1.5 font-mono text-[11px]', rate === r ? 'bg-surface-3 text-fg' : 'text-fg-subtle hover:text-fg-muted')}>
                {r}×
              </button>
            ))}
          </div>
          <button onClick={onToggleRunning} className="flex h-7 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-2.5 text-[12px] text-fg-muted hover:bg-surface-3 hover:text-fg">
            {running ? <Pause size={12} /> : <Play size={12} />}
            {running ? 'Pause' : 'Resume'}
          </button>
        </div>
      </div>

      {/* table */}
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="min-w-[1180px]">
          <div className={clsx(COLS, 'sticky top-0 z-10 border-b border-line bg-canvas/95 px-4 py-1.5 text-2xs font-medium uppercase tracking-[0.06em] text-fg-subtle backdrop-blur')}>
            <span />
            <span>Time</span>
            <span>Request</span>
            <span>App · prompt</span>
            <span>Status</span>
            <span className="relative">
              <span>Waterfall</span>
              <span className="absolute inset-x-0 -bottom-1 flex justify-between font-mono normal-case tracking-normal text-fg-subtle/70">
                {TICKS.map((t) => (
                  <span key={t} className="w-0 whitespace-nowrap text-center" style={{ transform: t === 0 ? 'translateX(6px)' : t === SCALE_MS ? 'translateX(-10px)' : undefined }}>
                    {t ? `${t / 1000}s` : ''}
                  </span>
                ))}
              </span>
            </span>
            <span className="text-right">Latency</span>
            <span className="text-right">Tokens</span>
            <span className="text-right">SerpAPI</span>
            <span className="text-right">Saved</span>
          </div>
          {rows.map((t) => (
            <TraceRow key={t.id} t={t} open={open === t.id} onToggle={() => setOpen((o) => (o === t.id ? null : t.id))} onHover={onHover} onSelectNode={onSelectNode} />
          ))}
          {rows.length === 0 && <div className="px-4 py-10 text-center text-[12px] text-fg-subtle">No requests match this filter.</div>}
        </div>
      </div>
    </div>
  );
}

function spanColor(s: Span) {
  if (s.outcome === 'blocked') return ACCENT.red.fg;
  return ACCENT[CATALOG[s.kind].accent].fg;
}

const TraceRow = memo(function TraceRow({ t, open, onToggle, onHover, onSelectNode }: { t: Trace; open: boolean; onToggle: () => void; onHover: (t: Trace | null) => void; onSelectNode: (id: string) => void }) {
  const visible = t.spans.filter((s) => s.outcome !== 'bypassed');
  return (
    <div className={clsx('border-b border-line/70 animate-row-in', open && 'bg-surface')} onMouseEnter={() => onHover(t)} onMouseLeave={() => onHover(null)}>
      <button onClick={onToggle} className={clsx(COLS, 'w-full px-4 py-[7px] text-left hover:bg-surface')}>
        <ChevronRight size={13} className={clsx('text-fg-subtle transition-transform', open && 'rotate-90')} />
        <span className="font-mono text-[11px] tabular-nums text-fg-subtle">{fmtTime(t.ts)}</span>
        <span className="truncate font-mono text-[11px] text-fg-muted">{t.id}</span>
        <span className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 rounded border border-line-strong px-1 font-mono text-2xs text-fg-subtle">{t.app}</span>
          <span className="truncate text-[12px] text-fg-muted" title={t.prompt}>
            {t.prompt}
          </span>
        </span>
        <span className="flex items-center gap-1">
          <StatusBadge status={t.status} />
          {t.leakedThreat && <TriangleAlert size={13} className="text-security-amber" aria-label="Attack not detected" />}
        </span>
        <Waterfall spans={visible} scale={SCALE_MS} />
        <span className="text-right font-mono text-[12px] tabular-nums text-fg">{fmtMs(t.latency)}</span>
        <span className="text-right font-mono text-[11px] tabular-nums text-fg-muted">
          {t.status === 'blocked' ? '—' : t.status === 'cache_hit' ? <span className="text-efficiency">0 sent</span> : <>{fmtK(t.tokensIn)} → <span className="text-fg">{fmtK(t.tokensSent)}</span></>}
        </span>
        <span className="text-right font-mono text-[11px] tabular-nums text-fg-muted">
          {t.searchRaw === 0 || t.status === 'blocked' ? '—' : <>{t.searchRaw} → <span className={t.searchSent < t.searchRaw ? 'text-serp' : 'text-fg'}>{t.searchSent}</span></>}
        </span>
        <span className={clsx('text-right font-mono text-[12px] tabular-nums', t.saved > 0.00005 ? 'text-efficiency' : 'text-fg-subtle')}>
          {t.status === 'blocked' ? <span className="text-danger/80">threat</span> : t.saved > 0.00005 ? `+${fmtUsd(t.saved)}` : '—'}
        </span>
      </button>
      {open && <TraceDetail t={t} onSelectNode={onSelectNode} />}
    </div>
  );
});

function fmtK(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function Waterfall({ spans, scale }: { spans: Span[]; scale: number }) {
  return (
    <div className="relative h-3.5 overflow-hidden rounded-sm bg-surface-2">
      {TICKS.slice(1, -1).map((tk) => (
        <span key={tk} className="absolute inset-y-0 w-px bg-line" style={{ left: `${(tk / scale) * 100}%` }} />
      ))}
      {spans.map((s, i) => (
        <span
          key={i}
          className="absolute top-[3px] h-2 rounded-[2px]"
          style={{ left: `${Math.min(100, (s.start / scale) * 100)}%`, width: `max(2px, ${(s.duration / scale) * 100}%)`, background: spanColor(s), opacity: s.outcome === 'miss' ? 0.45 : 0.9 }}
          title={`${s.name} · ${fmtMs(s.duration)}`}
        />
      ))}
    </div>
  );
}

function TraceDetail({ t, onSelectNode }: { t: Trace; onSelectNode: (id: string) => void }) {
  const total = Math.max(t.latency, 1);
  return (
    <div className="grid gap-4 px-4 pb-4 pt-1 lg:grid-cols-[1fr_320px]">
      <div className="overflow-hidden rounded-lg border border-line">
        <div className="grid grid-cols-[180px_72px_1fr_minmax(160px,0.9fr)_64px_72px] gap-x-3 border-b border-line bg-surface-2 px-3 py-1.5 text-2xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
          <span>Step</span>
          <span>Outcome</span>
          <span>Detail</span>
          <span>Timeline · {fmtMs(total)}</span>
          <span className="text-right">Time</span>
          <span className="text-right">Saved</span>
        </div>
        {t.spans.map((s, i) => {
          const c = CATALOG[s.kind];
          const Icon = c.icon;
          const color = spanColor(s);
          return (
            <div key={i} className={clsx('grid grid-cols-[180px_72px_1fr_minmax(160px,0.9fr)_64px_72px] items-center gap-x-3 border-b border-line/60 px-3 py-1.5 last:border-0', s.outcome === 'bypassed' && 'opacity-45')}>
              <button onClick={() => onSelectNode(s.nodeId)} className="flex min-w-0 items-center gap-2 text-left text-[12px] text-fg-muted hover:text-fg">
                <span className="font-mono text-2xs text-fg-subtle">{String(i + 1).padStart(2, '0')}</span>
                <Icon size={13} style={{ color }} />
                <span className="truncate">{s.name}</span>
              </button>
              <OutcomeBadge outcome={s.outcome} />
              <div className="min-w-0">
                <div className="truncate font-mono text-[11px] text-fg-muted" title={s.detail}>
                  {s.detail}
                </div>
                {s.meta && (
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {s.meta.map((m, j) => (
                      <span key={j} className={clsx('rounded px-1 font-mono text-2xs', m.startsWith('−') ? 'text-fg-subtle line-through decoration-fg-subtle/60' : 'bg-serp/10 text-serp')}>
                        {m.replace(/^[−+] /, '')}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative h-2.5 rounded-sm bg-surface-2">
                <span className="absolute inset-y-0 rounded-sm" style={{ left: `${(s.start / total) * 100}%`, width: `max(2px, ${(s.duration / total) * 100}%)`, background: color, opacity: s.outcome === 'bypassed' ? 0.3 : 0.9 }} />
              </div>
              <span className="text-right font-mono text-[11px] tabular-nums text-fg-muted">{s.outcome === 'bypassed' ? '—' : fmtMs(s.duration)}</span>
              <span className={clsx('text-right font-mono text-[11px] tabular-nums', s.saved > 0.00005 ? 'text-efficiency' : 'text-fg-subtle')}>{s.saved > 0.00005 ? `+${fmtUsd(s.saved)}` : '—'}</span>
            </div>
          );
        })}
      </div>

      <div className="space-y-3">
        <div className="rounded-lg border border-line bg-surface-2 p-3">
          <div className="mb-2 text-2xs font-medium uppercase tracking-[0.06em] text-fg-subtle">ROI</div>
          <dl className="space-y-1.5 font-mono text-[12px]">
            <Row k="Naive cost" v={t.status === 'blocked' ? '—' : fmtUsd(t.costBaseline)} />
            <Row k="Actual cost" v={t.status === 'blocked' ? '$0 (blocked)' : fmtUsd(t.costActual)} />
            <div className="my-1 border-t border-line" />
            <Row k="Saved" v={t.saved > 0 ? `${fmtUsd(t.saved)} (${Math.round((t.saved / Math.max(t.costBaseline, 1e-9)) * 100)}%)` : '—'} color={t.saved > 0 ? ACCENT.green.fg : undefined} />
            <Row k="Tokens" v={`${t.tokensIn.toLocaleString()} → ${t.tokensSent.toLocaleString()}`} />
            <Row k="SerpAPI calls" v={`${t.searchRaw} → ${t.searchSent}`} />
          </dl>
        </div>
        <div className="rounded-lg border border-line bg-surface-2 p-3">
          <div className="mb-2 text-2xs font-medium uppercase tracking-[0.06em] text-fg-subtle">Payload</div>
          <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-fg-muted">
            {JSON.stringify({ id: t.id, route: t.route, app: t.app, model: t.model, messages: [{ role: 'user', content: t.prompt }], threat: t.threat ?? null }, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-fg-subtle">{k}</dt>
      <dd className="text-right tabular-nums text-fg" style={color ? { color } : undefined}>
        {v}
      </dd>
    </div>
  );
}
