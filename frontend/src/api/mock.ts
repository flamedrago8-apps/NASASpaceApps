/**
 * In-browser implementation of GatewayApi for the demo. It runs the SAME pipeline engine
 * as the backend (core/src/engine.ts) against simulated upstream providers, so every
 * feature behaves exactly as it does on the real gateway — only the model replies and
 * search results are simulated. State persists to localStorage.
 */
import {
  createSimulatedProviders,
  createStores,
  defaultPipelineDoc,
  Metrics,
  runPipeline,
  sampleRequest,
  toRequest,
  ATTACKS,
  SAMPLES,
  upgradeDoc,
  virtualClock,
  type ApiKey,
  type Clock,
  type Deployment,
  type EngineContext,
  type GatewayRequest,
  type HoneypotSession,
  type NewApiKey,
  type PipelineDoc,
  type ProviderId,
  type Settings,
  type Trace,
  type TraceQuery,
} from '@conduit/core';
import { ApiError, type GatewayApi } from './client';

const STORE_KEY = 'conduit.mock.v3';
const BUFFER_MAX = 3000;

type State = { pipeline: PipelineDoc; deployments: Deployment[]; snapshots: Record<number, PipelineDoc>; keys: ApiKey[]; settings: Settings; honeypot: HoneypotSession[] };

function initialState(): State {
  const pipeline = { ...defaultPipelineDoc('chat-default'), deployedVersion: 14 };
  const day = 86_400_000;
  const now = Date.now();
  const deployments: Deployment[] = [
    { version: 14, deployedAt: new Date(now - 2 * day).toISOString(), author: 'you', note: 'Route jailbreaks to the honeypot' },
    { version: 13, deployedAt: new Date(now - 6 * day).toISOString(), author: 'you', note: 'Synthetic PII swapping' },
    { version: 12, deployedAt: new Date(now - 13 * day).toISOString(), author: 'you' },
  ];
  return {
    pipeline,
    deployments,
    snapshots: Object.fromEntries(deployments.map((d) => [d.version, pipeline])),
    keys: [
      { id: 'key_prod', name: 'Production', prefix: 'cdt_live_8Hq2', createdAt: new Date(now - 40 * day).toISOString(), lastUsedAt: new Date(now - 4000).toISOString(), requests: 1_204_331 },
      { id: 'key_staging', name: 'Staging', prefix: 'cdt_live_x1Vb', createdAt: new Date(now - 21 * day).toISOString(), lastUsedAt: new Date(now - 3 * 3_600_000).toISOString(), requests: 48_210 },
    ],
    settings: {
      providers: { anthropic: { configured: true, last4: 'x9Qa' }, openai: { configured: true, last4: '2kLm' }, meta: { configured: false }, serpapi: { configured: true, last4: 'f03c' } },
      budget: { monthlyUsd: 5000, alertAtPct: 80, webhookUrl: '' },
      logging: { retentionDays: 30, logPayloads: true, redactPii: false },
      gateway: { baseUrl: 'https://gateway.example.com/v1', region: 'us-east-1' },
      routing: { profile: 'balanced' },
    },
    honeypot: [],
  };
}

function load(): State {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const s = { ...initialState(), ...JSON.parse(raw) } as State;
      s.pipeline = upgradeDoc(s.pipeline);
      s.settings = { ...initialState().settings, ...s.settings };
      return s;
    }
  } catch {
    /* storage unavailable */
  }
  return initialState();
}

const delay = <T,>(v: T, ms = 80 + Math.random() * 120) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), ms));
const realClock: Clock = { now: () => performance.now(), wall: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };
let seq = 0;
const newId = () => `req_${Date.now().toString(36).slice(-5)}${(++seq % 1296).toString(36).padStart(2, '0')}`;

export type MockControls = { setRate: (r: number) => void; getRate: () => number; reset: () => void };

