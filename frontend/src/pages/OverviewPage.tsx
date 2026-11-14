import clsx from 'clsx';
import { ArrowUpRight, ShieldAlert, Table2, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { api, type Range } from '../api';
import { BarList, CHART, ColumnChart, DataTable, LegendKey, LineChart } from '../components/charts/charts';
import { StatusBadge } from '../components/trace/badges';
import { Card, ErrorState, IconButton, PageHeader, Segmented, Spinner } from '../components/ui/kit';
import { ProfileSlider } from '../components/ProfileSlider';
import { SavingsCounter } from '../components/SavingsCounter';
import { fmtMs, fmtNum, fmtPct, fmtUsd } from '../lib/format';
import { navigate } from '../state/router';
import { useTraces } from '../state/traces';
import { useAsync } from '../state/useAsync';

const RANGES: { id: Range; label: string }[] = [
  { id: '1h', label: '1h' },
  { id: '24h', label: '24h' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
];

function fmtBucket(range: Range) {
  return (t: number) => {
    const d = new Date(t);
    if (range === '1h' || range === '24h') return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };
}

const fmtCompactUsd = (v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(v >= 10_000 ? 0 : 1)}k` : v >= 10 ? `$${Math.round(v)}` : `$${v.toFixed(2)}`);

export function OverviewPage() {
  const [range, setRange] = useState<Range>('24h');
  const summary = useAsync(() => api.getSummary(range), [range], 15_000);
  const series = useAsync(() => api.getTimeseries(range), [range], 15_000);
  const { traces } = useTraces();
  const [tables, setTables] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setTables((t) => ({ ...t, [k]: !t[k] }));

  const s = summary.data;
  const pts = series.data ?? [];
  const fx = fmtBucket(range);
  const refetching = summary.loading || series.loading;
  const threats = traces.filter((t) => t.status === 'blocked' || t.status === 'honeypot' || t.status === 'flagged' || t.leakedThreat).slice(0, 6);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Overview" subtitle="chat-default · production">
        <Segmented label="Time range" value={range} options={RANGES} onChange={setRange} />
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {summary.error && !s ? (
          <ErrorState error={summary.error} onRetry={summary.reload} />
        ) : !s ? (
          <Spinner label="Loading metrics" />
        ) : (
          <div className={clsx('mx-auto max-w-[1280px] space-y-4 p-4 transition-opacity sm:p-5', refetching && 'opacity-80')}>
            <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
              <SavingsCounter compact />
              <ProfileSlider />
            </div>

            {/* KPI row */}
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[#1f1f25] bg-[#1f1f25] md:grid-cols-3 xl:grid-cols-6">
              <Kpi label="Saved in range" value={fmtUsd(s.saved)} sub={`${fmtPct(s.saved / Math.max(1e-9, s.costNaive))} of naive spend`} hero />
              <Kpi label="Spend" value={fmtUsd(s.costActual)} sub={`vs ${fmtUsd(s.costNaive)} without gateway`} />
              <Kpi label="Requests" value={fmtNum(s.requests)} sub={`p50 ${fmtMs(s.latencyP50)} · p95 ${fmtMs(s.latencyP95)}`} />
              <Kpi label="Threats stopped" value={fmtNum(s.blocked)} sub={`${fmtNum(s.honeypotted)} trapped in honeypot`} />
              <Kpi label="Cache hit rate" value={fmtPct(s.cacheHits / Math.max(1, s.requests))} sub={`${fmtNum(s.tokensSaved)} tokens saved`} />
              <Kpi label="Searches avoided" value={fmtNum(Math.max(0, s.searchesNaive - s.searchesSent))} sub={`${fmtNum(s.searchesSent)} sent of ${fmtNum(s.searchesNaive)}`} />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card
                className="lg:col-span-2"
                title="Spend: with vs without gateway"
                actions={<TableToggle on={tables.spend} onClick={() => toggle('spend')} />}
              >
                <div className="mb-3 flex flex-wrap items-center gap-4">
                  <LegendKey color={CHART.neutral} label="Without gateway" />
                  <LegendKey color={CHART.efficiency} label="Actual spend" />
                  <LegendKey color="rgba(5,150,105,0.35)" label="Saved" shape="rect" />
                </div>
                {tables.spend ? (
                  <DataTable columns={['Time', 'Without gateway', 'Actual', 'Saved']} rows={pts.map((p) => [fx(p.t), fmtUsd(p.costNaive), fmtUsd(p.costActual), fmtUsd(p.costNaive - p.costActual)])} />
                ) : (
                  <LineChart
                    x={pts.map((p) => p.t)}
                    series={[
                      { id: 'naive', label: 'Without gateway', color: CHART.neutral, values: pts.map((p) => p.costNaive) },
                      { id: 'actual', label: 'Actual spend', color: CHART.efficiency, values: pts.map((p) => p.costActual) },
                    ]}
                    shadeBetween={['naive', 'actual']}
                    fmtX={fx}
                    fmtY={fmtCompactUsd}
                  />
                )}
              </Card>

              <Card title="Savings by pillar" actions={<TableToggle on={tables.pillar} onClick={() => toggle('pillar')} />}>
                {tables.pillar ? (
                  <DataTable
                    columns={['Pillar', 'Saved', 'Share']}
                    rows={(['efficiency', 'search', 'security'] as const).map((k) => [k === 'search' ? 'SerpAPI routing' : k[0].toUpperCase() + k.slice(1), fmtUsd(s.savedByPillar[k]), fmtPct(s.savedByPillar[k] / Math.max(1e-9, s.saved))])}
                  />
                ) : (
                  <>
                    <BarList
                      fmt={fmtUsd}
                      items={[
                        { id: 'efficiency', label: 'Efficiency · caching & compression', value: s.savedByPillar.efficiency, color: CHART.efficiency, sub: fmtPct(s.savedByPillar.efficiency / Math.max(1e-9, s.saved)) },
                        { id: 'search', label: 'SerpAPI routing', value: s.savedByPillar.search, color: CHART.search, sub: fmtPct(s.savedByPillar.search / Math.max(1e-9, s.saved)) },
                        { id: 'security', label: 'Security · attacks never billed', value: s.savedByPillar.security, color: CHART.security, sub: fmtPct(s.savedByPillar.security / Math.max(1e-9, s.saved)) },
                      ]}
                    />
                    <div className="mt-5 border-t border-[#1f1f25] pt-4">
                      <div className="mb-2 flex items-center gap-2 text-[12px] text-fg-muted">
                        <ShieldAlert size={13} style={{ color: CHART.security }} /> Security impact
                      </div>
                      <p className="text-[12px] leading-relaxed text-fg-subtle">
                        <span className="tabular-nums text-fg">{fmtNum(s.blocked)}</span> malicious requests never reached a model; <span className="tabular-nums text-fg">{fmtNum(s.honeypotted)}</span> were kept busy by the honeypot instead.
                      </p>
                      <ul className="mt-3 space-y-1.5">
                        {s.threats.map((t) => (
                          <li key={t.type} className="flex justify-between text-[12px]">
                            <span className="text-fg-muted">{t.type.replace('_', ' ')}</span>
                            <span className="tabular-nums text-fg">{fmtNum(t.count)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2" title="Requests" actions={<TableToggle on={tables.req} onClick={() => toggle('req')} />}>
                {tables.req ? (
                  <DataTable columns={['Time', 'Requests', 'Blocked']} rows={pts.map((p) => [fx(p.t), fmtNum(p.requests), fmtNum(p.blocked)])} />
                ) : (
                  <ColumnChart x={pts.map((p) => p.t)} values={pts.map((p) => p.requests)} color={CHART.neutral} label="requests" fmtX={fx} fmtY={(v) => fmtNum(Math.round(v))} />
                )}
              </Card>

              <Card
                title="Recent threats"
                actions={
                  <IconButton label="Open blocked traces" onClick={() => navigate('/traces?status=blocked')}>
                    <ArrowUpRight size={14} />
                  </IconButton>
                }
                bodyClassName="px-2 pb-2"
              >
                {threats.length === 0 ? (
                  <div className="px-2 py-8 text-center text-[12px] text-fg-subtle">No threats in the live window.</div>
                ) : (
                  <ul>
                    {threats.map((t) => (
                      <li key={t.id}>
                        <button onClick={() => navigate(`/traces?id=${t.id}`)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-white/[0.03]">
                          <StatusBadge status={t.status} />
                          <span className="min-w-0 flex-1 truncate text-[12px] text-fg-muted">{t.prompt}</span>
                          {t.leakedThreat && <span className="text-[11px] text-security-amber">missed</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            <div className="flex items-center gap-2 px-1 pb-2 text-[11.5px] text-fg-subtle">
              <TrendingUp size={13} /> Savings are measured per request against a naive baseline: the model the client asked for, no caching or compression, and a SerpAPI search on every prompt (the full query fan-out when live data is needed).
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, hero }: { label: string; value: string; sub: string; hero?: boolean }) {
  return (
    <div className="bg-[#0f0f12] px-4 py-3.5">
      <div className="text-[11.5px] text-fg-subtle">{label}</div>
      <div className={clsx('mt-1 text-[20px] font-medium tabular-nums tracking-tight', hero ? 'text-efficiency' : 'text-fg')}>{value}</div>
      <div className="mt-0.5 truncate text-[11px] text-fg-subtle" title={sub}>
        {sub}
      </div>
    </div>
  );
}

function TableToggle({ on, onClick }: { on?: boolean; onClick: () => void }) {
  return (
    <IconButton label={on ? 'Show chart' : 'Show as table'} onClick={onClick} className={on ? 'bg-white/[0.06] text-fg' : undefined}>
      <Table2 size={14} />
    </IconButton>
  );
}
