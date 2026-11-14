import clsx from 'clsx';
import { Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from '../api';
import { LiveTrace, type Filter } from '../components/trace/LiveTrace';
import { Button, PageHeader } from '../components/ui/kit';
import { navigate, type Route } from '../state/router';
import { useToast } from '../state/toast';
import { useTraces } from '../state/traces';
import type { Trace } from '../types';

const VALID: Filter[] = ['all', 'ok', 'cache_hit', 'search', 'flagged', 'blocked'];

export function TracesPage({ route }: { route: Route }) {
  const { traces, live, setLive } = useTraces();
  const toast = useToast();
  const [older, setOlder] = useState<Trace[]>([]);
  const [cursor, setCursor] = useState<number | undefined>(undefined);
  const [exhausted, setExhausted] = useState(false);
  const [loading, setLoading] = useState(false);

  const all = useMemo(() => {
    const seen = new Set<string>();
    return [...traces, ...older].filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
  }, [traces, older]);

  const status = route.query.get('status') as Filter | null;
  const initialFilter = status && VALID.includes(status) ? status : 'all';

  const loadOlder = async () => {
    setLoading(true);
    try {
      const before = cursor ?? all[all.length - 1]?.ts;
      const page = await api.listTraces({ before, limit: 100 });
      setOlder((o) => [...o, ...page.items]);
      setCursor(page.nextBefore);
      if (!page.nextBefore) setExhausted(true);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load traces', 'error');
    } finally {
      setLoading(false);
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `traces-${new Date().toISOString().slice(0, 19).replace(/:/g, '')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Traces"
        subtitle={`${all.length.toLocaleString()} loaded`}
        actions={
          <>
            <button onClick={() => setLive(!live)} className="flex items-center gap-2 px-1 text-[12px] text-fg-muted hover:text-fg" aria-pressed={live}>
              <span className={clsx('h-1.5 w-1.5 rounded-full', live ? 'animate-blink bg-efficiency' : 'bg-fg-subtle')} />
              {live ? 'Live' : 'Paused'}
            </button>
            <Button size="sm" onClick={exportJson}>
              <Download size={13} /> Export JSON
            </Button>
          </>
        }
      />
      <div className="min-h-0 flex-1">
        <LiveTrace
          key={route.query.toString()}
          variant="page"
          traces={all}
          initialFilter={initialFilter}
          initialOpenId={route.query.get('id')}
          onSelectNode={(id) => navigate(`/pipeline?node=${encodeURIComponent(id)}`)}
          footer={
            <div className="flex justify-center py-4">
              {exhausted ? (
                <span className="text-[12px] text-fg-subtle">No older traces</span>
              ) : (
                <Button size="sm" variant="ghost" loading={loading} onClick={loadOlder}>
                  Load older traces
                </Button>
              )}
            </div>
          }
        />
      </div>
    </div>
  );
}
