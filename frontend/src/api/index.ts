import type { GatewayApi } from './client';
import { createHttpApi } from './http';
import { createMockApi, type MockControls } from './mock';

/**
 * Where the dashboard gets its data, in priority order:
 *  1. a gateway connected from Settings → Gateway connection (saved in this browser)
 *  2. VITE_API_URL at build time ("/" = the backend serving this dashboard)
 *  3. the in-browser demo (same engine, simulated providers)
 */
const CONN_KEY = 'tokenomics.connection';

/** Wipe everything this dashboard saved in the browser (old "conduit.*" keys included). */
export function resetLocalData() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('tokenomics.') || k.startsWith('conduit.')) localStorage.removeItem(k);
  } catch {
    /* storage unavailable */
  }
}

// Data saved by builds from before the rename can't be trusted (old demo state, a gateway
// connection that may no longer exist), so drop it. `?reset` in the URL clears everything.
try {
  for (const k of Object.keys(localStorage)) if (k.startsWith('conduit.')) localStorage.removeItem(k);
  const q = new URLSearchParams(window.location.search);
  if (q.has('reset')) {
    resetLocalData();
    q.delete('reset');
    const qs = q.toString();
    history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash);
  }
} catch {
  /* storage unavailable */
}
export type Connection = { url: string; token?: string };

export function savedConnection(): Connection | null {
  try {
    const raw = localStorage.getItem(CONN_KEY);
    return raw ? (JSON.parse(raw) as Connection) : null;
  } catch {
    return null;
  }
}

export function saveConnection(c: Connection | null) {
  try {
    if (c) localStorage.setItem(CONN_KEY, JSON.stringify(c));
    else localStorage.removeItem(CONN_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Check a gateway before switching to it: reachable, and the token is accepted. */
export async function testConnection(c: Connection): Promise<void> {
  const base = c.url.replace(/\/$/, '');
  const health = await fetch(`${base}/healthz`).catch(() => null);
  if (!health?.ok) throw new Error(`Can’t reach ${base}. Check the URL, that the server is running, and that it uses https if this page does.`);
  const res = await fetch(`${base}/v1/settings`, { headers: c.token ? { Authorization: `Bearer ${c.token}` } : {}, credentials: 'include' });
  if (res.status === 401) throw new Error('Connected, but the admin token was rejected.');
  if (!res.ok) throw new Error(`Connected, but the gateway returned ${res.status}.`);
}

const conn = savedConnection();
const envUrl = import.meta.env.VITE_API_URL as string | undefined;
const url = conn?.url || envUrl;
const token = conn ? conn.token : (import.meta.env.VITE_API_TOKEN as string | undefined);

/** Human-readable name of the data source, for the UI. */
export const SOURCE = !url ? 'Demo data' : url === '/' ? window.location.host : url.replace(/^https?:\/\//, '').replace(/\/$/, '');
export const CONNECTED_AT_RUNTIME = !!conn;

/** Resolves to an error message if the configured gateway can't be reached, else null. */
export async function checkGateway(): Promise<string | null> {
  if (!url) return null;
  const base = url === '/' ? '' : url.replace(/\/$/, '');
  const res = await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(6000) }).catch(() => null);
  return res?.ok ? null : `Can’t reach the gateway at ${SOURCE}.`;
}

const mock = url ? null : createMockApi();

/** The one API instance the app talks to. */
export const api: GatewayApi = url ? createHttpApi(url === '/' ? '' : url, token) : mock!;

/** Demo-only controls (traffic rate, reset). Null when talking to a real backend. */
export const mockControls: MockControls | null = mock?.controls ?? null;

export const PIPELINE_ID = (import.meta.env.VITE_PIPELINE_ID as string | undefined) || 'chat-default';

export * from './client';
export * from './types';
