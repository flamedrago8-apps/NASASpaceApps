/** Runs requests through the pipeline and records everything that happens. */
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { createSimulatedProviders, createStores, mask, Metrics, runPipeline, sampleRequest, type Clock, type EngineResult, type GatewayRequest, type HoneypotSession, type Providers, type Trace } from '@conduit/core';
import { env } from './env';
import { createProviders } from './providers';
import type { Store } from './store';

const realClock: Clock = { now: () => performance.now(), wall: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };
const BUFFER = 5000;

export class Gateway {
  readonly metrics: Metrics;
  readonly traces: Trace[];
  private listeners = new Set<(t: Trace) => void>();
  private stores = createStores();
  private demoStores = createStores();
  private providers: Providers;
  private simProviders: Providers;
  private rate = new Map<string, { windowStart: number; count: number }>();
  private budgetAlerted = '';
  private lastSecurityAlert = 0;

  constructor(private store: Store) {
    this.metrics = new Metrics(store.state.metrics);
    store.getMetrics = () => this.metrics.snapshot();
    this.traces = store.loadTraces(BUFFER);
    this.providers = createProviders(store, realClock);
    this.simProviders = createSimulatedProviders(realClock);
    if (env.demoTraffic) this.startDemoTraffic();
  }

  subscribe(fn: (t: Trace) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Returns false when the key is over its per-minute limit (from the Ingress node). */
  allow(keyId: string): boolean {
    const limit = Number(this.store.deployedDoc.nodes.find((n) => n.kind === 'ingress')?.config.rateLimit ?? 600);
    const now = Date.now();
    const r = this.rate.get(keyId);
    if (!r || now - r.windowStart > 60_000) {
      this.rate.set(keyId, { windowStart: now, count: 1 });
      return true;
    }
    r.count++;
    return r.count <= limit;
  }

  async handle(req: GatewayRequest, opts: { draft?: boolean; simulated?: boolean } = {}): Promise<EngineResult> {
    const s = this.store.state.settings;
    const doc = opts.draft ? this.store.state.pipeline : this.store.deployedDoc;
    const res = await runPipeline(doc, req, {
      providers: opts.simulated ? this.simProviders : this.providers,
      stores: opts.simulated ? this.demoStores : this.stores,
      clock: realClock,
      profile: s.routing.profile,
      logPayloads: s.logging.logPayloads,
      redactPiiInLogs: false, // the caller gets the full trace; the stored copy is masked below if configured
      newId: () => `req_${crypto.randomBytes(6).toString('base64url')}`,
    });
    this.record(res.trace, req);
    return res;
  }

  private record(trace: Trace, req: GatewayRequest) {
    const stored = this.store.state.settings.logging.redactPii ? maskTrace(trace) : trace;
    this.traces.unshift(stored);
    if (this.traces.length > BUFFER) this.traces.length = BUFFER;
    this.metrics.add(stored);
    this.store.appendTrace(stored);
    if (trace.status === 'honeypot') this.trackHoneypot(trace, req);
    this.listeners.forEach((l) => l(stored));
    this.store.save();
    void this.alerts(trace);
  }

  private trackHoneypot(t: Trace, req: GatewayRequest) {
    const list = this.store.state.honeypot;
    const id = crypto.createHash('sha1').update(req.clientId).digest('hex').slice(0, 12);
    let s = list.find((x) => x.id === id);
    if (!s) {
      s = { id, app: req.app, attempts: 0, firstSeen: t.ts, lastSeen: t.ts, timeWastedMs: 0, lastPrompt: '', lastReply: '' };
      list.unshift(s);
      if (list.length > 200) list.length = 200;
    }
    s.attempts++;
    s.lastSeen = t.ts;
    s.timeWastedMs += t.latency;
    s.lastPrompt = t.prompt.slice(0, 300);
    s.lastReply = (t.io?.output ?? '').slice(0, 500);
  }

  honeypotSessions(): HoneypotSession[] {
    return this.store.state.honeypot;
  }

  /** Budget threshold + security event webhooks. Fire-and-forget. */
  private async alerts(t: Trace) {
    const { webhookUrl, monthlyUsd, alertAtPct } = this.store.state.settings.budget;
    if (!webhookUrl) return;
    const post = (body: unknown) => fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) }).catch(() => {});
    if ((t.status === 'blocked' || t.status === 'honeypot') && Date.now() - this.lastSecurityAlert > 10_000) {
      this.lastSecurityAlert = Date.now();
      await post({ type: 'security', text: `🛡️ ${t.threat ?? 'Attack'} ${t.status === 'honeypot' ? 'trapped in honeypot' : 'blocked'} (${((t.threatConfidence ?? 0) * 100).toFixed(1)}% confidence) from ${t.app}`, trace: t.id });
    }
    const month = new Date().toISOString().slice(0, 7);
    if (this.budgetAlerted === month || !monthlyUsd) return;
    const spent = this.metrics.summary('30d').costActual;
    if (spent >= (monthlyUsd * alertAtPct) / 100) {
      this.budgetAlerted = month;
      await post({ type: 'budget', text: `💸 Gateway spend $${spent.toFixed(2)} has reached ${alertAtPct}% of the $${monthlyUsd} monthly budget.`, spent, budget: monthlyUsd });
    }
  }

  private startDemoTraffic() {
    const loop = () => {
      setTimeout(async () => {
        try {
          // Synthetic traffic always uses simulated providers: it must never spend real money.
          await this.handle(sampleRequest(), { simulated: true });
        } catch (e) {
          console.error('[demo traffic]', e);
        }
        loop();
      }, (60_000 / env.demoTrafficPerMin) * (0.5 + Math.random()));
    };
    loop();
    console.log(`[conduit] demo traffic on: ~${env.demoTrafficPerMin} simulated req/min`);
  }
}

function maskTrace(t: Trace): Trace {
  const m = (s?: string) => (s ? s.replace(/\b[\w.+-]+@[\w.-]+\.\w+\b/g, (x) => mask('EMAIL', x)).replace(/\b\d{3}-\d{2}-\d{4}\b/g, (x) => mask('SSN', x)).replace(/\b(?:\d[ -]?){12,18}\d\b/g, (x) => mask('CARD', x)) : s);
  return {
    ...t,
    prompt: m(t.prompt)!,
    io: t.io && { ...t.io, input: m(t.io.input)!, output: m(t.io.output), pii: t.io.pii?.map((p) => ({ ...p, real: mask(p.type, p.real) })) },
  };
}
