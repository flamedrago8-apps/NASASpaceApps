export function fmtMs(ms: number): string {
  if (ms < 0.1) return '<0.1ms';
  if (ms < 1) return `${ms.toFixed(1)}ms`;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function fmtUsd(v: number): string {
  if (v === 0) return '$0';
  if (Math.abs(v) < 1) return `$${v.toFixed(4)}`;
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtNum(v: number): string {
  return new Intl.NumberFormat('en-US', { notation: v >= 10_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(v);
}

export function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

export function fmtTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}
