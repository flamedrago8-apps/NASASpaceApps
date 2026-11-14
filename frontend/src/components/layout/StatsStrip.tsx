import { useMemo } from 'react';
import { fmtMs, fmtNum, fmtPct, fmtUsd, percentile } from '../../lib/format';
import { ACCENT } from '../../lib/theme';
import type { Totals } from '../../hooks/useTrafficSimulator';
import type { Trace } from '../../types';
import { Sparkline } from '../ui/controls';

const BUCKETS = 30;
const BUCKET_MS = 8_000;

export function StatsStrip({ traces, totals }: { traces: Trace[]; totals: Totals }) {
  const m = useMemo(() => {
    const now = traces[0]?.ts ?? Date.now();
    const series = { req: Array(BUCKETS).fill(0), blocked: Array(BUCKETS).fill(0), hit: Array(BUCKETS).fill(0), saved: Array(BUCKETS).fill(0), serp: Array(BUCKETS).fill(0), tok: Array(BUCKETS).fill(0), lat: Array.from({ length: BUCKETS }, () => [] as number[]) };
    for (const t of traces) {
      const b = BUCKETS - 1 - Math.floor((now - t.ts) / BUCKET_MS);
      if (b < 0) continue;
      series.req[b]++;
      if (t.status === 'blocked') series.blocked[b]++;
      if (t.status === 'cache_hit') series.hit[b]++;
      series.saved[b] += t.saved;
      series.serp[b] += t.searchRaw - t.searchSent;
      if (t.status !== 'blocked') series.tok[b] += Math.max(0, t.tokensIn - t.tokensSent);
      series.lat[b].push(t.latency);
    }
    const nonBlocked = traces.filter((t) => t.status !== 'blocked');
    return {
      series,
      hitRate: traces.filter((t) => t.status === 'cache_hit').length / Math.max(1, traces.length),
      p50: percentile(nonBlocked.map((t) => t.latency), 50),
      roi: totals.saved / Math.max(1e-9, totals.baseline),
    };
  }, [traces, totals]);

  const cards = [
    { label: 'Requests · 24h', value: fmtNum(totals.requests), sub: `${fmtMs(m.p50)} p50`, data: m.series.req, color: ACCENT.neutral.fg },
    { label: 'Threats blocked', value: fmtNum(totals.blocked), sub: 'injection + jailbreak', data: m.series.blocked, color: ACCENT.purple.fg },
    { label: 'Cache hit rate', value: fmtPct(m.hitRate), sub: 'exact + semantic', data: m.series.hit, color: ACCENT.green.fg },
    { label: 'Tokens saved', value: fmtNum(totals.tokensSaved), sub: 'compression + cache', data: m.series.tok, color: ACCENT.green.fg },
    { label: 'SerpAPI calls avoided', value: fmtNum(totals.searchAvoided), sub: 'router + cache + dedupe', data: m.series.serp, color: ACCENT.cyan.fg },
    { label: 'Money saved · 24h', value: fmtUsd(totals.saved), sub: `${fmtPct(m.roi)} of naive spend`, data: m.series.saved, color: ACCENT.green.fg, hero: true },
  ];

  return (
    <div className="grid shrink-0 grid-cols-2 border-b border-line bg-canvas sm:grid-cols-3 xl:grid-cols-6">
      {cards.map((c) => (
        <div key={c.label} className="relative border-r border-line px-4 pb-2 pt-2.5 last:border-r-0 max-xl:border-b">
          <div className="text-2xs font-medium uppercase tracking-[0.06em] text-fg-subtle">{c.label}</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-[19px] font-medium tabular-nums tracking-tight" style={{ color: c.hero ? ACCENT.green.fg : '#EDEDEF' }}>
              {c.value}
            </span>
          </div>
          <div className="flex items-end justify-between gap-3">
            <span className="whitespace-nowrap text-2xs text-fg-subtle">{c.sub}</span>
            <div className="w-20 shrink-0">
              <Sparkline data={c.data} color={c.color} height={18} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
