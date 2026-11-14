import type { SpanOutcome, TraceStatus } from '../../types';

const STATUS: Record<TraceStatus, { label: string; color: string; bg: string }> = {
  ok: { label: 'Completed', color: '#EDEDEF', bg: 'rgba(237,237,239,0.06)' },
  cache_hit: { label: 'Cache hit', color: '#34D399', bg: 'rgba(52,211,153,0.10)' },
  blocked: { label: 'Blocked', color: '#F87171', bg: 'rgba(248,113,113,0.10)' },
  flagged: { label: 'Flagged', color: '#FBBF24', bg: 'rgba(251,191,36,0.10)' },
  honeypot: { label: 'Honeypot', color: '#F472B6', bg: 'rgba(244,114,182,0.10)' },
  error: { label: 'Error', color: '#F87171', bg: 'rgba(248,113,113,0.10)' },
};

export function StatusBadge({ status }: { status: TraceStatus }) {
  const s = STATUS[status];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium text-foreground">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: status === 'ok' ? '#34D399' : s.color }} />
      {s.label}
    </span>
  );
}

const OUTCOME: Record<SpanOutcome, { color: string }> = {
  pass: { color: '#9A9AA4' },
  hit: { color: '#34D399' },
  miss: { color: '#63636D' },
  blocked: { color: '#F87171' },
  flagged: { color: '#FBBF24' },
  bypassed: { color: '#63636D' },
  skipped: { color: '#22D3EE' },
  called: { color: '#EDEDEF' },
  redacted: { color: '#A78BFA' },
  trapped: { color: '#F472B6' },
};

export function OutcomeBadge({ outcome }: { outcome: SpanOutcome }) {
  const c = OUTCOME[outcome].color;
  return (
    <span className="inline-block min-w-[58px] rounded border px-1.5 py-px text-center font-mono text-[10px] tracking-wide" style={{ color: c, borderColor: `${c}40` }}>
      {outcome}
    </span>
  );
}
