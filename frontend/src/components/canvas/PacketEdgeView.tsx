import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import { memo } from 'react';
import { useLive } from '../../lib/live';
import type { PacketEdge } from '../../types';

/** Neutral connector; small colored packets show live traffic, the trace path lights up on hover. */
function PacketEdgeViewImpl(props: EdgeProps<PacketEdge>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected } = props;
  const [path, lx, ly] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 18, offset: 24 });
  const { edgeShare, highlight } = useLive();
  const color = data?.color ?? '#A1A1AA';
  const share = edgeShare[id] ?? 0;
  const lit = highlight?.edges.has(id);
  const dimmed = highlight && !lit;
  const packets = share === 0 ? 0 : share > 0.5 ? 2 : 1;
  const dur = 3;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: lit ? color : selected ? '#8a8a94' : '#33333b',
          strokeWidth: lit ? 2 : 1.5,
          opacity: dimmed ? 0.35 : 1,
          transition: 'stroke 160ms, opacity 160ms',
        }}
      />
      {!dimmed &&
        Array.from({ length: packets }, (_, i) => (
          <circle key={i} r={2} fill={color} opacity={0.9}>
            <animateMotion dur={`${dur}s`} repeatCount="indefinite" begin={`${(-i * dur) / packets}s`} path={path} />
          </circle>
        ))}
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute rounded-md bg-canvas px-1.5 py-0.5 text-[10.5px] text-fg-subtle"
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`, opacity: dimmed ? 0.35 : 1, color: lit ? color : undefined }}
          >
            {data.label}
            {share > 0 && <span className="ml-1 tabular-nums opacity-70">{Math.round(share * 100)}%</span>}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const PacketEdgeView = memo(PacketEdgeViewImpl);
