/**
 * In-browser implementation of GatewayApi. Generates realistic traffic from the
 * current pipeline draft and persists drafts, deployments, keys and settings to
 * localStorage, so the whole UI works end-to-end without a server.
 */
import { CATALOG } from '../lib/catalog';
import { defaultPipelineDoc } from '../lib/pipeline';
import { liveConfigFromDoc, simulateRequest } from '../lib/simulator';
import { ApiError, type GatewayApi } from './client';
import type { ApiKey, Deployment, NewApiKey, PipelineDoc, ProviderId, Range, SeriesPoint, Settings, Summary, Trace, TraceQuery } from './types';

const STORE_KEY = 'conduit.mock.v2';
const BUFFER_MAX = 3000;
const SEED = 400;

type State = {
  pipeline: PipelineDoc;
  deployments: Deployment[];
  snapshots: Record<number, PipelineDoc>;
  keys: ApiKey[];
  settings: Settings;
};

function initialState(): State {
  const pipeline = defaultPipelineDoc('chat-default');
  const day = 86_400_000;
  const now = Date.now();
  const deployments: Deployment[] = [
    { version: 14, deployedAt: new Date(now - 2 * day).toISOString(), author: 'you', note: 'Raise semantic threshold to 0.92' },
    { version: 13, deployedAt: new Date(now - 6 * day).toISOString(), author: 'you', note: 'Add query optimizer' },
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
      providers: {
        anthropic: { configured: true, last4: 'x9Qa' },
        openai: { configured: true, last4: '2kLm' },
        meta: { configured: false },
        serpapi: { configured: true, last4: 'f03c' },
      },
      budget: { monthlyUsd: 5000, alertAtPct: 80, webhookUrl: '' },
      logging: { retentionDays: 30, logPayloads: true, redactPii: true },
      gateway: { baseUrl: 'https://gateway.example.com/v1', region: 'us-east-1' },
    },
  };
}

function load(): State {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { ...initialState(), ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  return initialState();
}

const delay = <T,>(v: T, ms = 120 + Math.random() * 180) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), ms));

const BUCKETS: Record<Range, { n: number; ms: number }> = {
  '1h': { n: 60, ms: 60_000 },
  '24h': { n: 48, ms: 1_800_000 },
  '7d': { n: 42, ms: 14_400_000 },
  '30d': { n: 30, ms: 86_400_000 },
};
const REQ_PER_MIN = 890;