export function createMockApi(): GatewayApi & { controls: MockControls } {
  let state = load();
  const save = () => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  };
  const deployed = () => upgradeDoc(state.snapshots[state.pipeline.deployedVersion] ?? state.pipeline);

  const buffer: Trace[] = [];
  const metrics = new Metrics();
  const listeners = new Set<(t: Trace) => void>();
  // Background traffic and the interactive demo get separate caches, so the first
  // "What's the weather in Austin?" you send is a genuine miss and the paraphrase a hit.
  const bgStores = createStores();
  const demoStores = createStores();
  const sim = createSimulatedProviders(realClock);

  const ctx = (over: Partial<EngineContext> = {}): EngineContext => ({
    providers: sim,
    stores: bgStores,
    clock: realClock,
    profile: state.settings.routing.profile,
    logPayloads: state.settings.logging.logPayloads,
    redactPiiInLogs: false,
    newId,
    ...over,
  });

  // ---- back-fill: ~4 minutes of recent traces (virtual time) + 30 days of synthetic history ----
  const seeded = (async () => {
    const start = Date.now() - 400 * 700;
    const vclock = virtualClock(start);
    const vctx = ctx({ clock: vclock, providers: createSimulatedProviders(vclock), stores: createStores() });
    const out: Trace[] = [];
    for (let i = 0; i < 400; i++) {
      vclock.advance(400 + Math.random() * 500);
      const r = await runPipeline(deployed(), sampleRequest(), vctx);
      out.push(r.trace);
    }
    metrics.seedSynthetic(out, 60, 30, start);
    for (const t of out) metrics.add(t);
    buffer.push(...out.reverse());
  })();

  const record = (t: Trace, req: GatewayRequest) => {
    buffer.unshift(t);
    if (buffer.length > BUFFER_MAX) buffer.length = BUFFER_MAX;
    metrics.add(t);
    if (t.status === 'honeypot') {
      let s = state.honeypot.find((x) => x.id === req.clientId);
      if (!s) {
        s = { id: req.clientId, app: req.app, attempts: 0, firstSeen: t.ts, lastSeen: t.ts, timeWastedMs: 0, lastPrompt: '', lastReply: '' };
        state.honeypot.unshift(s);
        state.honeypot = state.honeypot.slice(0, 50);
      }
      s.attempts++;
      s.lastSeen = t.ts;
      s.timeWastedMs += t.latency;
      s.lastPrompt = t.prompt.slice(0, 300);
      s.lastReply = (t.io?.output ?? '').slice(0, 500);
      save();
    }
    listeners.forEach((l) => l(t));
  };

  let rate = 1;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const loop = () => {
    timer = setTimeout(
      async () => {
        const req = sampleRequest();
        req.clientId = `attacker-${Math.floor(Math.random() * 4)}`;
        const r = await runPipeline(deployed(), req, ctx());
        record(r.trace, req);
        loop();
      },
      (500 + Math.random() * 1400) / rate,
    );
  };

  const controls: MockControls = {
    setRate: (r) => void (rate = r),
    getRate: () => rate,
    reset: () => {
      state = initialState();
      save();
    },
  };

  return {
    mode: 'mock',
    controls,

    async getPipeline(id) {
      if (id !== state.pipeline.id) throw new ApiError(`Pipeline "${id}" not found`, 404);
      return delay(state.pipeline);
    },
    async saveDraft(doc) {
      state.pipeline = { ...doc, hasDraft: true, updatedAt: new Date().toISOString() };
      save();
      return delay(state.pipeline, 120);
    },
    async deploy(_id, note) {
      const version = state.pipeline.deployedVersion + 1;
      const d: Deployment = { version, deployedAt: new Date().toISOString(), author: 'you', note: note || undefined };
      state.pipeline = { ...state.pipeline, deployedVersion: version, hasDraft: false };
      state.snapshots[version] = structuredClone(state.pipeline);
      state.deployments = [d, ...state.deployments];
      save();
      return delay(d, 400);
    },
    async listDeployments() {
      return delay(state.deployments);
    },
    async restoreVersion(_id, version) {
      const snap = state.snapshots[version];
      if (!snap) throw new ApiError(`Version ${version} not found`, 404);
      state.pipeline = { ...structuredClone(snap), deployedVersion: state.pipeline.deployedVersion, hasDraft: true, updatedAt: new Date().toISOString() };
      save();
      return delay(state.pipeline);
    },

    async listTraces(q: TraceQuery) {
      await seeded;
      const ql = q.q?.trim().toLowerCase();
      const limit = q.limit ?? 100;
      const items = buffer
        .filter((t) => (q.before ? t.ts < q.before : true))
        .filter((t) => (!q.status || q.status === 'all' ? true : q.status === 'search' ? t.searchSent > 0 : t.status === q.status))
        .filter((t) => !ql || t.id.includes(ql) || t.prompt.toLowerCase().includes(ql) || t.app.includes(ql) || t.model.includes(ql))
        .slice(0, limit + 1);
      const page = items.slice(0, limit);
      return delay({ items: page, nextBefore: items.length > limit ? page[page.length - 1].ts : undefined });
    },
    streamTraces(onTrace) {
      listeners.add(onTrace);
      if (listeners.size === 1) void seeded.then(loop);
      return () => {
        listeners.delete(onTrace);
        if (listeners.size === 0) clearTimeout(timer);
      };
    },
    async sendTestRequest(req) {
      await seeded;
      const r = req.prompt
        ? toRequest({ app: 'live-demo', model: req.model || 'claude-sonnet-5-5', prompt: req.prompt, system: 'You are a helpful assistant.' })
        : toRequest((req.attack ? ATTACKS : SAMPLES)[Math.floor(Math.random() * (req.attack ? ATTACKS : SAMPLES).length)]);
      r.clientId = 'you (live demo)';
      const res = await runPipeline(state.pipeline, r, ctx({ stores: demoStores }));
      record(res.trace, r);
      const response = res.httpStatus === 200 ? res.text : String((res.body as { error?: { message?: string } }).error?.message ?? 'Request failed');
      return { ...res.trace, response };
    },

    async getSummary(range) {
      await seeded;
      return delay(metrics.summary(range));
    },
    async getTimeseries(range) {
      await seeded;
      return delay(metrics.series(range));
    },
    async getLifetime() {
      await seeded;
      return delay(metrics.lifetime(), 30);
    },
    async listHoneypotSessions() {
      return delay(state.honeypot);
    },

    async listKeys() {
      return delay(state.keys);
    },
    async createKey(name) {
      const rand = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 57]).join('');
      const secret = `cdt_live_${rand}`;
      const key: NewApiKey = { id: `key_${rand.slice(0, 8)}`, name, prefix: secret.slice(0, 13), createdAt: new Date().toISOString(), requests: 0, secret };
      const { secret: _s, ...stored } = key;
      state.keys = [stored, ...state.keys];
      save();
      return delay(key, 250);
    },
    async revokeKey(id) {
      state.keys = state.keys.filter((k) => k.id !== id);
      save();
      await delay(null, 200);
    },

    async getSettings() {
      return delay(state.settings);
    },
    async updateSettings(patch) {
      const s = state.settings;
      for (const [p, v] of Object.entries(patch.providerKeys ?? {}) as [ProviderId, string][]) s.providers[p] = v ? { configured: true, last4: v.slice(-4), source: 'dashboard' } : { configured: false };
      if (patch.budget) s.budget = { ...s.budget, ...patch.budget };
      if (patch.logging) s.logging = { ...s.logging, ...patch.logging };
      if (patch.gateway) s.gateway = { ...s.gateway, ...patch.gateway };
      if (patch.routing) s.routing = { ...s.routing, ...patch.routing };
      save();
      return delay(s, 250);
    },
  };
}
