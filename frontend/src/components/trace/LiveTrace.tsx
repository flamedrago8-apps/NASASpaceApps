import clsx from 'clsx';
import { ChevronRight, ChevronUp, Search, TriangleAlert } from 'lucide-react';
import { memo, useMemo, useState, type ReactNode } from 'react';
import { CATALOG } from '../../lib/catalog';
import { fmtMs, fmtTime, fmtUsd } from '../../lib/format';
import { ACCENT } from '../../lib/theme';
import type { Span, Trace, TraceStatus } from '../../types';
import { Input } from '../ui/input';
import { OutcomeBadge, StatusBadge } from './badges';

const COLS = 'grid grid-cols-[14px_92px_minmax(180px,1.4fr)_92px_minmax(200px,1.6fr)_64px_100px_70px_76px] items-center gap-x-4';
const SCALE_MS = 4000;
const TICKS = [0, 1000, 2000, 3000, 4000];

export type Filter = 'all' | TraceStatus | 'search';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'ok', label: 'Completed' },
  { id: 'cache_hit', label: 'Cache hits' },
  { id: 'search', label: 'Web search' },
  { id: 'honeypot', label: 'Honeypot' },
  { id: 'flagged', label: 'Flagged' },
  { id: 'blocked', label: 'Blocked' },
];

type Props = {
  traces: Trace[];
  /** 'drawer' = collapsible bottom panel on the canvas; 'page' = full-page explorer. */
  variant?: 'drawer' | 'page';
  expanded?: boolean;
  onToggleExpanded?: () => void;
  onHover?: (t: Trace | null) => void;
  onSelectNode?: (id: string) => void;
  initialFilter?: Filter;
  initialOpenId?: string | null;
  toolbarExtra?: ReactNode;
  footer?: ReactNode;
};

export function LiveTrace({ traces, variant = 'drawer', expanded = true, onToggleExpanded, onHover, onSelectNode, initialFilter = 'all', initialOpenId = null, toolbarExtra, footer }: Props) {
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(initialOpenId);
  const isPage = variant === 'page';

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return traces
      .filter((t) => (filter === 'all' ? true : filter === 'search' ? t.searchRaw > 0 && t.status !== 'blocked' : t.status === filter))
      .filter((t) => !ql || t.id.includes(ql) || t.prompt.toLowerCase().includes(ql) || t.app.includes(ql) || t.model.includes(ql))
      .slice(0, isPage ? 1000 : 120);
  }, [traces, filter, q, isPage]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: traces.length, search: 0 };
    for (const t of traces) {
      c[t.status] = (c[t.status] ?? 0) + 1;
      if (t.searchRaw > 0 && t.status !== 'blocked') c.search++;
    }
    return c;
  }, [traces]);

  const last = traces[0];

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <div className="flex h-11 shrink-0 items-center gap-3 px-4">
        {!isPage && (
          <button onClick={onToggleExpanded} className="flex items-center gap-2 text-[13px] font-medium text-foreground" aria-expanded={expanded}>
            <ChevronUp size={15} className={clsx('text-muted-foreground transition-transform', expanded && 'rotate-180')} />
            Logs
            <span className="text-[13px] font-normal tabular-nums text-muted-foreground">{traces.length}</span>
          </button>
        )}

        {expanded ? (
          <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={clsx('whitespace-nowrap rounded-lg px-2.5 py-1 text-[13px] transition-colors', filter === f.id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-muted-foreground')}
              >
                {f.label}
                <span className="ml-1.5 tabular-nums opacity-60">{counts[f.id] ?? 0}</span>
              </button>
            ))}
          </div>
        ) : (
          last && (
            <button onClick={onToggleExpanded} className="flex min-w-0 items-center gap-3 text-[13px] text-muted-foreground hover:text-muted-foreground">
              <StatusBadge status={last.status} />
              <span className="truncate">{last.prompt}</span>
              <span className="shrink-0 tabular-nums">{fmtMs(last.latency)}</span>
              {last.saved > 0.00005 && <span className="shrink-0 tabular-nums text-efficiency">+{fmtUsd(last.saved)}</span>}
            </button>
          )
        )}

        {expanded && (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <div className="relative">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search traces" className="h-8 w-44 pl-8 text-xs" />
            </div>
            {toolbarExtra}
          </div>
        )}
      </div>

      {expanded && (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="min-w-[960px]">
            <div className={clsx(COLS, 'sticky top-0 z-10 bg-canvas px-4 pb-1.5 pt-1 text-xs text-muted-foreground')}>
              <span />
              <span>Time</span>
              <span>Prompt</span>
              <span>Status</span>
              <span className="relative">
                <span className="flex justify-between tabular-nums">
                  {TICKS.map((t) => (
                    <span key={t} className="w-0 whitespace-nowrap" style={{ transform: t === SCALE_MS ? 'translateX(-14px)' : undefined }}>
                      {t ? `${t / 1000}s` : 'Waterfall'}
                    </span>
                  ))}
                </span>
              </span>
              <span className="text-right">Latency</span>
              <span className="text-right">Tokens</span>
              <span className="text-right">Searches</span>
              <span className="text-right">Saved</span>
            </div>
            {rows.map((t) => (
              <TraceRow key={t.id} t={t} open={open === t.id} onToggle={() => setOpen((o) => (o === t.id ? null : t.id))} onHover={onHover} onSelectNode={onSelectNode} />
            ))}
            {rows.length === 0 && <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">{traces.length ? 'No requests match.' : 'Waiting for traffic…'}</div>}
            {footer}
          </div>
        </div>
      )}
    </div>
  );
}

