/** shadcn/ui Chart: Recharts wrapper with theme-aware colors, tooltip and legend (trimmed port). */
import * as React from 'react';
import * as RechartsPrimitive from 'recharts';
import { cn } from '@/lib/utils';

export type ChartConfig = Record<string, { label?: React.ReactNode; icon?: React.ComponentType; color?: string }>;

const ChartContext = React.createContext<{ config: ChartConfig } | null>(null);
function useChart() {
  const c = React.useContext(ChartContext);
  if (!c) throw new Error('useChart must be used within a <ChartContainer />');
  return c;
}

export const ChartContainer = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'> & { config: ChartConfig; children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>['children'] }>(
  ({ id, className, children, config, ...props }, ref) => {
    const uid = React.useId();
    const chartId = `chart-${id || uid.replace(/:/g, '')}`;
    return (
      <ChartContext.Provider value={{ config }}>
        <div
          data-chart={chartId}
          ref={ref}
          className={cn(
            "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-none [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-sector]:outline-none [&_.recharts-surface]:outline-none",
            className,
          )}
          {...props}
        >
          <ChartStyle id={chartId} config={config} />
          <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
        </div>
      </ChartContext.Provider>
    );
  },
);
ChartContainer.displayName = 'Chart';

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
  const colors = Object.entries(config).filter(([, c]) => c.color);
  if (!colors.length) return null;
  return <style dangerouslySetInnerHTML={{ __html: `[data-chart=${id}] {\n${colors.map(([k, c]) => `  --color-${k}: ${c.color};`).join('\n')}\n}` }} />;
};

export const ChartTooltip = RechartsPrimitive.Tooltip;

type TooltipItem = { name?: string; dataKey?: string | number; value?: number | string; color?: string; payload?: Record<string, unknown> };

export const ChartTooltipContent = React.forwardRef<
  HTMLDivElement,
  { active?: boolean; payload?: TooltipItem[]; label?: unknown; className?: string; indicator?: 'line' | 'dot' | 'dashed'; hideLabel?: boolean; labelFormatter?: (label: unknown) => React.ReactNode; valueFormatter?: (v: number) => string }
>(({ active, payload, className, indicator = 'dot', hideLabel = false, label, labelFormatter, valueFormatter }, ref) => {
  const { config } = useChart();
  if (!active || !payload?.length) return null;
  return (
    <div ref={ref} className={cn('grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-popover px-2.5 py-1.5 text-xs shadow-xl', className)}>
      {!hideLabel && <div className="font-medium">{labelFormatter ? labelFormatter(label) : String(label ?? '')}</div>}
      <div className="grid gap-1.5">
        {payload.map((item) => {
          const key = String(item.dataKey ?? item.name ?? 'value');
          const cfg = config[key];
          const color = item.color ?? cfg?.color;
          return (
            <div key={key} className="flex w-full items-center gap-2">
              <div className={cn('shrink-0 rounded-[2px]', indicator === 'dot' ? 'h-2.5 w-2.5' : 'h-2.5 w-1')} style={{ background: color }} />
              <span className="text-muted-foreground">{cfg?.label ?? item.name}</span>
              <span className="ml-auto font-mono font-medium tabular-nums text-foreground">{typeof item.value === 'number' ? (valueFormatter ? valueFormatter(item.value) : item.value.toLocaleString()) : item.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
});
ChartTooltipContent.displayName = 'ChartTooltip';

export const ChartLegend = RechartsPrimitive.Legend;

export const ChartLegendContent = React.forwardRef<HTMLDivElement, { payload?: { value?: string; dataKey?: string; color?: string }[]; className?: string }>(({ payload, className }, ref) => {
  const { config } = useChart();
  if (!payload?.length) return null;
  return (
    <div ref={ref} className={cn('flex items-center justify-center gap-4 pt-3', className)}>
      {payload.map((item) => {
        const key = String(item.dataKey ?? item.value);
        return (
          <div key={key} className="flex items-center gap-1.5 text-muted-foreground">
            <div className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: item.color }} />
            {config[key]?.label ?? item.value}
          </div>
        );
      })}
    </div>
  );
});
ChartLegendContent.displayName = 'ChartLegend';
