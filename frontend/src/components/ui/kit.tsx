/**
 * App-level building blocks composed from shadcn/ui primitives (./button, ./card, ./dialog, …).
 * Pages import from here so they share one look; add new primitives with `npx shadcn add`.
 */
import { Check, Copy, FlaskConical, LoaderCircle, RotateCw, Search } from 'lucide-react';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { mockControls } from '../../api';
import { cn } from '@/lib/utils';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from './breadcrumb';
import { Button as UIButton, type ButtonProps as UIButtonProps } from './button';
import { Card as UICard, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from './card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './dialog';
import { Input } from './input';
import { Label } from './label';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Separator } from './separator';
import { SidebarTrigger } from './sidebar';
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

/** Lets any page header open the ⌘K command palette. */
export const CommandOpenContext = createContext<() => void>(() => {});

/** shadcn dashboard-01 site header: sidebar trigger · breadcrumb · actions. */
export function PageHeader({ title, subtitle, actions, children }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  const openCommand = useContext(CommandOpenContext);
  return (
    <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2 lg:px-6">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mx-1 h-4" />
      <Breadcrumb className="min-w-0">
        <BreadcrumbList className="flex-nowrap">
          <BreadcrumbItem className="hidden sm:inline-flex">
            <BreadcrumbLink href="#/demo">Tokenomics</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden sm:block" />
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="truncate font-medium">{title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      {subtitle && <span className="hidden truncate text-sm text-muted-foreground lg:inline">· {subtitle}</span>}
      {children}
      <div className="ml-auto flex items-center gap-2">
        <UIButton variant="outline" size="sm" onClick={openCommand} className="hidden h-8 w-48 justify-start gap-2 px-3 font-normal text-muted-foreground shadow-none 2xl:flex">
          <Search className="size-3.5" />
          Search…
          <kbd className="pointer-events-none ml-auto inline-flex h-5 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">⌘K</kbd>
        </UIButton>
        <DemoBadge />
        {actions}
      </div>
    </header>
  );
}

export function Card({ title, description, actions, children, className, bodyClassName }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <UICard className={cn('min-w-0', className)}>
      {(title || actions) && (
        <CardHeader className="px-6 pb-3 pt-5">
          {title && <CardTitle className="text-base font-semibold">{title}</CardTitle>}
          {description && <CardDescription>{description}</CardDescription>}
          {actions && <CardAction className="flex items-center gap-1">{actions}</CardAction>}
        </CardHeader>
      )}
      <CardContent className={cn('px-6 pb-6', !title && 'pt-6', bodyClassName)}>{children}</CardContent>
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
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
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
        <div className="mb-1.5 text-xs">Simulated background traffic</div>
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