function spanColor(s: Span) {
  if (s.outcome === 'blocked') return ACCENT.red.fg;
  return ACCENT[CATALOG[s.kind].accent].fg;
}

const TraceRow = memo(function TraceRow({ t, open, onToggle, onHover, onSelectNode }: { t: Trace; open: boolean; onToggle: () => void; onHover?: (t: Trace | null) => void; onSelectNode?: (id: string) => void }) {
  const visible = t.spans.filter((s) => s.outcome !== 'bypassed');
  return (
    <div className={clsx('animate-row-in', open && 'bg-muted/50')} onMouseEnter={() => onHover?.(t)} onMouseLeave={() => onHover?.(null)}>
      <button onClick={onToggle} className={clsx(COLS, 'w-full px-4 py-[7px] text-left hover:bg-muted/50')}>
        <ChevronRight size={13} className={clsx('text-muted-foreground transition-transform', open && 'rotate-90')} />
        <span className="text-[13px] tabular-nums text-muted-foreground">{fmtTime(t.ts).slice(0, 8)}</span>
        <span className="truncate text-sm text-muted-foreground" title={`${t.app} · ${t.prompt}`}>
          {t.prompt}
        </span>
        <span className="flex items-center gap-1">
          <StatusBadge status={t.status} />
          {t.leakedThreat && <TriangleAlert size={13} className="text-security-amber" aria-label="Attack not detected" />}
        </span>
        <Waterfall spans={visible} scale={SCALE_MS} />
        <span className="text-right text-[13px] tabular-nums text-foreground">{fmtMs(t.latency)}</span>
        <span className="text-right text-[13px] tabular-nums text-muted-foreground">
          {t.status === 'blocked' ? '—' : t.status === 'cache_hit' ? <span className="text-efficiency">0 sent</span> : <>{fmtK(t.tokensIn)} → <span className="text-foreground">{fmtK(t.tokensSent)}</span></>}
        </span>
        <span className="text-right text-[13px] tabular-nums text-muted-foreground">
          {t.searchRaw === 0 || t.status === 'blocked' ? '—' : <>{t.searchRaw} → <span className={t.searchSent < t.searchRaw ? 'text-serp' : 'text-foreground'}>{t.searchSent}</span></>}
        </span>
        <span className={clsx('text-right text-[13px] tabular-nums', t.saved > 0.00005 ? 'text-efficiency' : 'text-muted-foreground')}>
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
    <div className="relative h-3 overflow-hidden rounded-full bg-muted/50">
      {TICKS.slice(1, -1).map((tk) => (
        <span key={tk} className="absolute inset-y-0 w-px bg-muted" style={{ left: `${(tk / scale) * 100}%` }} />
      ))}
      {spans.map((s, i) => (
        <span
          key={i}
          className="absolute top-[3px] h-1.5 rounded-full"
          style={{ left: `${Math.min(100, (s.start / scale) * 100)}%`, width: `max(2px, ${(s.duration / scale) * 100}%)`, background: spanColor(s), opacity: s.outcome === 'miss' ? 0.45 : 0.9 }}
          title={`${s.name} · ${fmtMs(s.duration)}`}
        />
      ))}
    </div>
  );
}

function TraceDetail({ t, onSelectNode }: { t: Trace; onSelectNode?: (id: string) => void }) {
  const total = Math.max(t.latency, 1);
  return (
    <div className="grid gap-4 px-4 pb-4 pt-1 lg:grid-cols-[1fr_320px]">
      <div className="overflow-hidden rounded-xl border border-border">
        <div className="grid grid-cols-[180px_72px_1fr_minmax(160px,0.9fr)_64px_72px] gap-x-3 border-b border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
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
            <div key={i} className={clsx('grid grid-cols-[180px_72px_1fr_minmax(160px,0.9fr)_64px_72px] items-center gap-x-3 border-b border-border px-3 py-1.5 last:border-0', s.outcome === 'bypassed' && 'opacity-45')}>
              <button onClick={() => onSelectNode?.(s.nodeId)} className="flex min-w-0 items-center gap-2 text-left text-[13px] text-muted-foreground hover:text-foreground">
                <span className="font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, '0')}</span>
                <Icon size={13} style={{ color }} />
                <span className="truncate">{s.name}</span>
              </button>
              <OutcomeBadge outcome={s.outcome} />
              <div className="min-w-0">
                <div className="truncate font-mono text-xs text-muted-foreground" title={s.detail}>
                  {s.detail}
                </div>
                {s.meta && (
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {s.meta.map((m, j) => (
                      <span key={j} className={clsx('rounded px-1 font-mono text-xs', m.startsWith('−') ? 'text-muted-foreground line-through decoration-fg-subtle/60' : 'bg-serp/10 text-serp')}>
                        {m.replace(/^[−+] /, '')}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative h-2.5 rounded-sm bg-muted/50">
                <span className="absolute inset-y-0 rounded-sm" style={{ left: `${(s.start / total) * 100}%`, width: `max(2px, ${(s.duration / total) * 100}%)`, background: color, opacity: s.outcome === 'bypassed' ? 0.3 : 0.9 }} />
              </div>
              <span className="text-right text-[13px] tabular-nums text-muted-foreground">{s.outcome === 'bypassed' ? '—' : fmtMs(s.duration)}</span>
              <span className={clsx('text-right font-mono text-xs tabular-nums', s.saved > 0.00005 ? 'text-efficiency' : 'text-muted-foreground')}>{s.saved > 0.00005 ? `+${fmtUsd(s.saved)}` : '—'}</span>
            </div>
          );
        })}
      </div>

      <div className="space-y-3">
        <div className="rounded-xl border border-border bg-muted/50 p-3">
          <div className="mb-2 text-xs text-muted-foreground">ROI</div>
          <dl className="space-y-1.5 font-mono text-[13px]">
            <Row k="Naive cost" v={t.status === 'blocked' ? '—' : fmtUsd(t.costBaseline)} />
            <Row k="Actual cost" v={t.status === 'blocked' ? '$0 (blocked)' : fmtUsd(t.costActual)} />
            <div className="my-1 border-t border-border" />
            <Row k="Saved" v={t.saved > 0 ? `${fmtUsd(t.saved)} (${Math.round((t.saved / Math.max(t.costBaseline, 1e-9)) * 100)}%)` : '—'} color={t.saved > 0 ? ACCENT.green.fg : undefined} />
            <Row k="Tokens" v={`${t.tokensIn.toLocaleString()} → ${t.tokensSent.toLocaleString()}`} />
            <Row k="SerpAPI calls" v={`${t.searchRaw} → ${t.searchSent}`} />
          </dl>
        </div>
        <div className="rounded-xl border border-border bg-muted/50 p-3">
          <div className="mb-2 text-xs text-muted-foreground">Payload</div>
          <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-muted-foreground">
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
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right tabular-nums text-foreground" style={color ? { color } : undefined}>
        {v}
      </dd>
    </div>
  );
}
