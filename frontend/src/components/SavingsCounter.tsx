import { useEffect, useRef, useState } from 'react';
import { api, type Lifetime } from '../api';
import { useTraces } from '../state/traces';
import { Badge } from './ui/badge';
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';

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
      const x = a + (target - a) * (1 - (1 - p) ** 3);
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
 * "Before vs after" savings: lifetime totals plus every live trace as it streams in,
 * so the figure ticks up the moment a request is saved.
 */
export function SavingsCounter() {
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

  const fresh = base ? traces.filter((t) => t.ts > base.at) : [];
  const naive = (base?.life.costNaive ?? 0) + fresh.reduce((s, t) => s + t.costBaseline, 0);
  const actual = (base?.life.costActual ?? 0) + fresh.reduce((s, t) => s + t.costActual, 0);
  const requests = (base?.life.requests ?? 0) + fresh.length;

  const latest = fresh[0];
  useEffect(() => {
    if (latest && latest.saved > 0.00001) {
      setBump({ id: latest.id, amount: latest.saved });
      const t = setTimeout(() => setBump((b) => (b?.id === latest.id ? null : b)), 2500);
      return () => clearTimeout(t);
    }
  }, [latest]);

  const tSaved = useTween(naive - actual);
  const tNaive = useTween(naive);
  const tActual = useTween(actual);
  const pct = naive > 0 ? ((naive - actual) / naive) * 100 : 0;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card className="bg-gradient-to-t from-primary/[0.03] to-card sm:col-span-2">
        <CardHeader className="pb-3">
          <CardDescription>Total saved</CardDescription>
          <CardTitle className="text-3xl font-semibold tabular-nums xl:text-4xl" aria-live="polite">
            {base ? money(tSaved) : '—'}
          </CardTitle>
          <CardAction>
            {bump ? (
              <Badge key={bump.id} variant="outline" className="animate-in fade-in-0 slide-in-from-bottom-1 font-normal text-efficiency">
                +{money(bump.amount)} just now
              </Badge>
            ) : (
              <Badge variant="outline" className="font-normal text-muted-foreground">
                Live
              </Badge>
            )}
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1 text-sm">
          <div className="font-medium">{pct.toFixed(1)}% less than sending the same traffic direct</div>
          <div className="text-muted-foreground">Updates with every request through the gateway</div>
        </CardFooter>
      </Card>
      <Mini label="Without gateway" value={base ? money(tNaive) : '—'} sub="What the same traffic would cost" />
      <Mini label="Actual spend" value={base ? money(tActual) : '—'} sub={`${requests.toLocaleString()} requests`} />
    </div>
  );
}

function Mini({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card className="bg-gradient-to-t from-primary/[0.03] to-card">
      <CardHeader className="pb-3">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardFooter className="text-sm text-muted-foreground">{sub}</CardFooter>
    </Card>
  );
}
