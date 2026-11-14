import clsx from 'clsx';
import type { ReactNode } from 'react';

export function Toggle({ checked, onChange, color = '#EDEDEF', label }: { checked: boolean; onChange: (v: boolean) => void; color?: string; label?: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={clsx('relative h-[18px] w-8 shrink-0 rounded-full border transition-colors', checked ? 'border-transparent' : 'border-[#2a2a31] bg-white/[0.07]')}
      style={checked ? { background: color } : undefined}
    >
      <span className={clsx('absolute top-[2px] h-3 w-3 rounded-full transition-all', checked ? 'left-[16px] bg-canvas' : 'left-[2px] bg-fg-subtle')} />
    </button>
  );
}

export function Slider({ value, min, max, step, onChange, color }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; color: string }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      className="range w-full"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ background: `linear-gradient(90deg, ${color} ${pct}%, #2A2A32 ${pct}%)`, ['--thumb' as string]: color }}
    />
  );
}

export function Select({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 w-full rounded-lg border border-[#2a2a31] bg-white/[0.025] px-2 text-[12px] text-fg outline-none focus:border-fg-subtle"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

export function Segmented({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="flex rounded-lg border border-[#2a2a31] bg-white/[0.025] p-0.5">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={clsx('flex-1 rounded px-2 py-0.5 text-[11.5px] transition-colors', value === o ? 'bg-white/[0.07] text-fg shadow-sm' : 'text-fg-subtle hover:text-fg-muted')}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-[#2a2a31] bg-white/[0.025] px-1 font-mono text-2xs text-fg-muted">{children}</kbd>;
}

export function Sparkline({ data, color, height = 28, fill = true }: { data: number[]; color: string; height?: number; fill?: boolean }) {
  const w = 100;
  const max = Math.max(1, ...data);
  const pts = data.map((v, i) => [(i / Math.max(1, data.length - 1)) * w, height - 2 - (v / max) * (height - 4)] as const);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="block w-full" style={{ height }} aria-hidden>
      {fill && <path d={`${line} L${w},${height} L0,${height} Z`} fill={color} opacity={0.12} />}
      <path d={line} fill="none" stroke={color} strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
