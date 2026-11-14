/** Minute-bucketed metrics aggregated from traces. Powers the Overview page and the savings counter. */
import { NODE_SPECS } from './catalog';
import type { Lifetime, Range, SeriesPoint, Summary, Trace } from './types';

type Bucket = {
  t: number;
  requests: number;
  blocked: number;
  flagged: number;
  honeypot: number;
  cacheHits: number;
  costNaive: number;
  costActual: number;
  tokensSaved: number;
  searchesNaive: number;
  searchesSent: number;
  pillar: { security: number; efficiency: number; search: number };
  threats: Record<string, number>;
};

const MIN = 60_000;
export const RANGE_MS: Record<Range, number> = { '1h': 3_600_000, '24h': 86_400_000, '7d': 604_800_000, '30d': 2_592_000_000 };
const SERIES_STEP: Record<Range, number> = { '1h': MIN, '24h': 30 * MIN, '7d': 4 * 60 * MIN, '30d': 24 * 60 * MIN };

const empty = (t: number): Bucket => ({ t, requests: 0, blocked: 0, flagged: 0, honeypot: 0, cacheHits: 0, costNaive: 0, costActual: 0, tokensSaved: 0, searchesNaive: 0, searchesSent: 0, pillar: { security: 0, efficiency: 0, search: 0 }, threats: {} });

export type MetricsSnapshot = { buckets: Bucket[]; lifetime: Lifetime; latencies: number[] };

export class Metrics {
  private buckets = new Map<number, Bucket>();
  private latencies: number[] = [];
  private life: Lifetime;

  constructor(snap?: MetricsSnapshot) {
    this.life = snap?.lifetime ?? { since: Date.now(), requests: 0, costNaive: 0, costActual: 0, saved: 0, blocked: 0, cacheHits: 0, searchesAvoided: 0 };
    for (const b of snap?.buckets ?? []) this.buckets.set(b.t, b);
    this.latencies = snap?.latencies ?? [];
  }

  add(tr: Trace) {
    const t = Math.floor(tr.ts / MIN) * MIN;
    const b = this.buckets.get(t) ?? empty(t);
    this.buckets.set(t, b);
    b.requests++;
    if (tr.status === 'blocked') b.blocked++;
    if (tr.status === 'honeypot') b.honeypot++;
    if (tr.status === 'flagged') b.flagged++;
    if (tr.status === 'cache_hit') b.cacheHits++;
    b.costNaive += tr.costBaseline;
    b.costActual += tr.costActual;
    b.tokensSaved += Math.max(0, tr.tokensIn - tr.tokensSent);
    b.searchesNaive += tr.searchRaw;
    b.searchesSent += tr.searchSent;
    if (tr.threat) b.threats[tr.threat] = (b.threats[tr.threat] ?? 0) + 1;
    for (const s of tr.spans) {
      const p = NODE_SPECS[s.kind]?.pillar;
      if (!p || !s.saved) continue;
      b.pillar[p === 'core' ? 'efficiency' : p] += s.saved;
    }
    if (tr.status !== 'blocked' && tr.status !== 'honeypot' && tr.status !== 'error') {
      this.latencies.push(tr.latency);
      if (this.latencies.length > 2000) this.latencies.splice(0, this.latencies.length - 2000);
    }
    const L = this.life;
    L.requests++;
    L.costNaive += tr.costBaseline;
    L.costActual += tr.costActual;
    L.saved += tr.saved;
    if (tr.status === 'blocked' || tr.status === 'honeypot') L.blocked++;
    if (tr.status === 'cache_hit') L.cacheHits++;
    L.searchesAvoided += Math.max(0, tr.searchRaw - tr.searchSent);
  }

  private inRange(range: Range, now: number) {
    const from = now - RANGE_MS[range];
    return [...this.buckets.values()].filter((b) => b.t >= from && b.t <= now);
  }