/** Deterministic pseudo-random in [0,1) from a number. */
const hash = (x: number) => {
  const s = Math.sin(x * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

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

  // ---- traffic ----
  const buffer: Trace[] = [];
  const listeners = new Set<(t: Trace) => void>();
  let rate = 1;
  let timer: ReturnType<typeof setTimeout> | undefined;

  {
    const live = liveConfigFromDoc(state.pipeline);
    const now = Date.now();
    for (let i = 0; i < SEED; i++) buffer.push(simulateRequest(live, { ts: now - (i + 1) * 900 - Math.random() * 400 }));
  }

  const push = (t: Trace) => {
    buffer.unshift(t);
    if (buffer.length > BUFFER_MAX) buffer.length = BUFFER_MAX;
    listeners.forEach((l) => l(t));
  };
  const loop = () => {
    timer = setTimeout(() => {
      push(simulateRequest(liveConfigFromDoc(state.pipeline)));
      loop();
    }, (350 + Math.random() * 1000) / rate);
  };

  // ---- metrics derived from the recent buffer, scaled to realistic volume ----
  function ratios() {
    const recent = buffer.slice(0, 600);
    const n = Math.max(1, recent.length);
    const served = recent.filter((t) => t.status !== 'blocked');
    const naive = served.reduce((s, t) => s + t.costBaseline, 0);
    const actual = served.reduce((s, t) => s + t.costActual, 0);
    const pillar = { security: 0, efficiency: 0, search: 0 };
    const threats: Record<string, number> = {};
    for (const t of recent) {
      for (const sp of t.spans) {
        const p = CATALOG[sp.kind].pillar;
        if (p !== 'core' && sp.saved > 0) pillar[p] += sp.saved;
      }
      if (t.threat) threats[t.threat] = (threats[t.threat] ?? 0) + 1;
    }
    const lat = served.map((t) => t.latency).sort((a, b) => a - b);
    return {
      blocked: recent.filter((t) => t.status === 'blocked').length / n,
      flagged: recent.filter((t) => t.status === 'flagged').length / n,
      hit: recent.filter((t) => t.status === 'cache_hit').length / n,
      naivePerReq: naive / Math.max(1, served.length),
      actualRatio: naive ? actual / naive : 1,
      tokensSavedPerReq: served.reduce((s, t) => s + Math.max(0, t.tokensIn - t.tokensSent), 0) / Math.max(1, served.length),
      searchNaivePerReq: served.reduce((s, t) => s + t.searchRaw, 0) / Math.max(1, served.length),
      searchSentPerReq: served.reduce((s, t) => s + t.searchSent, 0) / Math.max(1, served.length),
      p50: lat[Math.floor(lat.length * 0.5)] ?? 0,
      p95: lat[Math.floor(lat.length * 0.95)] ?? 0,
      pillar,
      threats,
      n,
    };
  }

  function series(range: Range): SeriesPoint[] {
    const { n, ms } = BUCKETS[range];
    const r = ratios();
    const end = Math.floor(Date.now() / ms) * ms;
    return Array.from({ length: n }, (_, i) => {
      const t = end - (n - 1 - i) * ms;
      const hour = new Date(t).getHours() + new Date(t).getMinutes() / 60;
      const diurnal = 0.62 + 0.38 * Math.sin(((hour - 8) / 24) * Math.PI * 2);
      const noise = 0.85 + hash(t / ms) * 0.3;
      const requests = Math.round(REQ_PER_MIN * (ms / 60_000) * diurnal * noise);
      const naive = requests * (1 - r.blocked) * r.naivePerReq;
      return { t, requests, blocked: Math.round(requests * r.blocked * (0.7 + hash(t) * 0.6)), costNaive: naive, costActual: naive * r.actualRatio * (0.94 + hash(t + 1) * 0.12) };
    });
  }

  function summary(range: Range): Summary {
    const pts = series(range);
    const r = ratios();
    const requests = pts.reduce((s, p) => s + p.requests, 0);
    const costNaive = pts.reduce((s, p) => s + p.costNaive, 0);
    const costActual = pts.reduce((s, p) => s + p.costActual, 0);
    const saved = costNaive - costActual;
    const ptotal = r.pillar.security + r.pillar.efficiency + r.pillar.search || 1;
    const served = requests * (1 - r.blocked);
    const threatTotal = Object.values(r.threats).reduce((a, b) => a + b, 0) || 1;
    return {
      range,
      requests,
      blocked: pts.reduce((s, p) => s + p.blocked, 0),
      flagged: Math.round(requests * r.flagged),
      cacheHits: Math.round(requests * r.hit),
      costNaive,
      costActual,
      saved,
      tokensSaved: Math.round(served * r.tokensSavedPerReq),
      searchesNaive: Math.round(served * r.searchNaivePerReq),
      searchesSent: Math.round(served * r.searchSentPerReq),
      latencyP50: r.p50,
      latencyP95: r.p95,
      savedByPillar: { security: (saved * r.pillar.security) / ptotal, efficiency: (saved * r.pillar.efficiency) / ptotal, search: (saved * r.pillar.search) / ptotal },
      threats: Object.entries(r.threats)
        .map(([type, c]) => ({ type, count: Math.round(((requests * (r.blocked + r.flagged)) * c) / threatTotal) }))
        .sort((a, b) => b.count - a.count),
    };
  }

  const controls: MockControls = {
    setRate: (r) => {
      rate = r;
    },
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
      return delay(state.pipeline, 150);
    },
    async deploy(_id, note) {
      const version = state.pipeline.deployedVersion + 1;
      const d: Deployment = { version, deployedAt: new Date().toISOString(), author: 'you', note: note || undefined };
      state.pipeline = { ...state.pipeline, deployedVersion: version, hasDraft: false };
      state.snapshots[version] = structuredClone(state.pipeline);
      state.deployments = [d, ...state.deployments];
      save();
      return delay(d, 500);
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
      const ql = q.q?.trim().toLowerCase();
      const limit = q.limit ?? 100;
      const items = buffer
        .filter((t) => (q.before ? t.ts < q.before : true))
        .filter((t) => (!q.status || q.status === 'all' ? true : q.status === 'search' ? t.searchRaw > 0 && t.status !== 'blocked' : t.status === q.status))
        .filter((t) => !ql || t.id.includes(ql) || t.prompt.toLowerCase().includes(ql) || t.app.includes(ql) || t.model.includes(ql))
        .slice(0, limit + 1);
      const more = items.length > limit;
      const page = items.slice(0, limit);
      return delay({ items: page, nextBefore: more ? page[page.length - 1].ts : undefined });
    },
    streamTraces(onTrace) {
      listeners.add(onTrace);
      if (listeners.size === 1) loop();
      return () => {
        listeners.delete(onTrace);
        if (listeners.size === 0) clearTimeout(timer);
      };
    },
    async sendTestRequest(req) {
      const t = simulateRequest(liveConfigFromDoc(state.pipeline), { forceAttack: req.attack });
      await delay(null, Math.min(1200, t.latency / 3));
      push(t);
      return t;
    },

    async getSummary(range) {
      return delay(summary(range));
    },
    async getTimeseries(range) {
      return delay(series(range));
    },

    async listKeys() {
      return delay(state.keys);
    },
    async createKey(name) {
      const rand = Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 57]).join('');
      const secret = `cdt_live_${rand}`;
      const key: NewApiKey = { id: `key_${rand.slice(0, 8)}`, name, prefix: secret.slice(0, 13), createdAt: new Date().toISOString(), requests: 0, secret };
      const { secret: _s, ...stored } = key;
      state.keys = [stored, ...state.keys];
      save();
      return delay(key, 300);
    },
    async revokeKey(id) {
      state.keys = state.keys.filter((k) => k.id !== id);
      save();
      await delay(null, 250);
    },

    async getSettings() {
      return delay(state.settings);
    },
    async updateSettings(patch) {
      const s = state.settings;
      if (patch.providerKeys) {
        for (const [p, v] of Object.entries(patch.providerKeys) as [ProviderId, string][]) {
          s.providers[p] = v ? { configured: true, last4: v.slice(-4) } : { configured: false };
        }
      }
      if (patch.budget) s.budget = { ...s.budget, ...patch.budget };
      if (patch.logging) s.logging = { ...s.logging, ...patch.logging };
      if (patch.gateway) s.gateway = { ...s.gateway, ...patch.gateway };
      save();
      return delay(s, 350);
    },
  };
}
