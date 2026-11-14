import clsx from 'clsx';
import { Check, Copy, FlaskConical, LoaderCircle, RotateCw, X } from 'lucide-react';
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { mockControls } from '../../api';

// ---- Buttons ----------------------------------------------------------------------------------

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md'; loading?: boolean };

export function Button({ variant = 'secondary', size = 'md', loading, className, children, disabled, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' ? 'h-7 px-2.5 text-[12px]' : 'h-8 px-3.5 text-[12.5px]',
        variant === 'primary' && 'bg-fg text-canvas hover:bg-white',
        variant === 'secondary' && 'bg-white/[0.06] text-fg-muted hover:bg-white/[0.09] hover:text-fg',
        variant === 'ghost' && 'text-fg-muted hover:bg-white/[0.05] hover:text-fg',
        variant === 'danger' && 'bg-danger/15 text-danger hover:bg-danger/25',
        className,
      )}
    >
      {loading && <LoaderCircle size={13} className="animate-spin" />}
      {children}
    </button>
  );
}

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button {...rest} aria-label={label} title={label} className={clsx('grid h-7 w-7 place-items-center rounded-lg text-fg-subtle hover:bg-white/[0.06] hover:text-fg', className)}>
      {children}
    </button>
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
      {done ? <Check size={14} className="text-efficiency" /> : <Copy size={13} />}
    </IconButton>
  );
}

// ---- Layout -----------------------------------------------------------------------------------

export function PageHeader({ title, subtitle, actions, children }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-[#1c1c21] px-4 py-2 sm:px-5">
      <div className="flex min-w-0 items-baseline gap-2">
        <h1 className="truncate text-[13.5px] font-medium text-fg">{title}</h1>
        {subtitle && <span className="truncate text-[12px] text-fg-subtle">{subtitle}</span>}
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
    <section className={clsx('min-w-0 rounded-2xl border border-[#1f1f25] bg-[#0f0f12]', className)}>
      {(title || actions) && (
        <div className="flex items-center gap-2 px-4 pb-1 pt-3.5">
          {title && <h2 className="text-[12.5px] font-medium text-fg">{title}</h2>}
          <div className="ml-auto flex items-center gap-1">{actions}</div>
        </div>
      )}
      <div className={clsx('p-4', title && 'pt-2', bodyClassName)}>{children}</div>
    </section>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex h-8 items-center rounded-lg bg-white/[0.04] p-0.5">
      {options.map((o) => (
        <button key={o.id} role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)} className={clsx('h-full rounded-md px-2.5 text-[12px] tabular-nums transition-colors', value === o.id ? 'bg-white/[0.09] text-fg' : 'text-fg-subtle hover:text-fg-muted')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---- States -----------------------------------------------------------------------------------

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-[12px] text-fg-subtle" role="status">
      <LoaderCircle size={15} className="animate-spin" /> {label}…
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <div className="text-[13px] text-fg">Couldn’t load this</div>
      <div className="max-w-sm text-[12px] text-fg-subtle">{error.message}</div>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          <RotateCw size={12} /> Retry
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon && <div className="mb-1 grid h-10 w-10 place-items-center rounded-xl bg-white/[0.05] text-fg-muted">{icon}</div>}
      <div className="text-[13px] font-medium text-fg">{title}</div>
      {body && <div className="max-w-sm text-[12px] leading-relaxed text-fg-subtle">{body}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// ---- Modal ------------------------------------------------------------------------------------

export function Modal({ open, onClose, title, children, footer, width = 440 }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('input, button, select, textarea')?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="w-full animate-toast-in rounded-2xl border border-[#2a2a31] bg-[#121215] shadow-2xl shadow-black/70" style={{ maxWidth: width }}>
        <div className="flex items-center px-5 pb-2 pt-4">
          <h2 className="text-[14px] font-medium text-fg">{title}</h2>
          <IconButton label="Close" onClick={onClose} className="ml-auto">
            <X size={15} />
          </IconButton>
        </div>
        <div className="px-5 pb-4 text-[12.5px] leading-relaxed text-fg-muted">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-[#1f1f25] px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

// ---- Form fields ------------------------------------------------------------------------------

export function TextInput({ label, hint, suffix, className, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: ReactNode; suffix?: string }) {
  return (
    <label className={clsx('block', className)}>
      {label && <span className="mb-1.5 block text-[12px] text-fg-muted">{label}</span>}
      <span className="flex h-8 items-center rounded-lg border border-[#2a2a31] bg-white/[0.025] focus-within:border-fg-subtle">
        <input {...rest} className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-[12.5px] text-fg outline-none placeholder:text-fg-subtle" />
        {suffix && <span className="pr-2.5 text-[11.5px] text-fg-subtle">{suffix}</span>}
      </span>
      {hint && <span className="mt-1 block text-[11px] text-fg-subtle">{hint}</span>}
    </label>
  );
}

// ---- Demo badge -------------------------------------------------------------------------------

/** Visible only on the mock API: makes it obvious the numbers are simulated, and controls traffic. */
export function DemoBadge() {
  const [open, setOpen] = useState(false);
  const [rate, setRate] = useState(mockControls?.getRate() ?? 1);
  if (!mockControls) return null;
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11.5px] text-security-amber/90 hover:bg-white/[0.05]" aria-expanded={open}>
        <FlaskConical size={13} /> Demo data
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-50 w-64 rounded-xl border border-[#2a2a31] bg-[#141417] p-3 text-[12px] text-fg-muted shadow-2xl shadow-black/60">
          <p className="mb-3 leading-relaxed">No backend is connected. Traffic, metrics and saved changes are simulated in your browser. Set <code className="text-fg">VITE_API_URL</code> to connect a real gateway.</p>
          <div className="mb-1.5 text-[11px] text-fg-subtle">Simulated traffic</div>
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
          <button
            onClick={() => {
              mockControls!.reset();
              window.location.reload();
            }}
            className="mt-3 text-[11.5px] text-fg-subtle underline-offset-2 hover:text-fg hover:underline"
          >
            Reset demo data
          </button>
        </div>
      )}
    </div>
  );
}
