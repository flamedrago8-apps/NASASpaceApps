import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../api';
import type { Trace } from '../types';

const MAX = 500;

type TraceStore = {
  traces: Trace[];
  live: boolean;
  setLive: (v: boolean) => void;
  connected: boolean;
  /** Insert a trace we already have (e.g. the result of a test request) without waiting for the stream. */
  add: (t: Trace) => void;
};

const Ctx = createContext<TraceStore | null>(null);

export function useTraces() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTraces must be used inside <TraceProvider>');
  return v;
}

/** One shared live trace buffer for every page: initial page from listTraces, then the stream. */
export function TraceProvider({ children }: { children: ReactNode }) {
  const [traces, setTraces] = useState<Trace[]>([]);
  const [live, setLive] = useState(true);
  const [connected, setConnected] = useState(false);

  const add = useCallback((t: Trace) => {
    setTraces((prev) => (prev.some((x) => x.id === t.id) ? prev : [t, ...prev].slice(0, MAX)));
  }, []);

  useEffect(() => {
    api
      .listTraces({ limit: 300 })
      .then((p) => setTraces((prev) => mergeById([...prev, ...p.items]).slice(0, MAX)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!live) return;
    setConnected(true);
    const stop = api.streamTraces(add, () => setConnected(false));
    return () => {
      stop();
      setConnected(false);
    };
  }, [live, add]);

  return <Ctx.Provider value={{ traces, live, setLive, connected, add }}>{children}</Ctx.Provider>;
}

function mergeById(list: Trace[]): Trace[] {
  const seen = new Set<string>();
  return list.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true))).sort((a, b) => b.ts - a.ts);
}
