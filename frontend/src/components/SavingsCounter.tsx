import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { api, type Lifetime } from '../api';
import { useTraces } from '../state/traces';

/** Eases a number toward its target so dollar amounts visibly tick up. */
function useTween(target: number, ms = 900) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  const raf = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    cancelAnimationFrame(raf.current);
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      const e = 1 - (1 - p) ** 3;
      const x = a + (target - a) * e;
      setV(x);
      from.current = x;
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [target, ms]);
  return v;
}

const money = (v: number) => (Math.abs(v) < 100 ? `$${v.toFixed(4)}` : `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

/**
 * The big "Before vs After" counter. Starts from the gateway's lifetime totals and adds
 * every live trace as it streams in, so it clicks up the moment a request is saved.
 */
export function SavingsCounter({ compact }: { compact?: boolean }) {
  const { traces } = useTraces();
  const [base, setBase] = useState<{ life: Lifetime; at: number } | null>(null);
  const [bump, setBump] = useState<{ id: string; amount: number } | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => api.getLifetime().then((life) => alive && setBase({ life, at: Date.now() }), () => {});
    load();
    const id = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // Traces that arrived after the last lifetime snapshot.
  const fresh = base ? traces.filter((t) => t.ts > base.at) : [];
  const naive = (base?.life.costNaive ?? 0) + fresh.reduce((s, t) => s + t.costBaseline, 0);
  const actual = (base?.life.costActual ?? 0) + fresh.reduce((s, t) => s + t.costActual, 0);
  const saved = naive - actual;
  const requests = (base?.life.requests ?? 0) + fresh.length;

  const latest = fresh[0];
  useEffect(() => {
    if (latest && latest.saved > 0.00001) {
      setBump({ id: latest.id, amount: latest.saved });
      const t = setTimeout(() => setBump((b) => (b?.id === latest.id ? null : b)), 1600);
      return () => clearTimeout(t);
    }
  }, [latest]);

  const tSaved = useTween(saved);
  const tNaive = useTween(naive);
  const tActual = useTween(actual);
  const pct = naive > 0 ? (saved / naive) * 100 : 0;

  return (
    <div className={clsx('relative overflow-hidden rounded-xl border border-border bg-card', compact ? 'p-4' : 'p-5 sm:p-6')}>
      <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-efficiency/10 blur-3xl" aria-hidden />
      <div className="relative flex flex-wrap items-end gap-x-10 gap-y-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[12px] text-fg-subtle">
            <span className="h-1.5 w-1.5 animate-blink rounded-full bg-efficiency" /> Total dollars saved
          </div>
          <div className="relative mt-1 flex items-baseline gap-3">
            <span className={clsx('font-medium tabular-nums tracking-tight text-efficiency', compact ? 'text-[34px]' : 'text-[44px] sm:text-[56px]')} aria-live="polite">
              {base ? money(tSaved) : '—'}
            </span>
            {bump && (
              <span key={bump.id} className="animate-toast-in rounded-md bg-efficiency/15 px-2 py-0.5 text-[13px] font-medium tabular-nums text-efficiency">
                +{money(bump.amount)}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-8 pb-2">
          <Figure label="Without gateway" value={base ? money(tNaive) : '—'} muted />
          <Figure label="Actual spend" value={base ? money(tActual) : '—'} />
          <Figure label="Cut" value={base ? `${pct.toFixed(1)}%` : '—'} />
          {!compact && <Figure label="Requests" value={base ? requests.toLocaleString() : '—'} />}
        </div>
      </div>
      <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-muted" title={`Actual spend is ${(100 - pct).toFixed(1)}% of what the same traffic would cost without the gateway`}>
        <div className="h-full rounded-full bg-[#059669] transition-[width] duration-700" style={{ width: `${Math.max(0, Math.min(100, 100 - pct))}%` }} />
      </div>
      <div className="relative mt-1.5 flex justify-between text-[11px] text-fg-subtle">
        <span>Actual spend as share of naive spend</span>
        <span className="tabular-nums">{(100 - pct).toFixed(1)}%</span>
      </div>
    </div>
  );
}

function Figure({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <div className="text-[11.5px] text-fg-subtle">{label}</div>
      <div className={clsx('mt-0.5 text-[17px] font-medium tabular-nums', muted ? 'text-fg-muted line-through decoration-fg-subtle/50' : 'text-fg')}>{value}</div>
    </div>
  );
}
