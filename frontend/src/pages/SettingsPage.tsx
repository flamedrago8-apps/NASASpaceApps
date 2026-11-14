import clsx from 'clsx';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type ProviderId, type Settings, type SettingsPatch } from '../api';
import { Toggle } from '../components/ui/controls';
import { Button, CopyButton, ErrorState, PageHeader, Spinner, TextInput } from '../components/ui/kit';
import { useToast } from '../state/toast';
import { useAsync } from '../state/useAsync';

const PROVIDERS: { id: ProviderId; name: string; hint: string; placeholder: string }[] = [
  { id: 'anthropic', name: 'Anthropic', hint: 'Claude models', placeholder: 'sk-ant-…' },
  { id: 'openai', name: 'OpenAI', hint: 'GPT models', placeholder: 'sk-…' },
  { id: 'meta', name: 'Llama host', hint: 'Llama models via your inference provider', placeholder: 'API key' },
];

/** Marker for "remove this key on save" (an empty input just means "no change"). */
const REMOVE = '\u0000remove';

type Form = { budget: Settings['budget']; logging: Settings['logging']; gateway: { region: string } };

export function SettingsPage() {
  const res = useAsync(() => api.getSettings(), []);
  const toast = useToast();
  const [form, setForm] = useState<Form | null>(null);
  const [keys, setKeys] = useState<Partial<Record<ProviderId, string>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (res.data) setForm({ budget: res.data.budget, logging: res.data.logging, gateway: { region: res.data.gateway.region } });
  }, [res.data]);

  const dirty = useMemo(() => {
    if (!res.data || !form) return false;
    const base: Form = { budget: res.data.budget, logging: res.data.logging, gateway: { region: res.data.gateway.region } };
    return JSON.stringify(base) !== JSON.stringify(form) || Object.values(keys).some((v) => !!v);
  }, [res.data, form, keys]);

  const save = async () => {
    if (!form) return;
    if (form.budget.webhookUrl && !/^https:\/\/\S+$/.test(form.budget.webhookUrl)) return toast('Webhook URL must start with https://', 'error');
    setSaving(true);
    try {
      const patch: SettingsPatch = { budget: form.budget, logging: form.logging, gateway: form.gateway };
      const pk = Object.fromEntries(Object.entries(keys).filter(([, v]) => v).map(([k, v]) => [k, v === REMOVE ? '' : v]));
      if (Object.keys(pk).length) patch.providerKeys = pk;
      const next = await api.updateSettings(patch);
      res.setData(next);
      setKeys({});
      toast('Settings saved', 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const s = res.data;
  const set = <K extends keyof Form>(k: K, patch: Partial<Form[K]>) => setForm((f) => (f ? { ...f, [k]: { ...f[k], ...patch } } : f));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Settings" subtitle="prod-gateway" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {res.error && !s ? (
          <ErrorState error={res.error} onRetry={res.reload} />
        ) : !s || !form ? (
          <Spinner label="Loading settings" />
        ) : (
          <div className="mx-auto max-w-[860px] space-y-8 p-4 pb-28 sm:p-6 sm:pb-28">
            <Section title="Model providers" body="Keys the gateway uses to call upstream models. They’re write-only — stored encrypted and never shown again.">
              {PROVIDERS.map((p) => (
                <SecretRow key={p.id} name={p.name} hint={p.hint} placeholder={p.placeholder} state={s.providers[p.id]} value={keys[p.id]} onChange={(v) => setKeys((k) => ({ ...k, [p.id]: v }))} />
              ))}
            </Section>

            <Section title="Web search" body="Used by the SerpAPI node. Every call the router, cache and optimizer avoid is billed against this key.">
              <SecretRow name="SerpAPI" hint="serpapi.com API key" placeholder="SerpAPI key" state={s.providers.serpapi} value={keys.serpapi} onChange={(v) => setKeys((k) => ({ ...k, serpapi: v }))} />
            </Section>

            <Section title="Budget & alerts" body="Get notified before spend runs away.">
              <div className="grid gap-4 p-4 sm:grid-cols-2">
                <TextInput label="Monthly budget" type="number" min={0} suffix="USD" value={form.budget.monthlyUsd} onChange={(e) => set('budget', { monthlyUsd: Math.max(0, Number(e.target.value) || 0) })} />
                <TextInput label="Alert at" type="number" min={1} max={100} suffix="% of budget" value={form.budget.alertAtPct} onChange={(e) => set('budget', { alertAtPct: Math.min(100, Math.max(1, Number(e.target.value) || 1)) })} />
                <TextInput className="sm:col-span-2" label="Alert webhook" type="url" placeholder="https://hooks.slack.com/…" value={form.budget.webhookUrl} onChange={(e) => set('budget', { webhookUrl: e.target.value })} hint="Receives a POST when spend crosses the alert threshold, and on blocked or honeypotted attacks (at most one every 10 seconds)." />
              </div>
            </Section>

            <Section title="Logging & privacy">
              <Row label="Store request payloads" hint="Keep prompts and completions with each trace. Turn off to keep metadata only.">
                <Toggle checked={form.logging.logPayloads} onChange={(v) => set('logging', { logPayloads: v })} label="Store request payloads" color="#34D399" />
              </Row>
              <Row label="Redact PII in logs" hint="Apply the PII Redactor to stored payloads even when the node is bypassed in the pipeline.">
                <Toggle checked={form.logging.redactPii} onChange={(v) => set('logging', { redactPii: v })} label="Redact PII in logs" color="#34D399" />
              </Row>
              <Row label="Retention">
                <select value={form.logging.retentionDays} onChange={(e) => set('logging', { retentionDays: Number(e.target.value) })} className="h-8 rounded-lg border border-[#2a2a31] bg-[#141417] px-2.5 text-[12.5px] text-fg outline-none focus:border-fg-subtle">
                  {[7, 14, 30, 90, 365].map((d) => (
                    <option key={d} value={d}>
                      {d} days
                    </option>
                  ))}
                </select>
              </Row>
            </Section>

            <Section title="Gateway">
              <Row label="Base URL" hint="Point OpenAI-compatible clients here.">
                <div className="flex items-center gap-1 rounded-lg bg-white/[0.04] py-0.5 pl-2.5 pr-0.5">
                  <code className="max-w-[260px] truncate font-mono text-[12px] text-fg-muted">{s.gateway.baseUrl}</code>
                  <CopyButton text={s.gateway.baseUrl} label="Copy base URL" />
                </div>
              </Row>
              <Row label="Region">
                <select value={form.gateway.region} onChange={(e) => set('gateway', { region: e.target.value })} className="h-8 rounded-lg border border-[#2a2a31] bg-[#141417] px-2.5 text-[12.5px] text-fg outline-none focus:border-fg-subtle">
                  {['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1'].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </Row>
            </Section>
          </div>
        )}
      </div>

      {dirty && (
        <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
          <div className="pointer-events-auto flex animate-toast-in items-center gap-3 rounded-xl border border-[#2a2a31] bg-[#18181c] py-2 pl-4 pr-2 shadow-2xl shadow-black/60">
            <span className="text-[12.5px] text-fg-muted">Unsaved changes</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (s) setForm({ budget: s.budget, logging: s.logging, gateway: { region: s.gateway.region } });
                setKeys({});
              }}
            >
              Discard
            </Button>
            <Button variant="primary" size="sm" loading={saving} onClick={save}>
              Save changes
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, body, children }: { title: string; body?: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 md:grid-cols-[220px_1fr] md:gap-8">
      <div>
        <h2 className="text-[13px] font-medium text-fg">{title}</h2>
        {body && <p className="mt-1 text-[12px] leading-relaxed text-fg-subtle">{body}</p>}
      </div>
      <div className="divide-y divide-white/[0.05] rounded-2xl border border-[#1f1f25] bg-[#0f0f12]">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] text-fg">{label}</div>
        {hint && <div className="mt-0.5 text-[11.5px] leading-snug text-fg-subtle">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function SecretRow({ name, hint, placeholder, state, value, onChange }: { name: string; hint: string; placeholder: string; state: { configured: boolean; last4?: string; source?: 'env' | 'dashboard' }; value: string | undefined; onChange: (v: string | undefined) => void }) {
  const editing = value !== undefined;
  return (
    <div className="px-4 py-3.5">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] text-fg">{name}</div>
          <div className="mt-0.5 text-[11.5px] text-fg-subtle">{hint}</div>
        </div>
        {!editing && state.source === 'env' && <span className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[10.5px] text-fg-subtle">from env</span>}
        {!editing && (
          <span className={clsx('flex items-center gap-1.5 text-[12px]', state.configured ? 'text-fg-muted' : 'text-fg-subtle')}>
            <span className={clsx('h-1.5 w-1.5 rounded-full', state.configured ? 'bg-efficiency' : 'bg-[#3a3a44]')} />
            {state.configured ? <span className="font-mono">••••{state.last4}</span> : 'Not set'}
          </span>
        )}
        {editing ? (
          <Button size="sm" variant="ghost" onClick={() => onChange(undefined)}>
            Cancel
          </Button>
        ) : state.source === 'env' ? null : (
          <Button size="sm" onClick={() => onChange('')}>
            {state.configured ? 'Replace' : 'Add key'}
          </Button>
        )}
      </div>
      {editing && value === REMOVE && <div className="mt-2 text-[11.5px] text-danger">This key will be removed when you save.</div>}
      {editing && value !== REMOVE && (
        <div className="mt-3 flex items-center gap-2">
          <TextInput className="flex-1" type="password" autoComplete="off" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${name} API key`} />
          {state.configured && (
            <Button size="sm" variant="danger" onClick={() => onChange(REMOVE)}>
              Remove
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
