import { useCallback, useEffect, useRef, useState } from 'react';
import { liveConfigFrom, simulateRequest, type SimOptions } from '../lib/simulator';
import type { AppNode, Trace } from '../types';

const MAX_TRACES = 400;
const SEED = 260;

export type Totals = { requests: number; blocked: number; saved: number; tokensSaved: number; searchAvoided: number; baseline: number };

const add = (t: Totals, x: Trace): Totals => ({
  requests: t.requests + 1,
  blocked: t.blocked + (x.status === 'blocked' ? 1 : 0),
  saved: t.saved + x.saved,
  tokensSaved: t.tokensSaved + (x.status === 'blocked' ? 0 : Math.max(0, x.tokensIn - x.tokensSent + x.searchRaw * 650)),
  searchAvoided: t.searchAvoided + (x.status === 'blocked' ? 0 : x.searchRaw - x.searchSent),
  baseline: t.baseline + (x.status === 'blocked' ? 0 : x.costBaseline),
});

// Pretend the gateway has been up all day so the KPI strip isn't empty on load.
const DAY_BASE: Totals = { requests: 1_284_310, blocked: 2_913, saved: 3_418.55, tokensSaved: 412_800_000, searchAvoided: 61_240, baseline: 7_902.4 };

/**
 * Drives the live trace stream. Reads node configs through a ref so inspector edits
 * take effect on the very next request without restarting the loop.
 */
export function useTrafficSimulator(nodes: AppNode[], running: boolean, rate: number) {
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  const [traces, setTraces] = useState<Trace[]>(() => {
    const live = liveConfigFrom(nodes);
    const now = Date.now();
    return Array.from({ length: SEED }, (_, i) => simulateRequest(live, { ts: now - (i + 1) * 950 - Math.random() * 400 }));
  });
  const [totals, setTotals] = useState<Totals>(() => traces.reduce(add, DAY_BASE));

  const emit = useCallback((opts?: SimOptions) => {
    const tr = simulateRequest(liveConfigFrom(nodesRef.current), opts);
    setTraces((prev) => [tr, ...prev].slice(0, MAX_TRACES));
    setTotals((t) => add(t, tr));
    return tr;
  }, []);

  useEffect(() => {
    if (!running) return;
    let timer: ReturnType<typeof setTimeout>;
    const loop = () => {
      timer = setTimeout(() => {
        emit();
        loop();
      }, (350 + Math.random() * 1000) / rate);
    };
    loop();
    return () => clearTimeout(timer);
  }, [running, rate, emit]);

  return { traces, totals, emit };
}
