import { DEMO_PRESETS } from '@conduit/core';
import clsx from 'clsx';
import { ArrowRightLeft, CornerDownLeft, Ghost, LoaderCircle, ShieldAlert, ShieldCheck, Siren, Zap } from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, PIPELINE_ID, type TestResult, type Trace } from '../api';
import { ProfileSlider } from '../components/ProfileSlider';
import { SavingsCounter } from '../components/SavingsCounter';
import { StatusBadge } from '../components/trace/badges';
import { Badge } from '../components/ui/badge';
import { Button as UIButton } from '../components/ui/button';
import { Card, PageHeader } from '../components/ui/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { CATALOG } from '../lib/catalog';
import { fmtMs, fmtUsd } from '../lib/format';
import { ACCENT } from '../lib/theme';
import { useToast } from '../state/toast';
import { useTraces } from '../state/traces';
import { useAsync } from '../state/useAsync';

const MODELS = ['claude-sonnet-5-5', 'claude-opus-5-5', 'gpt-4o', 'gpt-4o-mini'];

export function DemoPage() {
  const { traces, add } = useTraces();
  const toast = useToast();
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState(MODELS[0]);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<TestResult[]>([]);
  const [alert, setAlert] = useState<Trace | null>(null);
  const [lastPii, setLastPii] = useState<Trace | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const honeypot = useAsync(() => api.listHoneypotSessions(), [], 5000);

  const send = async (text: string) => {
    const p = text.trim();
    if (!p || busy) return;
    setBusy(true);
    setPrompt('');
    try {
      const r = await api.sendTestRequest({ pipelineId: PIPELINE_ID, prompt: p, model });
      add(r);
      setLog((l) => [...l, r]);
      if (r.status === 'blocked' || r.status === 'honeypot') {
        setAlert(r);
        honeypot.reload();
      }
      if (r.io?.pii?.length) setLastPii(r);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Request failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [log, busy]);
  useEffect(() => {
    if (!alert) return;
    const t = setTimeout(() => setAlert(null), 6000);
    return () => clearTimeout(t);
  }, [alert]);

  // Security feed: every attack seen by the gateway, from any client.
  const attacks = useMemo(() => traces.filter((t) => t.status === 'blocked' || t.status === 'honeypot' || t.leakedThreat).slice(0, 30), [traces]);
  const pii = lastPii ?? traces.find((t) => t.io?.pii?.length) ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Live demo" subtitle="Send prompts through the gateway and watch every guardrail fire" actions={<ProfileSlider compact />} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-[1400px] gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div className="xl:col-span-2">
            <SavingsCounter />
          </div>

          {/* ---- Console ---- */}
          <section className="flex min-h-[560px] min-w-0 flex-col overflow-hidden rounded-xl border bg-card xl:h-[calc(100dvh-330px)]">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
              <span className="flex gap-1.5" aria-hidden>
                <span className="h-2.5 w-2.5 rounded-full bg-[#3a3a42]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#3a3a42]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#3a3a42]" />
              </span>
              <span className="ml-2 font-mono text-[12px] text-fg-subtle">POST /v1/chat/completions</span>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger className="ml-auto h-7 w-44 font-mono text-xs" aria-label="Model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODELS.map((m) => (
                    <SelectItem key={m} value={m} className="font-mono text-xs">
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div ref={scroller} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 font-mono text-[12.5px]">
              {log.length === 0 && !busy && (
                <div className="py-10 text-center font-sans text-[12.5px] leading-relaxed text-fg-subtle">
                  Type a prompt or pick a preset below.
                  <br />
                  Try <span className="text-fg-muted">Weather</span> then <span className="text-fg-muted">Paraphrase</span> to see a semantic cache hit, or <span className="text-fg-muted">Jailbreak</span> to trip the honeypot.
                </div>
              )}
              {log.map((r) => (
                <Exchange key={r.id} r={r} />
              ))}
              {busy && (
                <div className="flex items-center gap-2 text-fg-subtle">
                  <LoaderCircle size={13} className="animate-spin" /> routing through gateway…
                </div>
              )}
            </div>
            <div className="border-t border-border p-3">
              <div className="mb-2 flex flex-wrap gap-1.5">
                {DEMO_PRESETS.map((p) => (
                  <UIButton
                    key={p.label}
                    variant="outline"
                    size="sm"
                    onClick={() => send(p.prompt)}
                    disabled={busy}
                    className={clsx('h-7 px-2.5 text-xs', (p.label === 'Jailbreak' || p.label === 'Injection') && 'border-destructive/40 text-danger hover:bg-destructive/10 hover:text-danger')}
                  >
                    {p.label}
                  </UIButton>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send(prompt);
                }}
                className="flex items-center gap-2 rounded-xl border border-input bg-popover px-3 focus-within:border-fg-subtle"
              >
                <span className="font-mono text-[13px] text-efficiency">›</span>
                <input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ask anything, or try to break it…" className="h-10 min-w-0 flex-1 bg-transparent font-mono text-[13px] text-fg outline-none placeholder:text-fg-subtle" aria-label="Prompt" />
                <UIButton type="submit" size="icon" disabled={busy || !prompt.trim()} className="h-7 w-7" aria-label="Send">
                  <CornerDownLeft />
                </UIButton>
              </form>
            </div>
          </section>

          {/* ---- Right column ---- */}
          <div className="flex min-w-0 flex-col gap-4">
            <SecurityMonitor alert={alert} attacks={attacks} />
            <PiiCompare trace={pii} />
            <ProfileSlider />
            <Card title="Honeypot sessions" actions={<Ghost size={14} className="text-[#F472B6]" />} bodyClassName="px-2 pb-2">
              {!honeypot.data?.length ? (
                <div className="px-2 py-6 text-center text-[12px] text-fg-subtle">No attackers trapped yet. Send the Jailbreak preset.</div>
              ) : (
                <table className="w-full text-left text-[12px]">
                  <thead className="text-[11px] text-fg-subtle">
                    <tr>
                      <th className="px-2 py-1 font-normal">Attacker</th>
                      <th className="px-2 py-1 text-right font-normal">Attempts</th>
                      <th className="px-2 py-1 text-right font-normal">Time wasted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {honeypot.data.slice(0, 5).map((h) => (
                      <tr key={h.id} className="border-t border-border" title={`Last prompt: ${h.lastPrompt}\n\nDecoy reply: ${h.lastReply}`}>
                        <td className="max-w-0 truncate px-2 py-1.5 font-mono text-[11.5px] text-fg-muted">{h.id}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-fg">{h.attempts}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-[#F472B6]">{fmtMs(h.timeWastedMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function Exchange({ r }: { r: TestResult }) {
  const red = r.status === 'blocked' || r.status === 'honeypot';
  return (
    <div className="animate-row-in">
      <div className="flex gap-2 text-fg">
        <span className="text-efficiency">›</span>
        <span className="whitespace-pre-wrap break-words">{r.io?.input ?? r.prompt}</span>
      </div>
      <div className={clsx('mt-2 rounded-lg border px-3 py-2.5', red ? 'border-danger/25 bg-danger/[0.04]' : 'border-border bg-muted/50')}>
        <div className="mb-2 flex flex-wrap items-center gap-1.5 font-sans">
          <StatusBadge status={r.status} />
          {r.threatConfidence !== undefined && (
            <Chip color="#F87171">
              {r.threat === 'jailbreak' ? 'Jailbreak' : 'Injection'} · {(r.threatConfidence * 100).toFixed(1)}% confidence
            </Chip>
          )}
          {r.cache && (
            <Chip color="#34D399">
              <Zap size={11} /> {r.cache.kind === 'semantic' ? `${(r.cache.similarity * 100).toFixed(0)}% semantic cache hit` : 'exact cache hit'}
            </Chip>
          )}
          {r.searchBypassed && <Chip color="#71717A">Search bypassed · internal knowledge sufficient</Chip>}
          {r.searchSent > 0 && (
            <Chip color="#22D3EE">
              {r.searchRaw} → {r.searchSent} searches
            </Chip>
          )}
          {!!r.io?.pii?.length && <Chip color="#A78BFA">{r.io.pii.length} PII swapped</Chip>}
          <span className="ml-auto flex items-center gap-3 text-[11.5px] tabular-nums text-fg-subtle">
            <span>{r.status === 'honeypot' ? 'decoy' : r.model}</span>
            <span className={clsx(r.latency < 50 && 'text-efficiency')}>{fmtMs(r.latency)}</span>
            <span className={r.saved > 0 ? 'text-efficiency' : ''}>{r.saved > 0 ? `+${fmtUsd(r.saved)}` : fmtUsd(r.saved)}</span>
          </span>
        </div>
        <div className={clsx('whitespace-pre-wrap break-words', red ? (r.status === 'honeypot' ? 'text-[#F9A8D4]' : 'text-danger') : 'text-fg-muted')}>{r.response}</div>
        <PathStrip trace={r} />
      </div>
    </div>
  );
}

function Chip({ color, children }: { color: string; children: ReactNode }) {
  return (
    <Badge variant="outline" className="border-transparent px-1.5 text-[11px]" style={{ color, background: `${color}1a` }}>
      {children}
    </Badge>
  );
}

/** Mini pipeline: the nodes this request visited. Search nodes that were skipped show as greyed-out "Bypassed". */
function PathStrip({ trace }: { trace: Trace }) {
  const steps = trace.spans.filter((s) => s.outcome !== 'bypassed' || s.kind === 'serpApi');
  const bypassed = trace.searchBypassed;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1 font-sans">
      {steps.map((s, i) => {
        const c = CATALOG[s.kind];
        const Icon = c.icon;
        const color = s.outcome === 'blocked' ? ACCENT.red.fg : s.outcome === 'trapped' ? '#F472B6' : ACCENT[c.accent].fg;
        return (
          <Fragment key={i}>
            {i > 0 && <span className="text-[10px] text-fg-subtle">→</span>}
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10.5px] text-fg-muted" title={s.detail}>
              <Icon size={11} style={{ color }} /> {c.label}
            </span>
          </Fragment>
        );
      })}
      {bypassed && (
        <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-input px-1.5 py-0.5 text-[10.5px] text-fg-subtle" title="The Search Intent Router decided no live data was needed">
          {(() => {
            const Icon = CATALOG.serpApi.icon;
            return <Icon size={11} />;
          })()}
          SerpAPI · Bypassed — internal knowledge sufficient
        </span>
      )}
    </div>
  );
}

function SecurityMonitor({ alert, attacks }: { alert: Trace | null; attacks: Trace[] }) {
  return (
    <section className={clsx('overflow-hidden rounded-xl border transition-colors duration-300', alert ? 'border-destructive/60 bg-destructive/10' : 'bg-card')} aria-live="assertive">
      {alert ? (
        <div className="relative px-4 py-4">
          <div className="pointer-events-none absolute inset-0 animate-pulse bg-danger/10" aria-hidden />
          <div className="relative flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-danger/20 text-danger">
              <Siren size={20} />
            </div>
            <div className="min-w-0">
              <div className="text-[15px] font-semibold text-danger">
                {alert.threat === 'jailbreak' ? 'Jailbreak Attempt' : 'Prompt Injection'} Blocked ({((alert.threatConfidence ?? 0) * 100).toFixed(1)}% Confidence)
              </div>
              <div className="mt-1 text-[12.5px] text-fg-muted">
                {alert.status === 'honeypot' ? 'Attacker routed to the sandboxed honeypot decoy.' : 'Rejected with 403.'} Upstream LLM never called · <span className="text-efficiency">$0.00 charged</span>
              </div>
              <div className="mt-2 truncate font-mono text-[11.5px] text-fg-subtle">“{alert.prompt}”</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-4 py-3.5">
          <ShieldCheck size={16} className="text-efficiency" />
          <span className="text-[12.5px] font-medium text-fg">Security monitor</span>
          <span className="text-[12px] text-fg-subtle">· all clear</span>
        </div>
      )}
      <ul className="max-h-[180px] overflow-y-auto border-t border-border font-mono text-[11.5px]">
        {attacks.length === 0 && <li className="px-4 py-3 text-fg-subtle">No attacks observed yet.</li>}
        {attacks.map((t) => (
          <li key={t.id} className="flex items-center gap-2 border-b border-border px-4 py-1.5">
            {t.leakedThreat ? <ShieldAlert size={12} className="shrink-0 text-security-amber" /> : t.status === 'honeypot' ? <Ghost size={12} className="shrink-0 text-[#F472B6]" /> : <ShieldAlert size={12} className="shrink-0 text-danger" />}
            <span className="shrink-0 text-fg-subtle">{new Date(t.ts).toLocaleTimeString([], { hour12: false })}</span>
            <span className={clsx('shrink-0', t.leakedThreat ? 'text-security-amber' : t.status === 'honeypot' ? 'text-[#F472B6]' : 'text-danger')}>{t.leakedThreat ? 'MISSED' : t.status === 'honeypot' ? 'TRAPPED' : 'BLOCKED'}</span>
            <span className="shrink-0 tabular-nums text-fg-muted">{t.threatConfidence ? `${(t.threatConfidence * 100).toFixed(1)}%` : ''}</span>
            <span className="min-w-0 truncate text-fg-subtle">{t.prompt}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Highlight({ text, values, color }: { text: string; values: string[]; color: string }) {
  const vs = values.filter(Boolean).sort((a, b) => b.length - a.length);
  if (!vs.length) return <>{text}</>;
  const re = new RegExp(`(${vs.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  return (
    <>
      {text.split(re).map((part, i) =>
        vs.includes(part) ? (
          <mark key={i} className="rounded px-0.5" style={{ background: `${color}26`, color }}>
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

/** Feature 2: what the app sent vs what the LLM saw vs what came back. */
function PiiCompare({ trace }: { trace: Trace | null }) {
  const io = trace?.io;
  const real = io?.pii?.map((p) => p.real) ?? [];
  const fake = io?.pii?.map((p) => p.synthetic) ?? [];
  return (
    <Card title="PII token swap" actions={<ArrowRightLeft size={14} className="text-security" />}>
      {!io?.pii?.length ? (
        <div className="py-4 text-center text-[12px] text-fg-subtle">Send the PII preset to see the round trip.</div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <Pane title="Your app sent" tone="real">
            <Highlight text={io.input} values={real} color="#FBBF24" />
          </Pane>
          <Pane title="LLM saw (synthetic)" tone="fake">
            <Highlight text={io.upstreamInput ?? ''} values={fake} color="#A78BFA" />
          </Pane>
          <Pane title="LLM replied" tone="fake">
            <Highlight text={io.upstreamOutput ?? '—'} values={fake} color="#A78BFA" />
          </Pane>
          <Pane title="Your app received" tone="real">
            <Highlight text={io.output ?? ''} values={real} color="#FBBF24" />
          </Pane>
          <div className="sm:col-span-2">
            <table className="w-full text-left font-mono text-[11px]">
              <tbody>
                {io.pii.map((p, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="py-1 pr-2 text-fg-subtle">{p.type}</td>
                    <td className="py-1 pr-2 text-[#FBBF24]">{p.real}</td>
                    <td className="py-1 pr-2 text-fg-subtle">→</td>
                    <td className="py-1 text-security">{p.synthetic}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}

function Pane({ title, tone, children }: { title: string; tone: 'real' | 'fake'; children: ReactNode }) {
  return (
    <div className={clsx('rounded-lg border p-2.5', tone === 'real' ? 'border-security-amber/20' : 'border-security/20')}>
      <div className={clsx('mb-1 text-[10.5px] font-medium uppercase tracking-wide', tone === 'real' ? 'text-security-amber/80' : 'text-security/80')}>{title}</div>
      <div className="whitespace-pre-wrap break-words font-mono text-[11.5px] leading-relaxed text-fg-muted">{children}</div>
    </div>
  );
}
