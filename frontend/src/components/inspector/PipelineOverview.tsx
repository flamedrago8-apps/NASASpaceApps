import { MousePointerClick } from 'lucide-react';
import { CATALOG } from '../../lib/catalog';
import { fmtNum, fmtPct, fmtUsd } from '../../lib/format';
import type { NodeStat } from '../../lib/stats';
import { ACCENT, PILLAR } from '../../lib/theme';
import type { AppNode, NodeKind, Pillar, Trace } from '../../types';
import { Toggle } from '../ui/controls';

type Props = {
  nodes: AppNode[];
  nodeStats: Record<string, NodeStat>;
  traces: Trace[];
  onSelect: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
};

export function PipelineOverview({ nodes, nodeStats, traces, onSelect, onToggle }: Props) {
  const pillars: Exclude<Pillar, 'core'>[] = ['security', 'efficiency', 'search'];
  const n = Math.max(1, traces.length);
  const blocked = traces.filter((t) => t.status === 'blocked').length;
  const leaked = traces.filter((t) => t.leakedThreat).length;
  const hits = traces.filter((t) => t.status === 'cache_hit').length;
  const effSaved = sumSaved(nodeStats, ['exactCache', 'semanticCache', 'compressor']);
  const serpRaw = traces.reduce((s, t) => s + t.searchRaw, 0);
  const serpSent = traces.reduce((s, t) => s + t.searchSent, 0);
  const serpSaved = sumSaved(nodeStats, ['searchIntent', 'serpCache', 'queryOptimizer']);

  const summary: Record<string, { k: string; v: string; warn?: boolean }[]> = {
    security: [
      { k: 'Blocked', v: `${blocked} · ${fmtPct(blocked / n)}` },
      { k: 'Undetected attacks', v: String(leaked), warn: leaked > 0 },
    ],
    efficiency: [
      { k: 'Cache hit rate', v: fmtPct(hits / n) },
      { k: 'Saved', v: fmtUsd(effSaved) },
    ],
    search: [
      { k: 'SerpAPI calls', v: `${fmtNum(serpSent)} / ${fmtNum(serpRaw)} naive` },
      { k: 'Saved', v: fmtUsd(serpSaved) },
    ],
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-4 py-3.5">
        <div className="text-[14px] font-medium text-fg">Pipeline · chat-default</div>
        <div className="mt-0.5 text-[12px] text-fg-subtle">Rolling window of the last {traces.length} requests</div>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {pillars.map((p) => {
          const a = ACCENT[PILLAR[p].accent];
          const pn = nodes.filter((x) => x.type === 'pipeline' && CATALOG[x.data.kind].pillar === p && x.data.kind !== 'block');
          return (
            <section key={p} className="overflow-hidden rounded-lg border border-line bg-surface-2">
              <div className="flex items-center gap-2 border-b border-line px-3 py-2">
                <span className="h-2 w-2 rounded-[3px]" style={{ background: a.fg }} />
                <span className="text-[12px] font-medium text-fg">{PILLAR[p].label}</span>
              </div>
              <div className="grid grid-cols-2 gap-px bg-line">
                {summary[p].map((m) => (
                  <div key={m.k} className="bg-surface-2 px-3 py-2">
                    <div className="text-2xs text-fg-subtle">{m.k}</div>
                    <div className="font-mono text-[12px] tabular-nums" style={{ color: m.warn ? ACCENT.amber.fg : '#EDEDEF' }}>
                      {m.v}
                    </div>
                  </div>
                ))}
              </div>
              <ul className="border-t border-line py-1">
                {pn.map((x) => {
                  if (x.type !== 'pipeline') return null;
                  const c = CATALOG[x.data.kind];
                  const Icon = c.icon;
                  return (
                    <li key={x.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-surface-3">
                      <button onClick={() => onSelect(x.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left text-[12px] text-fg-muted hover:text-fg">
                        <Icon size={13} style={{ color: ACCENT[c.accent].fg }} />
                        <span className="truncate">{x.data.label}</span>
                      </button>
                      <Toggle checked={x.data.enabled} onChange={(v) => onToggle(x.id, v)} color={ACCENT[c.accent].fg} label={`Enable ${x.data.label}`} />
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
        <div className="flex items-start gap-2 rounded-lg border border-dashed border-line-strong px-3 py-2.5 text-[12px] leading-relaxed text-fg-subtle">
          <MousePointerClick size={14} className="mt-0.5 shrink-0" />
          Select a node to tune thresholds. Changes apply to simulated traffic instantly; hit Deploy to ship them.
        </div>
      </div>
    </div>
  );
}

function sumSaved(stats: Record<string, NodeStat>, ids: NodeKind[]) {
  return ids.reduce((s, id) => s + Math.max(0, stats[id]?.saved ?? 0), 0);
}
