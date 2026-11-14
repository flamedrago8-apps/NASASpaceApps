/** Thin, app-specific wrappers over shadcn/ui primitives (keep call sites terse). */
import type { ReactNode } from 'react';
import { Select as UISelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';
import { Slider as UISlider } from './slider';
import { Switch } from './switch';
import { ToggleGroup, ToggleGroupItem } from './toggle-group';

export function Toggle({ checked, onChange, color, label }: { checked: boolean; onChange: (v: boolean) => void; color?: string; label?: string }) {
  return <Switch checked={checked} onCheckedChange={onChange} aria-label={label} style={checked && color ? { backgroundColor: color } : undefined} />;
}

export function Slider({ value, min, max, step, onChange, color }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; color: string }) {
  return <UISlider value={[value]} min={min} max={max} step={step} onValueChange={([v]) => onChange(v)} rangeStyle={{ backgroundColor: color }} />;
}

export function Select({ value, options, onChange, label }: { value: string; options: string[]; onChange: (v: string) => void; label?: string }) {
  return (
    <UISelect value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 font-mono text-xs" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o} className="font-mono text-xs">
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </UISelect>
  );
}

export function Segmented({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <ToggleGroup type="single" value={value} onValueChange={(v) => v && onChange(v)} className="grid auto-cols-fr grid-flow-col gap-0.5 rounded-md border bg-muted/40 p-0.5" size="sm">
      {options.map((o) => (
        <ToggleGroupItem key={o} value={o} className="h-7 font-mono text-[11px] text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm">
          {o}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-input bg-muted/50 px-1 font-mono text-2xs text-fg-muted">{children}</kbd>;
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
