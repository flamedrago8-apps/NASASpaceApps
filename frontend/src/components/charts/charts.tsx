import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** Chart palette — validated for the dark surface (#0A0A0C): lightness band, CVD + normal-vision separation, contrast. */
export const CHART = {
  security: '#8B5CF6',
  efficiency: '#059669',
  search: '#0284C7',
  neutral: '#71717A',
  grid: '#1c1c21',
  surface: '#0f0f12',
};

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    setW(ref.current.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const left = Math.min(Math.max(8, x + 12), width - 188);
  return (
    <div className="pointer-events-none absolute z-10 w-44 rounded-lg border border-input bg-popover px-2.5 py-2 text-[11.5px] shadow-xl shadow-black/50" style={{ left, top: Math.max(0, y) }}>
      {children}
    </div>
  );
}

export function LegendKey({ color, label, shape = 'line' }: { color: string; label: string; shape?: 'line' | 'rect' }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] text-fg-muted">
      <span className={shape === 'line' ? 'h-[2px] w-3 rounded-full' : 'h-2.5 w-2.5 rounded-[3px]'} style={{ background: color }} />
      {label}
    </span>
  );
}

// ---- Line chart -----------------------------------------------------------------------------

export type LineSeries = { id: string; label: string; color: string; values: number[] };

export function LineChart({ x, series, fmtX, fmtY, height = 220, shadeBetween }: { x: number[]; series: LineSeries[]; fmtX: (t: number) => string; fmtY: (v: number) => string; height?: number; shadeBetween?: [string, string] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 52, r: 16, t: 8, b: 22 };
  const iw = width - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)) * 1.08);
  const xs = (i: number) => pad.l + (x.length < 2 ? iw / 2 : (i / (x.length - 1)) * iw);
  const ys = (v: number) => pad.t + ih - (v / max) * ih;
  const path = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${xs(i).toFixed(1)},${ys(v).toFixed(1)}`).join('');
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const xTicks = !x.length ? [] : width < 480 ? [0, x.length - 1] : [0, Math.floor((x.length - 1) / 3), Math.floor(((x.length - 1) * 2) / 3), x.length - 1];

  let band: string | null = null;
  if (shadeBetween) {
    const a = series.find((s) => s.id === shadeBetween[0]);
    const b = series.find((s) => s.id === shadeBetween[1]);
    if (a && b && a.values.length > 1) {
      const back = b.values.map((_, i) => b.values.length - 1 - i).map((i) => `L${xs(i).toFixed(1)},${ys(b.values[i]).toFixed(1)}`).join('');
      band = `${path(a.values)}${back}Z`;
    }
  }

  return (
    <div ref={ref} className="relative w-full min-w-0" style={{ height }} onPointerLeave={() => setHover(null)}>
      {width > 0 && (
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Line chart: ${series.map((s) => s.label).join(', ')}`}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const rel = (e.clientX - r.left - pad.l) / iw;
          setHover(Math.max(0, Math.min(x.length - 1, Math.round(rel * (x.length - 1)))));
        }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={ys(t)} y2={ys(t)} stroke={CHART.grid} />
            <text x={pad.l - 8} y={ys(t)} dy="0.32em" textAnchor="end" className="fill-fg-subtle text-[10.5px] tabular-nums">
              {fmtY(t)}
            </text>
          </g>
        ))}
        {xTicks.map((i, k) => (
          <text key={k} x={xs(i)} y={height - 6} textAnchor={k === 0 ? 'start' : k === xTicks.length - 1 ? 'end' : 'middle'} className="fill-fg-subtle text-[10.5px]">
            {fmtX(x[i])}
          </text>
        ))}
        {band && <path d={band} fill={CHART.efficiency} opacity={0.14} />}
        {x.length > 0 && series.map((s) => (
          <path key={s.id} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {hover !== null && (
          <g>
            <line x1={xs(hover)} x2={xs(hover)} y1={pad.t} y2={pad.t + ih} stroke="#3a3a44" />
            {series.map((s) => (
              <circle key={s.id} cx={xs(hover)} cy={ys(s.values[hover])} r={4} fill={s.color} stroke={CHART.surface} strokeWidth={2} />
            ))}
          </g>
        )}
      </svg>
      )}
      {hover !== null && (
        <Tooltip x={xs(hover)} y={pad.t} width={width}>
          <div className="mb-1 text-fg-subtle">{fmtX(x[hover])}</div>
          {series.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <span className="h-[2px] w-2.5 rounded-full" style={{ background: s.color }} />
              <span className="font-medium tabular-nums text-fg">{fmtY(s.values[hover])}</span>
              <span className="truncate text-fg-subtle">{s.label}</span>
            </div>
          ))}
        </Tooltip>
      )}
    </div>
  );
}

