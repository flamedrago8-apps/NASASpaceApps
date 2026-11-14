/**
 * Durable state in a single JSON file (atomic writes) plus an append-only trace log.
 * Deliberately simple: one process, no database to provision. Swap for Postgres/Redis
 * when you need multiple gateway replicas.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { defaultPipelineDoc, upgradeDoc, type ApiKey, type Deployment, type HoneypotSession, type MetricsSnapshot, type PipelineDoc, type ProviderId, type Settings, type Trace } from '@conduit/core';
import { env } from './env';

type StoredKey = ApiKey & { hash: string };

export type State = {
  pipeline: PipelineDoc;
  snapshots: Record<number, PipelineDoc>;
  deployments: Deployment[];
  keys: StoredKey[];
  settings: Omit<Settings, 'providers'>;
  secrets: Partial<Record<ProviderId, string>>; // AES-GCM encrypted
  honeypot: HoneypotSession[];
  metrics?: MetricsSnapshot;
};

const STATE = () => path.join(env.dataDir, 'state.json');
const TRACES = () => path.join(env.dataDir, 'traces.jsonl');

export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

function initial(): State {
  const pipeline = defaultPipelineDoc();
  return {
    pipeline,
    snapshots: { [pipeline.deployedVersion]: pipeline },
    deployments: [{ version: pipeline.deployedVersion, deployedAt: new Date().toISOString(), author: 'system', note: 'Initial pipeline' }],
    keys: [],
    settings: {
      budget: { monthlyUsd: 500, alertAtPct: 80, webhookUrl: '' },
      logging: { retentionDays: 30, logPayloads: true, redactPii: false },
      gateway: { baseUrl: '', region: 'us-east-1' },
      routing: { profile: 'balanced' },
    },
    secrets: {},
    honeypot: [],
  };
}

export class Store {
  state: State;
  private timer: NodeJS.Timeout | null = null;
  private cipherKey: Buffer;
  private traceFd: number;
  getMetrics: () => MetricsSnapshot | undefined = () => undefined;

  constructor() {
    fs.mkdirSync(env.dataDir, { recursive: true });
    this.cipherKey = crypto.createHash('sha256').update(loadSecret()).digest();
    let s: State;
    try {
      s = { ...initial(), ...JSON.parse(fs.readFileSync(STATE(), 'utf8')) };
    } catch {
      s = initial();
    }
    s.pipeline = upgradeDoc(s.pipeline);
    s.settings = { ...initial().settings, ...s.settings, routing: { ...initial().settings.routing, ...s.settings?.routing } };
    this.state = s;
    this.traceFd = fs.openSync(TRACES(), 'a');
  }

  get deployedDoc(): PipelineDoc {
    return upgradeDoc(this.state.snapshots[this.state.pipeline.deployedVersion] ?? this.state.pipeline);
  }

  save() {
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), 500);
  }

  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const tmp = STATE() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ ...this.state, metrics: this.getMetrics() }));
    fs.renameSync(tmp, STATE());
  }

  appendTrace(t: Trace) {
    fs.writeSync(this.traceFd, JSON.stringify(t) + '\n');
  }

  /** Most recent traces from the log, newest first, dropping those past retention. */
  loadTraces(max: number): Trace[] {
    let raw = '';
    try {
      raw = fs.readFileSync(TRACES(), 'utf8');
    } catch {
      return [];
    }
    const lines = raw.split('\n').filter(Boolean);
    const cutoff = Date.now() - this.state.settings.logging.retentionDays * 86_400_000;
    const keep = lines.slice(-max).map((l) => JSON.parse(l) as Trace).filter((t) => t.ts >= cutoff);
    if (lines.length > max * 2) {
      // Compact the log so it doesn't grow forever.
      fs.writeFileSync(TRACES(), keep.map((t) => JSON.stringify(t)).join('\n') + '\n');
    }
    return keep.reverse();
  }

  // ---- secrets ----
  encrypt(plain: string): string {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', this.cipherKey, iv);
    const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
  }
  decrypt(blob: string): string {
    const [iv, tag, enc] = blob.split('.').map((s) => Buffer.from(s, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', this.cipherKey, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  }

  providerKey(p: ProviderId): { key: string; source?: 'env' | 'dashboard' } {
    if (env.providerEnv[p]) return { key: env.providerEnv[p], source: 'env' };
    const blob = this.state.secrets[p];
    if (!blob) return { key: '' };
    try {
      return { key: this.decrypt(blob), source: 'dashboard' };
    } catch {
      return { key: '' };
    }
  }

  // ---- gateway keys ----
  createKey(name: string): { key: ApiKey; secret: string } {
    const rand = crypto.randomBytes(24).toString('base64url');
    const secret = `cdt_live_${rand}`;
    const key: StoredKey = { id: `key_${rand.slice(0, 10)}`, name, prefix: secret.slice(0, 13), createdAt: new Date().toISOString(), requests: 0, hash: sha256(secret) };
    this.state.keys.unshift(key);
    this.save();
    const { hash: _h, ...pub } = key;
    return { key: pub, secret };
  }

  findKey(secret: string): StoredKey | undefined {
    const h = sha256(secret);
    return this.state.keys.find((k) => crypto.timingSafeEqual(Buffer.from(k.hash), Buffer.from(h)));
  }
}

function loadSecret(): string {
  if (env.secretKey) return env.secretKey;
  const f = path.join(env.dataDir, '.secret');
  try {
    return fs.readFileSync(f, 'utf8');
  } catch {
    const s = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(f, s, { mode: 0o600 });
    console.warn(`[conduit] SECRET_KEY not set — generated one at ${f}. Set SECRET_KEY in production.`);
    return s;
  }
}
