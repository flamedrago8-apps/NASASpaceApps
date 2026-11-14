import { ApiError, type GatewayApi } from './client';
import type { Trace } from './types';

/**
 * REST + SSE client for the real gateway backend. Endpoints are documented in API.md.
 * Auth: sends `Authorization: Bearer <VITE_API_TOKEN>` when set, plus cookies.
 */
export function createHttpApi(baseUrl: string, token?: string): GatewayApi {
  const base = baseUrl.replace(/\/$/, '');

  async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${base}${path}`, {
      method,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let msg = res.statusText;
      try {
        const j = await res.json();
        msg = j.error?.message ?? j.message ?? msg;
      } catch {
        /* non-JSON error body */
      }
      throw new ApiError(msg || `Request failed (${res.status})`, res.status);
    }
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }

  const qs = (o: Record<string, unknown>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '' && v !== 'all') p.set(k, String(v));
    const s = p.toString();
    return s ? `?${s}` : '';
  };
  const enc = encodeURIComponent;

  return {
    mode: 'http',

    getPipeline: (id) => req('GET', `/v1/pipelines/${enc(id)}`),
    saveDraft: (doc) => req('PUT', `/v1/pipelines/${enc(doc.id)}/draft`, doc),
    deploy: (id, note) => req('POST', `/v1/pipelines/${enc(id)}/deploy`, { note }),
    listDeployments: (id) => req('GET', `/v1/pipelines/${enc(id)}/deployments`),
    restoreVersion: (id, version) => req('POST', `/v1/pipelines/${enc(id)}/restore`, { version }),

    listTraces: (q) => req('GET', `/v1/traces${qs(q)}`),
    streamTraces(onTrace, onError) {
      // EventSource can't send headers, so the token goes in the query string for SSE.
      const url = `${base}/v1/traces/stream${token ? `?access_token=${enc(token)}` : ''}`;
      const es = new EventSource(url, { withCredentials: true });
      es.addEventListener('trace', (ev) => {
        try {
          onTrace(JSON.parse((ev as MessageEvent).data) as Trace);
        } catch (e) {
          onError?.(e);
        }
      });
      es.onerror = (e) => onError?.(e);
      return () => es.close();
    },
    sendTestRequest: (r) => req('POST', `/v1/test-requests`, r),

    getSummary: (range) => req('GET', `/v1/metrics/summary${qs({ range })}`),
    getTimeseries: (range) => req('GET', `/v1/metrics/timeseries${qs({ range })}`),
    getLifetime: () => req('GET', `/v1/metrics/lifetime`),
    listHoneypotSessions: () => req('GET', `/v1/security/honeypot`),

    listKeys: () => req('GET', `/v1/keys`),
    createKey: (name) => req('POST', `/v1/keys`, { name }),
    revokeKey: (id) => req('DELETE', `/v1/keys/${enc(id)}`),

    getSettings: () => req('GET', `/v1/settings`),
    updateSettings: (patch) => req('PATCH', `/v1/settings`, patch),
  };
}
