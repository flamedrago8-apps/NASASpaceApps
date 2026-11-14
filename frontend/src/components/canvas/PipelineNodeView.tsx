import { Handle, Position, type NodeProps } from '@xyflow/react';
import clsx from 'clsx';
import { memo } from 'react';
import { CATALOG, type HandleSide } from '../../lib/catalog';
import { fmtMs, fmtNum, fmtPct, fmtUsd, percentile } from '../../lib/format';
import { useLive } from '../../lib/live';
import { NODE_H, NODE_W } from '../../lib/pipeline';
import type { NodeStat } from '../../lib/stats';
import { ACCENT } from '../../lib/theme';
import type { NodeKind, PipelineNode } from '../../types';

const SIDE: Record<HandleSide, Position> = { top: Position.Top, bottom: Position.Bottom, left: Position.Left, right: Position.Right };

function metricLine(kind: NodeKind, st: NodeStat | undefined): string {
  const c = CATALOG[kind];
  if (!st || !st.count) return c.subtitle;
  const parts: string[] = [];
  switch (c.metric) {
    case 'blocked':
      parts.push(`${fmtNum(st.hits)} blocked`);
      break;
    case 'redacted':
      parts.push(`${fmtNum(st.hits)} swapped`);
      break;
    case 'trapped':
      parts.push(`${fmtNum(st.count)} trapped`);
      break;
    case 'hitRate':
      parts.push(`${fmtPct(st.hits / st.count)} hit`);
      break;
    case 'tokens':
      parts.push(`${fmtNum(st.tokensSaved)} tok saved`);
      break;
    case 'skipped':
      parts.push(`${fmtPct(st.hits / st.count)} skipped`);
      break;
    case 'calls':
      parts.push(kind === 'serpApi' ? `${fmtNum(st.calls)} calls` : `${fmtNum(st.callsAvoided)} avoided`);
      break;
    default:
      parts.push(`${fmtNum(st.count)} req`);
  }
  parts.push(st.saved > 0.005 ? fmtUsd(st.saved) : fmtMs(percentile(st.durations, 50)));
  return parts.join(' · ');
}

function PipelineNodeViewImpl({ id, data, selected }: NodeProps<PipelineNode>) {
  const c = CATALOG[data.kind];
  const a = ACCENT[c.accent];
  const Icon = c.icon;
  const { nodeStats, lastTrace, highlight } = useLive();
  const st = nodeStats[id];
  const pulsing = data.enabled && lastTrace?.path.includes(id);
  const lit = highlight?.nodes.has(id);
  const dimmed = highlight && !lit;
  const inputSide = c.input === undefined ? 'left' : c.input;
  const unwired = !(id in CATALOG);
  // When the focused trace skipped live search, grey out the search nodes it never touched.
  const searchBypassed = !!highlight && !lit && c.pillar === 'search' && data.kind !== 'searchIntent' && !!lastFocusBypassed(highlight);

  return (
    <div
      className={clsx(
        'group relative flex items-center gap-2.5 rounded-xl border bg-[#141417] pl-2 pr-3 transition-[opacity,border-color,box-shadow] duration-200',
        dimmed && !searchBypassed && 'opacity-35',
        searchBypassed && 'border-dashed !border-[#3a3a44] opacity-60 grayscale',
        !data.enabled && 'opacity-50',
        selected ? 'border-fg/70' : lit ? 'border-fg/35' : 'border-[#26262c] hover:border-[#3a3a44]',
      )}
      style={{ width: NODE_W, height: NODE_H, boxShadow: selected ? '0 0 0 3px rgba(237,237,239,0.08)' : undefined }}
    >
      {pulsing && <div key={lastTrace!.id} className="pointer-events-none absolute -inset-px animate-pulse-ring rounded-xl border" style={{ borderColor: a.ring }} />}

      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px]" style={{ background: a.soft, color: a.fg }}>
        <Icon size={17} strokeWidth={1.9} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] font-medium leading-tight text-fg">{data.label}</div>
        <div className="mt-0.5 truncate text-[11px] leading-tight text-fg-subtle">{searchBypassed ? 'Bypassed — internal knowledge sufficient' : data.enabled ? metricLine(data.kind, st) : 'Bypassed'}</div>
      </div>
      {(unwired || !data.enabled) && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: unwired ? ACCENT.amber.fg : '#4a4a52' }} title={unwired ? 'Not wired into live traffic' : 'Bypassed'} />}

      {inputSide && <Handle id="in" type="target" position={SIDE[inputSide]} />}
      {c.outputs.out && <Handle id="out" type="source" position={Position.Right} />}
      {c.outputs.alt && <Handle id="alt" type="source" position={SIDE[c.altSide ?? 'bottom']} />}
    </div>
  );
}

/** The highlight set carries the trace's path; search was bypassed if it went straight from the router to the LLM. */
const lastFocusBypassed = (h: { nodes: Set<string>; edges: Set<string> }) => h.edges.has('searchIntent->llm');

export const PipelineNodeView = memo(PipelineNodeViewImpl);
