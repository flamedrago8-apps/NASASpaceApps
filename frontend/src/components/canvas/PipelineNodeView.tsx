import { Handle, Position, type NodeProps } from '@xyflow/react';
import clsx from 'clsx';
import { memo } from 'react';
import { CATALOG, type HandleSide } from '../../lib/catalog';
import { fmtMs, fmtNum, fmtPct, fmtUsd, percentile } from '../../lib/format';
import { useLive } from '../../lib/live';
import { NODE_W } from '../../lib/pipeline';
import { ACCENT } from '../../lib/theme';
import type { NodeKind, PipelineNode } from '../../types';
import type { NodeStat } from '../../lib/stats';

const SIDE: Record<HandleSide, Position> = { top: Position.Top, bottom: Position.Bottom, left: Position.Left, right: Position.Right };

function primaryMetric(kind: NodeKind, st: NodeStat | undefined): { label: string; value: string } {
  const c = CATALOG[kind];
  if (!st || !st.count) return { label: c.metric === 'hitRate' ? 'hit rate' : 'events', value: '—' };
  switch (c.metric) {
    case 'blocked':
      return { label: 'blocked', value: fmtNum(st.hits) };
    case 'redacted':
      return { label: 'redacted', value: fmtNum(st.hits) };
    case 'hitRate':
      return { label: 'hit rate', value: fmtPct(st.hits / st.count) };
    case 'tokens':
      return { label: 'tok saved', value: fmtNum(st.tokensSaved) };
    case 'skipped':
      return { label: 'skipped', value: fmtPct(st.hits / st.count) };
    case 'calls':
      return kind === 'serpApi' ? { label: 'calls', value: fmtNum(st.calls) } : { label: 'avoided', value: fmtNum(st.callsAvoided) };
    default:
      return { label: 'requests', value: fmtNum(st.count) };
  }
}

function PipelineNodeViewImpl({ id, data, selected }: NodeProps<PipelineNode>) {
  const c = CATALOG[data.kind];
  const a = ACCENT[c.accent];
  const Icon = c.icon;
  const { nodeStats, lastTrace, highlight, dimPillar } = useLive();
  const st = nodeStats[id];
  const pm = primaryMetric(data.kind, st);
  const p50 = st ? percentile(st.durations, 50) : 0;
  const pulsing = lastTrace?.path.includes(id) && data.enabled;
  const highlighted = highlight?.nodes.has(id);
  const dimmed = (highlight && !highlighted) || (dimPillar && dimPillar !== c.pillar);
  const inputSide = c.input === undefined ? 'left' : c.input;
  const unwired = !(id in CATALOG);

  return (
    <div
      className={clsx('group relative rounded-[10px] border bg-surface-2/95 backdrop-blur transition-[opacity,box-shadow,border-color] duration-200', dimmed && 'opacity-30', !data.enabled && 'opacity-60')}
      style={{
        width: NODE_W,
        borderColor: selected || highlighted ? a.ring : '#2A2A32',
        boxShadow: selected ? `0 0 0 1px ${a.ring}, 0 8px 32px -8px ${a.soft}` : highlighted ? `0 0 24px -6px ${a.ring}` : '0 1px 0 rgba(255,255,255,0.03) inset',
      }}
    >
      {pulsing && <div key={lastTrace!.id} className="pointer-events-none absolute -inset-px animate-pulse-ring rounded-[10px] border" style={{ borderColor: a.fg }} />}
      {/* accent rail */}
      <div className="absolute inset-x-3 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${a.fg}, transparent)`, opacity: data.enabled ? 0.7 : 0.2 }} />

      <div className="flex items-start gap-2.5 px-3 pt-3">
        <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md border" style={{ background: a.soft, borderColor: a.ring.replace('0.45', '0.25'), color: a.fg }}>
          <Icon size={14} strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-medium text-fg">{data.label}</span>
          </div>
          <div className="truncate font-mono text-2xs text-fg-subtle">{c.subtitle}</div>
        </div>
        <span
          className={clsx('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', data.enabled && !unwired && 'animate-blink')}
          style={{ background: !data.enabled ? '#63636D' : unwired ? '#FBBF24' : a.fg }}
          title={!data.enabled ? 'Bypassed' : unwired ? 'Not wired into live traffic' : 'Live'}
        />
      </div>

      <div className="mt-2.5 grid grid-cols-2 border-t border-line font-mono">
        <div className="border-r border-line px-3 py-1.5">
          <div className="text-2xs uppercase tracking-wide text-fg-subtle">{pm.label}</div>
          <div className="text-[12px] tabular-nums text-fg">{data.enabled ? pm.value : 'bypassed'}</div>
        </div>
        <div className="px-3 py-1.5">
          <div className="text-2xs uppercase tracking-wide text-fg-subtle">{st && st.saved > 0.005 ? 'saved' : 'p50'}</div>
          <div className="text-[12px] tabular-nums text-fg">{!st?.count ? '—' : st.saved > 0.005 ? fmtUsd(st.saved) : fmtMs(p50)}</div>
        </div>
      </div>

      {inputSide && <Handle id="in" type="target" position={SIDE[inputSide]} />}
      {c.outputs.out && <Handle id="out" type="source" position={Position.Right} style={{ background: a.fg }} />}
      {c.outputs.alt && <Handle id="alt" type="source" position={SIDE[c.altSide ?? 'bottom']} style={{ background: c.pillar === 'security' ? ACCENT.red.fg : a.fg }} />}
    </div>
  );
}

export const PipelineNodeView = memo(PipelineNodeViewImpl);