  summary(range: Range, now = Date.now()): Summary {
    const bs = this.inRange(range, now);
    const sum = (f: (b: Bucket) => number) => bs.reduce((s, b) => s + f(b), 0);
    const threats: Record<string, number> = {};
    for (const b of bs) for (const [k, v] of Object.entries(b.threats)) threats[k] = (threats[k] ?? 0) + v;
    const lat = [...this.latencies].sort((a, b) => a - b);
    const costNaive = sum((b) => b.costNaive);
    const costActual = sum((b) => b.costActual);
    return {
      range,
      requests: sum((b) => b.requests),
      blocked: sum((b) => b.blocked + b.honeypot),
      flagged: sum((b) => b.flagged),
      honeypotted: sum((b) => b.honeypot),
      cacheHits: sum((b) => b.cacheHits),
      costNaive,
      costActual,
      saved: costNaive - costActual,
      tokensSaved: sum((b) => b.tokensSaved),
      searchesNaive: sum((b) => b.searchesNaive),
      searchesSent: sum((b) => b.searchesSent),
      latencyP50: lat[Math.floor(lat.length * 0.5)] ?? 0,
      latencyP95: lat[Math.floor(lat.length * 0.95)] ?? 0,
      savedByPillar: { security: sum((b) => b.pillar.security), efficiency: sum((b) => b.pillar.efficiency), search: sum((b) => b.pillar.search) },
      threats: Object.entries(threats)
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count),
    };
  }

  series(range: Range, now = Date.now()): SeriesPoint[] {
    const step = SERIES_STEP[range];
    const n = Math.round(RANGE_MS[range] / step);
    const end = Math.floor(now / step) * step;
    const pts: SeriesPoint[] = Array.from({ length: n }, (_, i) => ({ t: end - (n - 1 - i) * step, requests: 0, blocked: 0, costNaive: 0, costActual: 0 }));
    const start = pts[0].t;
    for (const b of this.buckets.values()) {
      if (b.t < start || b.t > end + step) continue;
      const p = pts[Math.min(n - 1, Math.floor((b.t - start) / step))];
      p.requests += b.requests;
      p.blocked += b.blocked + b.honeypot;
      p.costNaive += b.costNaive;
      p.costActual += b.costActual;
    }
    return pts;
  }

  lifetime(): Lifetime {
    return { ...this.life };
  }

  snapshot(keepMs = RANGE_MS['30d']): MetricsSnapshot {
    const from = Date.now() - keepMs;
    return { buckets: [...this.buckets.values()].filter((b) => b.t >= from), lifetime: this.life, latencies: this.latencies.slice(-500) };
  }

  /**
   * Demo only: back-fill history by replaying the average of `sample` traces at `perMin`
   * requests/minute with a daily cycle. Lets a fresh demo show a month of charts.
   */
  seedSynthetic(sample: Trace[], perMin: number, days: number, now = Date.now()) {
    if (!sample.length) return;
    const avg = (f: (t: Trace) => number) => sample.reduce((s, t) => s + f(t), 0) / sample.length;
    const share = (st: Trace['status']) => sample.filter((t) => t.status === st).length / sample.length;
    const naive = avg((t) => t.costBaseline);
    const actual = avg((t) => t.costActual);
    const pillar = { security: 0, efficiency: 0, search: 0 };
    for (const t of sample) for (const s of t.spans) {
      const p = NODE_SPECS[s.kind]?.pillar;
      if (p && s.saved) pillar[p === 'core' ? 'efficiency' : p] += s.saved / sample.length;
    }
    const threats: Record<string, number> = {};
    for (const t of sample) if (t.threat) threats[t.threat] = (threats[t.threat] ?? 0) + 1 / sample.length;
    const stepMin = 10;
    for (let t = Math.floor((now - days * 86_400_000) / MIN) * MIN; t < now - 5 * MIN; t += stepMin * MIN) {
      const h = new Date(t).getHours() + new Date(t).getMinutes() / 60;
      const wave = 0.6 + 0.4 * Math.sin(((h - 8) / 24) * Math.PI * 2);
      const noise = 0.85 + ((Math.sin(t / 7_919_000) * 43758.5453) % 1 + 1) % 1 * 0.3;
      const n = Math.round(perMin * stepMin * wave * noise);
      const b = empty(t);
      b.requests = n;
      b.blocked = Math.round(n * share('blocked'));
      b.honeypot = Math.round(n * share('honeypot'));
      b.flagged = Math.round(n * share('flagged'));
      b.cacheHits = Math.round(n * share('cache_hit'));
      b.costNaive = n * naive;
      b.costActual = n * actual;
      b.tokensSaved = n * avg((t) => Math.max(0, t.tokensIn - t.tokensSent));
      b.searchesNaive = n * avg((t) => t.searchRaw);
      b.searchesSent = n * avg((t) => t.searchSent);
      b.pillar = { security: n * pillar.security, efficiency: n * pillar.efficiency, search: n * pillar.search };
      for (const [k, v] of Object.entries(threats)) b.threats[k] = Math.round(n * v);
      this.buckets.set(t, b);
      const L = this.life;
      L.requests += n;
      L.costNaive += b.costNaive;
      L.costActual += b.costActual;
      L.saved += b.costNaive - b.costActual;
      L.blocked += b.blocked + b.honeypot;
      L.cacheHits += b.cacheHits;
      L.searchesAvoided += b.searchesNaive - b.searchesSent;
    }
    this.life.since = now - days * 86_400_000;
    this.latencies.push(...sample.filter((t) => t.status !== 'blocked' && t.status !== 'honeypot').map((t) => t.latency));
  }
}