// ---- Column chart (single series) -----------------------------------------------------------

export function ColumnChart({ x, values, color, label, fmtX, fmtY, height = 180 }: { x: number[]; values: number[]; color: string; label: string; fmtX: (t: number) => string; fmtY: (v: number) => string; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 44, r: 8, t: 8, b: 22 };
  const iw = width - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const max = niceMax(Math.max(0, ...values) * 1.05);
  const slot = iw / Math.max(1, values.length);
  const bw = Math.max(1, slot - 2);
  const ys = (v: number) => pad.t + ih - (v / max) * ih;
  const ticks = [0, 0.5, 1].map((f) => f * max);
  const xTicks = !x.length ? [] : width < 480 ? [0, x.length - 1] : [0, Math.floor((x.length - 1) / 2), x.length - 1];

  return (
    <div ref={ref} className="relative w-full min-w-0" style={{ height }} onPointerLeave={() => setHover(null)}>
      {width > 0 && (
      <svg width={width} height={height} role="img" aria-label={`Column chart: ${label}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={ys(t)} y2={ys(t)} stroke={CHART.grid} />
            <text x={pad.l - 8} y={ys(t)} dy="0.32em" textAnchor="end" className="fill-fg-subtle text-[10.5px] tabular-nums">
              {fmtY(t)}
            </text>
          </g>
        ))}
        {values.map((v, i) => {
          const x0 = pad.l + i * slot + 1;
          const y0 = ys(v);
          const h = pad.t + ih - y0;
          const r = Math.min(4, bw / 2, h);
          return (
            <g key={i} onPointerEnter={() => setHover(i)}>
              <rect x={pad.l + i * slot} y={pad.t} width={slot} height={ih} fill="transparent" />
              <path
                d={`M${x0},${pad.t + ih} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + bw - r} Q${x0 + bw},${y0} ${x0 + bw},${y0 + r} V${pad.t + ih} Z`}
                fill={color}
                opacity={hover === null || hover === i ? 1 : 0.55}
              />
            </g>
          );
        })}
        {xTicks.map((i, k) => (
          <text key={k} x={pad.l + i * slot + slot / 2} y={height - 6} textAnchor={k === 0 ? 'start' : k === xTicks.length - 1 ? 'end' : 'middle'} className="fill-fg-subtle text-[10.5px]">
            {fmtX(x[i])}
          </text>
        ))}
      </svg>
      )}
      {hover !== null && (
        <Tooltip x={pad.l + hover * slot + slot / 2} y={pad.t} width={width}>
          <div className="mb-1 text-fg-subtle">{fmtX(x[hover])}</div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-[2px]" style={{ background: color }} />
            <span className="font-medium tabular-nums text-fg">{fmtY(values[hover])}</span>
            <span className="text-fg-subtle">{label}</span>
          </div>
        </Tooltip>
      )}
    </div>
  );
}

// ---- Horizontal bars with direct labels -----------------------------------------------------

export function BarList({ items, fmt }: { items: { id: string; label: string; value: number; color: string; sub?: string }[]; fmt: (v: number) => string }) {
  const max = Math.max(1e-9, ...items.map((i) => i.value));
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i.id} title={`${i.label}: ${fmt(i.value)}`}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[12px]">
            <span className="text-fg-muted">{i.label}</span>
            <span className="tabular-nums text-fg">
              {fmt(i.value)}
              {i.sub && <span className="ml-1.5 text-fg-subtle">{i.sub}</span>}
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(1.5, (i.value / max) * 100)}%`, background: i.color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---- Table view (accessible fallback for every chart) ---------------------------------------

export function DataTable({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  return (
    <div className="max-h-[240px] overflow-auto rounded-lg border border-border">
      <table className="w-full text-left text-[12px]">
        <thead className="sticky top-0 bg-popover text-fg-subtle">
          <tr>
            {columns.map((c, i) => (
              <th key={c} className={`px-3 py-1.5 font-normal ${i ? 'text-right' : ''}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border">
              {r.map((c, j) => (
                <td key={j} className={`px-3 py-1.5 tabular-nums ${j ? 'text-right text-fg' : 'text-fg-muted'}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
