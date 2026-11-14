import type { NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { ACCENT, PILLAR } from '../../lib/theme';
import type { LaneNode } from '../../types';

/** Quiet group background, like a sticky note behind a section of a workflow. */
function LaneNodeViewImpl({ data }: NodeProps<LaneNode>) {
  const a = ACCENT[PILLAR[data.pillar].accent];
  return (
    <div className="h-full w-full rounded-xl bg-muted/30">
      <div className="flex items-center gap-2 px-4 pt-3">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: a.fg }} />
        <span className="text-[11px] font-medium text-fg-muted">{data.title}</span>
        <span className="text-[11px] text-fg-subtle">— {data.subtitle}</span>
      </div>
    </div>
  );
}

export const LaneNodeView = memo(LaneNodeViewImpl);
