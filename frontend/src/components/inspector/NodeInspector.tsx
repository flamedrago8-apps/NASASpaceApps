import clsx from 'clsx';
import { Copy, Trash2, X } from 'lucide-react';
import { CATALOG, type Field } from '../../lib/catalog';
import { fmtMs, fmtNum, fmtPct, fmtUsd, percentile } from '../../lib/format';
import type { NodeStat } from '../../lib/stats';
import { ACCENT, PILLAR } from '../../lib/theme';
import type { ConfigValue, PipelineNode, Trace } from '../../types';
import { Segmented, Select, Slider, Sparkline, Toggle } from '../ui/controls';
import { OutcomeBadge } from '../trace/badges';

type Props = {
  node: PipelineNode;
  stats: NodeStat | undefined;
  traces: Trace[];
  onChange: (patch: { enabled?: boolean; config?: Record<string, ConfigValue> }) => void;
  onClose: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
};

export function NodeInspector({ node, stats, traces, onChange, onClose, onDelete, onDuplicate }: Props) {
  const c = CATALOG[node.data.kind];
  const a = ACCENT[c.accent];
  const Icon = c.icon;
  const wired = node.id in CATALOG;
  const recent = traces
    .flatMap((t) => t.spans.filter((s) => s.nodeId === node.id && s.outcome !== 'bypassed').map((s) => ({ t, s })))
    .slice(0, 6);

  const hitLabel: Record<string, string> = { blocked: 'Block rate', hitRate: 'Hit rate', skipped: 'Skip rate', redacted: 'PII rate' };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start gap-3 border-b border-line px-4 py-3.5">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border" style={{ background: a.soft, borderColor: a.ring.replace('0.45', '0.3'), color: a.fg }}>
          <Icon size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-medium text-fg">{node.data.label}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-2xs">
            <span className="rounded px-1.5 py-px font-medium" style={{ background: ACCENT[PILLAR[c.pillar].accent].soft, color: ACCENT[PILLAR[c.pillar].accent].fg }}>
              {PILLAR[c.pillar].label}
            </span>
            <span className="font-mono text-fg-subtle">id: {node.id}</span>
          </div>
        </div>
        <button onClick={onClose} className="rounded p-1 text-fg-subtle hover:bg-surface-3 hover:text-fg" aria-label="Close inspector">
          <X size={15} />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <p className="text-[12px] leading-relaxed text-fg-muted">{c.description}</p>

        {!wired && (
          <div className="rounded-md border border-security-amber/30 bg-security-amber/5 px-3 py-2 text-[12px] text-security-amber">
            This node isn’t in the live route yet. Connect its handles to start receiving traffic.
          </div>
        )}

        <div className="flex items-center justify-between rounded-lg border border-line bg-surface-2 px-3 py-2.5">
          <div>
            <div className="text-[12px] font-medium text-fg">{node.data.enabled ? 'Enabled' : 'Bypassed'}</div>
            <div className="text-2xs text-fg-subtle">{node.data.enabled ? 'Processing live traffic' : 'Payloads pass straight through'}</div>
          </div>
          <Toggle checked={node.data.enabled} onChange={(v) => onChange({ enabled: v })} color={a.fg} label="Enable node" />
        </div>

        {/* Config */}
        {c.fields.length > 0 && (
          <section>
            <SectionTitle>Configuration</SectionTitle>
            <div className="space-y-3.5">
              {c.fields.map((f) => (
                <FieldRow key={f.key} field={f} value={node.data.config[f.key]} color={a.fg} onChange={(v) => onChange({ config: { ...node.data.config, [f.key]: v } })} />
              ))}
            </div>
          </section>
        )}

        {/* Live metrics */}
        <section>
          <SectionTitle>Live metrics · last {traces.length} req</SectionTitle>
          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-line bg-line">
            <Metric label="Invocations" value={stats ? fmtNum(stats.count) : '—'} />
            <Metric label="p50" value={stats?.count ? fmtMs(percentile(stats.durations, 50)) : '—'} />
            <Metric label="p95" value={stats?.count ? fmtMs(percentile(stats.durations, 95)) : '—'} />
            <Metric label={hitLabel[c.metric] ?? 'Errors'} value={stats?.count ? fmtPct((hitLabel[c.metric] ? stats.hits : 0) / stats.count) : '—'} accent={a.fg} />
            <Metric label="Saved" value={stats ? fmtUsd(Math.max(0, stats.saved)) : '—'} accent={stats && stats.saved > 0 ? ACCENT.green.fg : undefined} />
            <Metric
              label={c.pillar === 'search' ? 'Calls avoided' : c.metric === 'tokens' ? 'Tok saved' : 'Flagged'}
              value={stats ? fmtNum(c.pillar === 'search' ? stats.callsAvoided : c.metric === 'tokens' ? stats.tokensSaved : stats.flagged) : '—'}
            />
          </div>
          <div className="mt-2 rounded-lg border border-line bg-surface-2 px-2 pb-1 pt-2">
            <div className="mb-1 flex justify-between px-1 text-2xs text-fg-subtle">
              <span>throughput · 4 min</span>
              <span className="font-mono">10s buckets</span>
            </div>
            <Sparkline data={stats?.series ?? Array(24).fill(0)} color={a.fg} height={36} />
          </div>
        </section>

        {/* Recent events */}
        <section>
          <SectionTitle>Recent events</SectionTitle>
          <div className="divide-y divide-line overflow-hidden rounded-lg border border-line">
            {recent.length === 0 && <div className="px-3 py-3 text-[12px] text-fg-subtle">No traffic yet.</div>}
            {recent.map(({ t, s }) => (
              <div key={t.id} className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <OutcomeBadge outcome={s.outcome} />
                  <span className="font-mono text-2xs text-fg-subtle">{t.id}</span>
                  <span className="ml-auto font-mono text-2xs text-fg-muted">{fmtMs(s.duration)}</span>
                </div>
                <div className="mt-1 truncate font-mono text-[11px] text-fg-muted" title={s.detail}>
                  {s.detail}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="flex gap-2 border-t border-line px-4 py-3">
        <button onClick={onDuplicate} className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-line-strong text-[12px] text-fg-muted hover:bg-surface-3 hover:text-fg">
          <Copy size={13} /> Duplicate
        </button>
        <button
          onClick={onDelete}
          disabled={node.deletable === false}
          className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-line-strong text-[12px] text-fg-muted hover:border-danger/40 hover:text-danger disabled:pointer-events-none disabled:opacity-40"
        >
          <Trash2 size={13} /> Remove
        </button>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-2xs font-medium uppercase tracking-[0.08em] text-fg-subtle">{children}</h3>;
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-surface-2 px-2.5 py-2">
      <div className="text-2xs text-fg-subtle">{label}</div>
      <div className="mt-0.5 font-mono text-[13px] tabular-nums text-fg" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
    </div>
  );
}

function FieldRow({ field, value, onChange, color }: { field: Field; value: ConfigValue; onChange: (v: ConfigValue) => void; color: string }) {
  const header = (right?: React.ReactNode) => (
    <div className="mb-1.5 flex items-center justify-between">
      <label className="text-[12px] text-fg-muted">{field.label}</label>
      {right}
    </div>
  );
  const hint = field.hint && <p className="mt-1 text-2xs leading-snug text-fg-subtle">{field.hint}</p>;

  switch (field.type) {
    case 'slider': {
      const v = Number(value);
      const shown = field.unit === '%' ? `${Math.round(v * 100)}%` : field.step < 1 ? v.toFixed(2) : String(v);
      return (
        <div>
          {header(<span className="font-mono text-[12px] tabular-nums text-fg">{shown}</span>)}
          <Slider value={v} min={field.min} max={field.max} step={field.step} onChange={onChange} color={color} />
          {hint}
        </div>
      );
    }
    case 'select':
      return (
        <div>
          {header()}
          {field.options.length <= 3 ? <Segmented value={String(value)} options={field.options} onChange={onChange} /> : <Select value={String(value)} options={field.options} onChange={onChange} />}
          {hint}
        </div>
      );
    case 'toggle':
      return (
        <div className="flex items-center justify-between">
          <label className="text-[12px] text-fg-muted">{field.label}</label>
          <Toggle checked={Boolean(value)} onChange={onChange} color={color} label={field.label} />
        </div>
      );
    case 'number':
      return (
        <div>
          {header()}
          <div className={clsx('flex h-7 items-center rounded-md border border-line-strong bg-surface-2 focus-within:border-fg-subtle')}>
            <input
              type="number"
              min={field.min}
              max={field.max}
              value={Number(value)}
              onChange={(e) => onChange(Math.min(field.max, Math.max(field.min, Number(e.target.value) || field.min)))}
              className="h-full w-full bg-transparent px-2 font-mono text-[12px] tabular-nums text-fg outline-none"
            />
            {field.unit && <span className="pr-2 font-mono text-2xs text-fg-subtle">{field.unit}</span>}
          </div>
          {hint}
        </div>
      );
  }
}
