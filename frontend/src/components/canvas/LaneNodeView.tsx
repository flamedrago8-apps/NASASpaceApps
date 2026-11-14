import type { NodeProps } from '@xyflow/react';
import clsx from 'clsx';
import { memo } from 'react';
import { useLive } from '../../lib/live';
import { ACCENT, PILLAR } from '../../lib/theme';
import type { LaneNode } from '../../types';

function LaneNodeViewImpl({ data }: NodeProps<LaneNode>) {
  const a = ACCENT[PILLAR[data.pillar].accent];
  const { dimPillar } = useLive();
  return (
    <div
      className={clsx('h-full w-full rounded-xl border border-dashed transition-opacity', dimPillar && dimPillar !== data.pillar && 'opacity-30')}
      style={{ borderColor: a.ring.replace('0.45', '0.22'), background: `linear-gradient(180deg, ${a.soft.replace('0.10', '0.045')}, transparent 70%)` }}
    >
      <div className="flex items-center gap-2 px-3.5 pt-2.5">
        <span className="h-2 w-2 rounded-[3px]" style={{ background: a.fg }} />
        <span className="text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: a.fg }}>
          {data.title}
        </span>
        <span className="text-[11px] text-fg-subtle">{data.subtitle}</span>
      </div>
    </div>
  );
}

export const LaneNodeView = memo(LaneNodeViewImpl);
