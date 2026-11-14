/**
 * App-level building blocks composed from shadcn/ui primitives (./button, ./card, ./dialog, …).
 * Pages import from here so they share one look; add new primitives with `npx shadcn add`.
 */
import { Check, Copy, FlaskConical, LoaderCircle, RotateCw } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { mockControls } from '../../api';
import { cn } from '@/lib/utils';
import { Button as UIButton, type ButtonProps as UIButtonProps } from './button';
import { Card as UICard, CardContent, CardHeader, CardTitle } from './card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './dialog';
import { Input } from './input';
import { Label } from './label';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { ToggleGroup, ToggleGroupItem } from './toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

// ---- Buttons ----------------------------------------------------------------------------------

type BtnProps = Omit<UIButtonProps, 'variant' | 'size'> & { variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'; size?: 'sm' | 'md'; loading?: boolean };

const VARIANT = { primary: 'default', secondary: 'secondary', outline: 'outline', ghost: 'ghost', danger: 'destructive' } as const;

export function Button({ variant = 'secondary', size = 'md', loading, className, children, disabled, ...rest }: BtnProps) {
  return (
    <UIButton {...rest} variant={VARIANT[variant]} size="sm" disabled={disabled || loading} className={cn(size === 'sm' ? 'h-7 gap-1.5 px-2.5 text-xs' : 'h-8 gap-1.5 px-3 text-[13px]', '[&_svg]:size-3.5', className)}>
      {loading && <LoaderCircle className="animate-spin" />}
      {children}
    </UIButton>
  );
}

export function IconButton({ label, className, children, ...rest }: Omit<UIButtonProps, 'size'> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <UIButton variant="ghost" size="icon" aria-label={label} className={cn('h-7 w-7 text-muted-foreground [&_svg]:size-3.5', className)} {...rest}>
          {children}
        </UIButton>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <IconButton
      label={done ? 'Copied' : label}
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => {
            setDone(true);
            setTimeout(() => setDone(false), 1400);
          },
          () => {},
        );
      }}
    >
      {done ? <Check className="text-efficiency" /> : <Copy />}
    </IconButton>
  );
}

// ---- Layout -----------------------------------------------------------------------------------

export function PageHeader({ title, subtitle, actions, children }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2 sm:px-6">
      <div className="flex min-w-0 items-baseline gap-2">
        <h1 className="truncate text-sm font-semibold tracking-tight">{title}</h1>
        {subtitle && <span className="truncate text-xs text-muted-foreground">{subtitle}</span>}
      </div>
      {children}
      <div className="ml-auto flex items-center gap-2">
        <DemoBadge />
        {actions}
      </div>
    </header>
  );
}

export function Card({ title, actions, children, className, bodyClassName }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <UICard className={cn('min-w-0 shadow-none', className)}>
      {(title || actions) && (
        <CardHeader className="flex-row items-center space-y-0 px-5 pb-2 pt-4">
          {title && <CardTitle className="text-sm font-medium">{title}</CardTitle>}
          <div className="ml-auto flex items-center gap-1">{actions}</div>
        </CardHeader>
      )}
      <CardContent className={cn('p-5', title && 'pt-2', bodyClassName)}>{children}</CardContent>
    </UICard>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <ToggleGroup type="single" value={value} onValueChange={(v) => v && onChange(v as T)} aria-label={label} className="gap-0.5 rounded-md border bg-muted/40 p-0.5" size="sm">
      {options.map((o) => (
        <ToggleGroupItem key={o.id} value={o.id} className="h-7 px-2.5 text-xs tabular-nums text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm">
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

// ---- States -----------------------------------------------------------------------------------

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground" role="status">
      <LoaderCircle size={15} className="animate-spin" /> {label}…
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <div className="text-sm font-medium">Couldn’t load this</div>
      <div className="max-w-sm text-xs text-muted-foreground">{error.message}</div>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RotateCw /> Retry
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon && <div className="mb-1 grid h-10 w-10 place-items-center rounded-lg border bg-muted text-muted-foreground">{icon}</div>}
      <div className="text-sm font-medium">{title}</div>
      {body && <div className="max-w-sm text-xs leading-relaxed text-muted-foreground">{body}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// ---- Modal (shadcn Dialog) --------------------------------------------------------------------

export function Modal({ open, onClose, title, description, children, footer, width = 440 }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; footer?: ReactNode; width?: number }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent style={{ maxWidth: width }} className="gap-3">
        <DialogHeader>
          <DialogTitle className="text-base">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="text-sm leading-relaxed text-muted-foreground">{children}</div>
        {footer && <DialogFooter className="gap-2 pt-1">{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}

// ---- Form fields ------------------------------------------------------------------------------

export function TextInput({ label, hint, suffix, className, id, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: ReactNode; suffix?: string }) {
  const inputId = id ?? (label ? `f-${label.replace(/\W+/g, '-').toLowerCase()}` : undefined);
  return (
    <div className={cn('grid gap-1.5', className)}>
      {label && (
        <Label htmlFor={inputId} className="text-xs font-normal text-muted-foreground">
          {label}
        </Label>
      )}
      <div className="relative">
        <Input id={inputId} {...rest} className={cn('h-8 text-[13px]', suffix && 'pr-20')} />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>}
      </div>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ---- Demo badge -------------------------------------------------------------------------------

/** Visible only on the mock API: makes it obvious the numbers are simulated, and controls traffic. */
export function DemoBadge() {
  const [rate, setRate] = useState(mockControls?.getRate() ?? 1);
  if (!mockControls) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <UIButton variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs text-security-amber hover:text-security-amber [&_svg]:size-3.5">
          <FlaskConical /> Demo data
        </UIButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 text-xs text-muted-foreground">
        <p className="mb-3 leading-relaxed">
          No backend is connected. Requests run through the real pipeline engine in your browser, with simulated models and search. Set <code className="text-foreground">VITE_API_URL</code> to connect a gateway.
        </p>
        <div className="mb-1.5 text-[11px]">Simulated background traffic</div>
        <Segmented
          label="Simulated traffic rate"
          value={String(rate) as '1' | '2' | '5'}
          options={[
            { id: '1', label: '1×' },
            { id: '2', label: '2×' },
            { id: '5', label: '5×' },
          ]}
          onChange={(v) => {
            mockControls!.setRate(Number(v));
            setRate(Number(v));
          }}
        />
        <UIButton
          variant="link"
          size="sm"
          className="mt-2 h-auto px-0 text-xs text-muted-foreground"
          onClick={() => {
            mockControls!.reset();
            window.location.reload();
          }}
        >
          Reset demo data
        </UIButton>
      </PopoverContent>
    </Popover>
  );
}
