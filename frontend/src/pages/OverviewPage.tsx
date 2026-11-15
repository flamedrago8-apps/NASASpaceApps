import { TrendingDown, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { api, type Range, type SeriesPoint } from '../api';
import { StatusBadge } from '../components/trace/badges';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '../components/ui/chart';
import { ErrorState, PageHeader, Spinner } from '../components/ui/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group';
import { fmtMs, fmtNum, fmtPct, fmtUsd } from '../lib/format';
import { cn } from '../lib/utils';
import { navigate } from '../state/router';
import { useTraces } from '../state/traces';
import { useAsync } from '../state/useAsync';

const RANGES: { id: Range; long: string }[] = [
  { id: '1h', long: 'Last hour' },
  { id: '24h', long: 'Last 24 hours' },
  { id: '7d', long: 'Last 7 days' },
  { id: '30d', long: 'Last 30 days' },
];

const fmtBucket = (range: Range) => (t: number) => {
  const d = new Date(t);
  return range === '1h' || range === '24h' ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

/**
 * Change of a ratio between the first and second half of the window. Using rates (savings rate,
 * cost per request, threats per 1k) rather than raw totals keeps trends meaningful when volume
 * swings with the time of day.
 */
function trend(pts: SeriesPoint[], num: (p: SeriesPoint) => number, den: (p: SeriesPoint) => number = () => 1) {
  const h = Math.floor(pts.length / 2);
  const ratio = (xs: SeriesPoint[]) => xs.reduce((s, p) => s + num(p), 0) / Math.max(1e-9, xs.reduce((s, p) => s + den(p), 0));
  const a = ratio(pts.slice(0, h));
  const b = ratio(pts.slice(h));
  return a > 0 ? (b - a) / a : 0;
}

const spendConfig = {
  naive: { label: 'Without gateway', color: 'hsl(var(--chart-2))' },
  actual: { label: 'Actual spend', color: 'hsl(var(--chart-1))' },
} satisfies ChartConfig;

const reqConfig = { requests: { label: 'Requests', color: 'hsl(var(--chart-2))' }, blocked: { label: 'Threats', color: 'hsl(var(--chart-4))' } } satisfies ChartConfig;

export function OverviewPage() {
  const [range, setRange] = useState<Range>('24h');
  const summary = useAsync(() => api.getSummary(range), [range], 15_000);
  const series = useAsync(() => api.getTimeseries(range), [range], 15_000);
  const { traces } = useTraces();

  const s = summary.data;
  const pts = series.data ?? [];
  const fx = fmtBucket(range);
  const rangeLabel = RANGES.find((r) => r.id === range)!.long;
  const threats = traces.filter((t) => t.status === 'blocked' || t.status === 'honeypot' || t.leakedThreat).slice(0, 8);
  const chartData = pts.map((p) => ({ t: p.t, naive: +p.costNaive.toFixed(4), actual: +p.costActual.toFixed(4), requests: p.requests, blocked: p.blocked }));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Overview" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {summary.error && !s ? (
          <ErrorState error={summary.error} onRetry={summary.reload} />
        ) : !s ? (
          <Spinner label="Loading metrics" />
        ) : (
          <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
            <div className="grid grid-cols-1 gap-4 px-4 sm:grid-cols-2 lg:px-6 xl:grid-cols-4">
              <StatCard
                label="Money saved"
                value={fmtUsd(s.saved)}
                delta={trend(pts, (p) => p.costNaive - p.costActual, (p) => p.costNaive)}
                deltaHint="Savings rate vs. first half of the window"
                headline={`${fmtPct(s.saved / Math.max(1e-9, s.costNaive))} less than going direct`}
                sub={`${rangeLabel} vs. a gateway-less baseline`}
              />
              <StatCard label="Actual spend" value={fmtUsd(s.costActual)} delta={trend(pts, (p) => p.costActual, (p) => p.requests)} deltaHint="Cost per request vs. first half of the window" goodWhenDown headline={`${fmtUsd(s.costNaive)} without the gateway`} sub="Models, search and embeddings" />
              <StatCard label="Requests" value={fmtNum(s.requests)} delta={trend(pts, (p) => p.requests)} deltaHint="Volume vs. first half of the window" headline={`${fmtNum(s.requests)} live requests routed`} sub={`p50 ${fmtMs(s.latencyP50)} · p95 ${fmtMs(s.latencyP95)}`} />
              <StatCard label="Threats stopped" value={fmtNum(s.blocked)} delta={trend(pts, (p) => p.blocked, (p) => p.requests)} deltaHint="Threats per request vs. first half of the window" goodWhenDown headline={`${fmtNum(s.honeypotted)} trapped in the honeypot`} sub="Never reached or billed a model" />
            </div>

            <div className="px-4 lg:px-6">
              <Card>
                <CardHeader>
                  <CardTitle>Spend</CardTitle>
                  <CardDescription>Without the gateway vs. actual · {rangeLabel.toLowerCase()}</CardDescription>
                  <CardAction>
                    <ToggleGroup type="single" value={range} onValueChange={(v) => v && setRange(v as Range)} variant="outline" className="hidden gap-0 md:flex [&>*+*]:border-l-0 [&>*:first-child]:rounded-l-md [&>*:last-child]:rounded-r-md [&>*]:rounded-none">
                      {RANGES.map((r) => (
                        <ToggleGroupItem key={r.id} value={r.id} className="h-8 px-4 text-xs">
                          {r.long}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                    <Select value={range} onValueChange={(v) => setRange(v as Range)}>
                      <SelectTrigger className="h-8 w-36 md:hidden" aria-label="Time range">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RANGES.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.long}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </CardAction>
                </CardHeader>
                <CardContent className={cn('px-2 pt-2 sm:px-6', series.loading && 'opacity-70')}>
                  <ChartContainer config={spendConfig} className="aspect-auto h-[260px] w-full">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="fillNaive" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--color-naive)" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="var(--color-naive)" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="fillActual" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--color-actual)" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="var(--color-actual)" stopOpacity={0.1} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="t" tickLine={false} axisLine={false} tickMargin={8} minTickGap={40} tickFormatter={fx} />
                      <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`)} />
                      <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" labelFormatter={(l) => fx(Number(l))} valueFormatter={fmtUsd} />} />
                      <Area dataKey="naive" type="natural" fill="url(#fillNaive)" stroke="var(--color-naive)" strokeWidth={1.5} />
                      <Area dataKey="actual" type="natural" fill="url(#fillActual)" stroke="var(--color-actual)" strokeWidth={1.5} />
                    </AreaChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 px-4 lg:grid-cols-3 lg:px-6">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Traffic</CardTitle>
                  <CardDescription>Requests and threats stopped · {rangeLabel.toLowerCase()}</CardDescription>
                </CardHeader>
                <CardContent className="px-2 sm:px-6">
                  <ChartContainer config={reqConfig} className="aspect-auto h-[220px] w-full">
                    <BarChart data={chartData}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="t" tickLine={false} axisLine={false} tickMargin={8} minTickGap={40} tickFormatter={fx} />
                      <ChartTooltip cursor={false} content={<ChartTooltipContent labelFormatter={(l) => fx(Number(l))} />} />
                      <Bar dataKey="requests" fill="var(--color-requests)" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="blocked" fill="var(--color-blocked)" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Where savings come from</CardTitle>
                  <CardDescription>
                    {fmtUsd(s.saved)} saved · {rangeLabel.toLowerCase()}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {(
                    [
                      ['search', 'Search routing', 'hsl(var(--chart-3))', `${fmtNum(Math.max(0, s.searchesNaive - s.searchesSent))} searches avoided`],
                      ['efficiency', 'Caching & compression', 'hsl(var(--chart-1))', `${fmtNum(s.tokensSaved)} tokens saved`],
                      ['security', 'Attacks never billed', 'hsl(var(--chart-4))', `${fmtNum(s.blocked)} requests stopped`],
                    ] as const
                  ).map(([k, label, color, sub]) => {
                    const v = s.savedByPillar[k];
                    const pct = v / Math.max(1e-9, s.saved);
                    return (
                      <div key={k} className="space-y-1.5">
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="font-medium">{label}</span>
                          <span className="tabular-nums">{fmtUsd(v)}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full" style={{ width: `${Math.max(1, pct * 100)}%`, background: color }} />
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{sub}</span>
                          <span className="tabular-nums">{fmtPct(pct)}</span>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>

            <div className="px-4 lg:px-6">
              <Card>
                <CardHeader>
                  <CardTitle>Recent threats</CardTitle>
                  <CardDescription>Attacks seen in the live window</CardDescription>
                  <CardAction>
                    <Button variant="outline" size="sm" onClick={() => navigate('/traces?status=blocked')}>
                      View all
                    </Button>
                  </CardAction>
                </CardHeader>
                <CardContent className="px-0 pb-2">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="pl-6">Time</TableHead>
                        <TableHead>Outcome</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Confidence</TableHead>
                        <TableHead className="pr-6">Prompt</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {threats.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                            No threats in the live window.
                          </TableCell>
                        </TableRow>
                      )}
                      {threats.map((t) => (
                        <TableRow key={t.id} className="cursor-pointer" onClick={() => navigate(`/traces?id=${t.id}`)}>
                          <TableCell className="whitespace-nowrap pl-6 tabular-nums text-muted-foreground">{new Date(t.ts).toLocaleTimeString()}</TableCell>
                          <TableCell>{t.leakedThreat ? <Badge variant="outline" className="text-security-amber">Missed</Badge> : <StatusBadge status={t.status} />}</TableCell>
                          <TableCell className="capitalize">{(t.threat ?? 'unknown').replace('_', ' ')}</TableCell>
                          <TableCell className="text-right tabular-nums">{t.threatConfidence ? fmtPct(t.threatConfidence) : '—'}</TableCell>
                          <TableCell className="max-w-[420px] truncate pr-6 text-muted-foreground">{t.prompt}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>

            <p className="px-4 text-xs text-muted-foreground lg:px-6">
              Savings are measured per request against a baseline with no gateway: the model the client asked for, no caching or compression, and a web search on every prompt (the full query fan-out when live data is needed).
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, delta, deltaHint, headline, sub, goodWhenDown }: { label: string; value: string; delta: number; deltaHint: string; headline: string; sub: string; goodWhenDown?: boolean }) {
  const up = delta >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  const good = goodWhenDown ? !up : up;
  return (
    <Card className="bg-gradient-to-t from-primary/[0.03] to-card">
      <CardHeader className="pb-3">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums xl:text-3xl">{value}</CardTitle>
        <CardAction>
          <Badge variant="outline" title={deltaHint} className={cn('font-normal', good ? 'text-foreground' : 'text-muted-foreground')}>
            <Icon />
            {up ? '+' : ''}
            {(delta * 100).toFixed(1)}%
          </Badge>
        </CardAction>
      </CardHeader>
      <CardFooter className="flex-col items-start gap-1 text-sm">
        <div className="line-clamp-1 font-medium">{headline}</div>
        <div className="text-muted-foreground">{sub}</div>
      </CardFooter>
    </Card>
  );
}
