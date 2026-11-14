import type { Trace } from '../types';

export type NodeStat = {
  count: number;
  hits: number; // cache hits / blocks / skips — the node's "positive" outcome
  misses: number;
  flagged: number;
  durations: number[];
  saved: number;
  tokensSaved: number;
  callsAvoided: number;
  calls: number;
  series: number[]; // invocations per bucket, oldest → newest
};

const BUCKETS = 24;
const BUCKET_MS = 10_000;

export function computeNodeStats(traces: Trace[]): Record<string, NodeStat> {
  const out: Record<string, NodeStat> = {};
  const now = traces[0]?.ts ?? Date.now();
  for (const tr of traces) {
    const bucket = Math.min(BUCKETS - 1, BUCKETS - 1 - Math.floor((now - tr.ts) / BUCKET_MS));
    for (const s of tr.spans) {
      const st = (out[s.nodeId] ??= { count: 0, hits: 0, misses: 0, flagged: 0, durations: [], saved: 0, tokensSaved: 0, callsAvoided: 0, calls: 0, series: Array(BUCKETS).fill(0) });
      if (s.outcome === 'bypassed') continue;
      st.count++;
      st.durations.push(s.duration);
      st.saved += s.saved;
      if (s.outcome === 'hit' || s.outcome === 'blocked' || s.outcome === 'skipped' || s.outcome === 'redacted') st.hits++;
      if (s.outcome === 'miss') st.misses++;
      if (s.outcome === 'flagged') st.flagged++;
      if (bucket >= 0) st.series[bucket]++;
      if (s.kind === 'compressor') st.tokensSaved += s.tokensSaved ?? 0;
      if (s.kind === 'serpApi') st.calls += tr.searchSent;
      if (s.kind === 'queryOptimizer' || s.kind === 'serpCache' || s.kind === 'searchIntent') {
        if (s.outcome === 'skipped' || s.outcome === 'hit') st.callsAvoided += tr.searchRaw;
        else if (s.kind === 'queryOptimizer') st.callsAvoided += tr.searchRaw - tr.searchSent;
      }
    }
  }
  return out;
}

/** Fraction of the most recent `window` traces that traversed each edge. */
export function computeEdgeShare(traces: Trace[], window = 60): Record<string, number> {
  const recent = traces.slice(0, window);
  const counts: Record<string, number> = {};
  for (const t of recent) for (const e of t.edges) counts[e] = (counts[e] ?? 0) + 1;
  for (const k in counts) counts[k] /= Math.max(1, recent.length);
  return counts;
}
