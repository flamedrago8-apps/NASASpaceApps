import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import { memo } from 'react';
import { useLive } from '../../lib/live';
import type { PacketEdge } from '../../types';

/** Smooth-step edge with animated "packets" whose density follows the live traffic share. */
function PacketEdgeViewImpl(props: EdgeProps<PacketEdge>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd, selected } = props;
  const [path, lx, ly] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 14, offset: 22 });
  const { edgeShare, highlight } = useLive();
  const color = data?.color ?? '#A1A1AA';
  const share = edgeShare[id] ?? 0;
  const lit = highlight?.edges.has(id);
  const dimmed = highlight && !lit;
  const packets = share === 0 ? 0 : share > 0.6 ? 3 : share > 0.2 ? 2 : 1;
  const dur = 2.6;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: lit || selected ? color : share > 0 ? `${color}55` : '#2A2A32',
          strokeWidth: lit || selected ? 2 : 1 + Math.min(1, share * 1.5),
          opacity: dimmed ? 0.25 : 1,
          transition: 'stroke 200ms, opacity 200ms',
        }}
      />
      {!dimmed &&
        Array.from({ length: packets }, (_, i) => (
          <circle key={i} r={2.4} fill={color} style={{ filter: `drop-shadow(0 0 3px ${color})` }}>
            <animateMotion dur={`${dur}s`} repeatCount="indefinite" begin={`${(-i * dur) / packets}s`} path={path} />
          </circle>
        ))}
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute rounded border border-line-strong bg-canvas px-1.5 py-px font-mono text-2xs"
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`, color, opacity: dimmed ? 0.3 : 1 }}
          >
            {data.label}
            {share > 0 && <span className="ml-1 text-fg-subtle">{Math.round(share * 100)}%</span>}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const PacketEdgeView = memo(PacketEdgeViewImpl);
