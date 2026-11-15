/**
 * Tokenomics gateway server.
 *
 *  - OpenAI-compatible proxy:  POST /v1/chat/completions, GET /v1/models   (auth: gateway API key)
 *  - Dashboard/admin API:      everything else under /v1                    (auth: ADMIN_TOKEN)
 *
 * Contract for the admin API: frontend/API.md and core/src/types.ts.
 */
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { ATTACKS, MODELS, sampleRequest, SAMPLES, toRequest, upgradeDoc, wireLinear, type ChatMessage, type PipelineDoc, type ProviderId, type Range, type Settings, type SettingsPatch, type TestRequest, type TraceQuery } from '@tokenomics/core';
import { env } from './env';
import { Gateway } from './gateway';
import { sha256, Store } from './store';

const store = new Store();
const gw = new Gateway(store);

if (!store.state.keys.length) {
  const { secret } = store.createKey('Default');
  console.log(`\n[tokenomics] Created your first gateway API key (shown once):\n\n    ${secret}\n`);
}
if (!env.adminToken) console.warn('[tokenomics] ADMIN_TOKEN is not set — the admin API is open. Set it before exposing this server.');

const app = new Hono();

app.use(
  '*',
  cors({
    origin: (origin) => (!env.corsOrigins.length || env.corsOrigins.includes(origin) ? origin : null),
    credentials: true,
    allowHeaders: ['Authorization', 'Content-Type'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['x-gateway-trace-id', 'x-gateway-saved-usd', 'x-gateway-status', 'x-gateway-cache'],
  }),
);

app.get('/healthz', (c) => c.json({ ok: true, uptime: process.uptime(), helpers: helperStatus }));

// ---- OpenAI-compatible gateway ---------------------------------------------------------------

const oaiError = (c: Context, status: 400 | 401 | 429, message: string, type: string) => c.json({ error: { message, type, code: type } }, status);

function gatewayKey(c: Context) {
  const auth = c.req.header('authorization') ?? '';
  const secret = auth.replace(/^Bearer\s+/i, '').trim();
  return secret ? store.findKey(secret) : undefined;
}

app.get('/v1/models', (c) => c.json({ object: 'list', data: Object.values(MODELS).map((m) => ({ id: m.id, object: 'model', owned_by: m.provider, created: 0 })) }));

app.post('/v1/chat/completions', async (c) => {
  const key = gatewayKey(c);
  if (!key) return oaiError(c, 401, 'Invalid or missing gateway API key. Create one in the dashboard under API keys.', 'invalid_api_key');
  if (!gw.allow(key.id)) return oaiError(c, 429, 'Rate limit exceeded for this API key.', 'rate_limit_exceeded');
  let body: { model?: string; messages?: { role: string; content: unknown }[]; stream?: boolean; max_tokens?: number; max_completion_tokens?: number };
  try {
    body = await c.req.json();
  } catch {
    return oaiError(c, 400, 'Body must be JSON.', 'invalid_request_error');
  }
  if (!Array.isArray(body.messages) || !body.messages.length) return oaiError(c, 400, '`messages` is required.', 'invalid_request_error');

  const messages: ChatMessage[] = body.messages.map((m) => ({
    role: (['system', 'user', 'assistant', 'tool'].includes(m.role) ? m.role : m.role === 'developer' ? 'system' : 'user') as ChatMessage['role'],
    content: typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? m.content.map((p: { text?: string }) => p?.text ?? '').join('\n') : String(m.content ?? ''),
  }));
  const ip = c.req.header('x-forwarded-for')?.split(',')[0].trim() ?? 'local';
  const res = await gw.handle({ model: body.model || 'claude-sonnet-5-5', messages, maxTokens: body.max_completion_tokens ?? body.max_tokens, app: key.name, clientId: `${key.id}:${ip}` });

  key.requests++;
  key.lastUsedAt = new Date().toISOString();
  store.save();

  c.header('x-gateway-trace-id', res.trace.id);
  c.header('x-gateway-saved-usd', res.trace.saved.toFixed(6));
  c.header('x-gateway-status', res.trace.status);
  if (res.trace.cache) c.header('x-gateway-cache', `${res.trace.cache.kind};similarity=${res.trace.cache.similarity.toFixed(3)}`);

  if (res.httpStatus !== 200) return c.json(res.body, res.httpStatus as 403);
  if (!body.stream) return c.json(res.body);

  // Streaming: the answer is complete (PII has to be restored before anything leaves the gateway),
  // so it is re-chunked into OpenAI's SSE format.
  const b = res.body as { id: string; created: number; model: string };
  return streamSSE(c, async (s) => {
    const chunk = (delta: Record<string, unknown>, finish: string | null = null) => s.writeSSE({ data: JSON.stringify({ id: b.id, object: 'chat.completion.chunk', created: b.created, model: b.model, choices: [{ index: 0, delta, finish_reason: finish }] }) });
    await chunk({ role: 'assistant', content: '' });
    for (const piece of res.text.match(/[\s\S]{1,24}/g) ?? []) await chunk({ content: piece });
    await chunk({}, 'stop');
    await s.writeSSE({ data: '[DONE]' });
  });
});

// ---- Admin API -------------------------------------------------------------------------------

const admin = new Hono();
admin.use('*', async (c, next) => {
  if (!env.adminToken) return next();
  const t = (c.req.header('authorization') ?? '').replace(/^Bearer\s+/i, '') || c.req.query('access_token') || '';
  if (t.length === env.adminToken.length && sha256(t) === sha256(env.adminToken)) return next();
  return c.json({ error: { message: 'Admin token required' } }, 401);
});

const pipelineOr404 = (c: Context, id: string) => (id === store.state.pipeline.id ? null : c.json({ error: { message: `Pipeline "${id}" not found` } }, 404));

admin.get('/pipelines/:id', (c) => pipelineOr404(c, c.req.param('id')) ?? c.json(store.state.pipeline));
admin.put('/pipelines/:id/draft', async (c) => {
  const nf = pipelineOr404(c, c.req.param('id'));
  if (nf) return nf;
  const doc = (await c.req.json()) as PipelineDoc;
  if (!Array.isArray(doc.nodes) || !Array.isArray(doc.edges) || !doc.nodes.some((n) => n.kind === 'ingress')) return c.json({ error: { message: 'A pipeline needs nodes, edges and an Ingress node.' } }, 400);
  const p = store.state.pipeline;
  // The tool order is the source of truth; the server derives the edges itself.
  store.state.pipeline = wireLinear(upgradeDoc({ ...p, nodes: doc.nodes, edges: doc.edges, hasDraft: true, updatedAt: new Date().toISOString() }));
  store.save();
  return c.json(store.state.pipeline);
});
admin.post('/pipelines/:id/deploy', async (c) => {
  const nf = pipelineOr404(c, c.req.param('id'));
  if (nf) return nf;
  const { note } = ((await c.req.json().catch(() => ({}))) ?? {}) as { note?: string };
  const p = store.state.pipeline;
  const version = Math.max(p.deployedVersion, ...store.state.deployments.map((d) => d.version)) + 1;
  store.state.pipeline = { ...p, deployedVersion: version, hasDraft: false };
  store.state.snapshots[version] = structuredClone(store.state.pipeline);
  const d = { version, deployedAt: new Date().toISOString(), author: 'dashboard', note: note || undefined };
  store.state.deployments.unshift(d);
  store.save();
  return c.json(d);
});
admin.get('/pipelines/:id/deployments', (c) => c.json(store.state.deployments));
admin.post('/pipelines/:id/restore', async (c) => {
  const { version } = (await c.req.json()) as { version: number };
  const snap = store.state.snapshots[version];
  if (!snap) return c.json({ error: { message: `Version ${version} not found` } }, 404);
  store.state.pipeline = { ...structuredClone(snap), deployedVersion: store.state.pipeline.deployedVersion, hasDraft: true, updatedAt: new Date().toISOString() };
  store.save();
  return c.json(store.state.pipeline);
});

admin.get('/traces', (c) => {
  const q: TraceQuery = { status: (c.req.query('status') as TraceQuery['status']) || 'all', q: c.req.query('q'), limit: Math.min(500, Number(c.req.query('limit') ?? 100)), before: c.req.query('before') ? Number(c.req.query('before')) : undefined };
  const ql = q.q?.trim().toLowerCase();
  const items = gw.traces
    .filter((t) => (q.before ? t.ts < q.before : true))
    .filter((t) => (q.status === 'all' ? true : q.status === 'search' ? t.searchRaw > 0 && t.searchSent > 0 : t.status === q.status))
    .filter((t) => !ql || t.id.toLowerCase().includes(ql) || t.prompt.toLowerCase().includes(ql) || t.app.toLowerCase().includes(ql))
    .slice(0, q.limit! + 1);
  const page = items.slice(0, q.limit);
  return c.json({ items: page, nextBefore: items.length > q.limit! ? page[page.length - 1].ts : undefined });
});

admin.get('/traces/stream', (c) =>
  streamSSE(c, async (s) => {
    const queue: string[] = [];
    let wake: (() => void) | null = null;
    const off = gw.subscribe((t) => {
      queue.push(JSON.stringify(t));
      wake?.();
    });
    s.onAbort(() => {
      off();
      wake?.();
    });
    while (!s.aborted) {
      while (queue.length) await s.writeSSE({ event: 'trace', data: queue.shift()! });
      await Promise.race([new Promise<void>((r) => (wake = r)), new Promise((r) => setTimeout(r, 15_000))]);
      wake = null;
      if (!queue.length && !s.aborted) await s.write(': keep-alive\n\n');
    }
  }),
);

admin.post('/test-requests', async (c) => {
  const body = ((await c.req.json().catch(() => ({}))) ?? {}) as TestRequest;
  const req = body.prompt
    ? toRequest({ app: 'live-demo', model: body.model || 'claude-sonnet-5-5', prompt: body.prompt.slice(0, 8000), system: 'You are a helpful assistant.' })
    : body.attack
      ? toRequest(ATTACKS[Math.floor(Math.random() * ATTACKS.length)])
      : toRequest(SAMPLES[Math.floor(Math.random() * SAMPLES.length)]);
  req.clientId = `dashboard:${c.req.header('x-forwarded-for') ?? 'local'}`;
  const res = await gw.handle(req, { draft: true });
  return c.json({ ...res.trace, response: res.httpStatus === 200 ? res.text : String((res.body as { error?: { message?: string } }).error?.message ?? 'Request failed') });
});

const RANGES = ['1h', '24h', '7d', '30d'];
const range = (c: Context): Range => (RANGES.includes(c.req.query('range') ?? '') ? (c.req.query('range') as Range) : '24h');
admin.get('/metrics/summary', (c) => c.json(gw.metrics.summary(range(c))));
admin.get('/metrics/timeseries', (c) => c.json(gw.metrics.series(range(c))));
admin.get('/metrics/lifetime', (c) => c.json(gw.metrics.lifetime()));

admin.get('/security/honeypot', (c) => c.json(gw.honeypotSessions()));

admin.get('/keys', (c) => c.json(store.state.keys.map(({ hash: _h, ...k }) => k)));
admin.post('/keys', async (c) => {
  const { name } = (await c.req.json()) as { name?: string };
  if (!name?.trim()) return c.json({ error: { message: 'Name is required' } }, 400);
  const { key, secret } = store.createKey(name.trim().slice(0, 60));
  return c.json({ ...key, secret });
});
admin.delete('/keys/:id', (c) => {
  store.state.keys = store.state.keys.filter((k) => k.id !== c.req.param('id'));
  store.save();
  return c.body(null, 204);
});

const PROVIDERS: ProviderId[] = ['anthropic', 'openai', 'meta', 'serpapi'];

// Poll the Python helpers sidecar so the dashboard can show what's live.
let helperStatus: Settings['helpers'] = null;
async function pollHelpers() {
  if (!env.helpersUrl) return;
  try {
    const h = (await fetch(`${env.helpersUrl}/health`, { signal: AbortSignal.timeout(5000) }).then((r) => r.json())) as { router: boolean; compressor: boolean; planner: boolean };
    helperStatus = { url: env.helpersUrl, router: !!h.router, compressor: !!h.compressor, planner: !!h.planner };
  } catch {
    helperStatus = { url: env.helpersUrl, router: false, compressor: false, planner: false };
  }
}
void pollHelpers();
setInterval(pollHelpers, 30_000).unref();
function settings(c: Context): Settings {
  const providers = Object.fromEntries(
    PROVIDERS.map((p) => {
      const { key, source } = store.providerKey(p);
      return [p, key ? { configured: true, last4: key.slice(-4), source } : { configured: false }];
    }),
  ) as Settings['providers'];
  const s = store.state.settings;
  return { ...s, providers, helpers: helperStatus, gateway: { ...s.gateway, baseUrl: env.publicBaseUrl || `${new URL(c.req.url).origin}/v1` } };
}
admin.get('/settings', (c) => c.json(settings(c)));
admin.patch('/settings', async (c) => {
  const p = (await c.req.json()) as SettingsPatch;
  const s = store.state.settings;
  for (const [prov, v] of Object.entries(p.providerKeys ?? {}) as [ProviderId, string][]) {
    if (!PROVIDERS.includes(prov)) continue;
    if (v) store.state.secrets[prov] = store.encrypt(v.trim());
    else delete store.state.secrets[prov];
  }
  if (p.budget) s.budget = { ...s.budget, ...p.budget };
  if (p.logging) s.logging = { ...s.logging, ...p.logging };
  if (p.gateway?.region) s.gateway.region = p.gateway.region;
  if (p.routing?.profile && ['eco', 'balanced', 'performance'].includes(p.routing.profile)) s.routing.profile = p.routing.profile;
  store.save();
  return c.json(settings(c));
});

app.route('/v1', admin);

// Optional: serve the built dashboard from the same origin.
if (env.staticDir) {
  app.use('/*', serveStatic({ root: env.staticDir }));
  app.get('*', serveStatic({ path: `${env.staticDir}/index.html` }));
}

for (const sig of ['SIGINT', 'SIGTERM'] as const)
  process.on(sig, () => {
    store.flush();
    process.exit(0);
  });

serve({ fetch: app.fetch, port: env.port, hostname: env.host }, (i) => {
  const keys = (['anthropic', 'openai', 'meta', 'serpapi'] as ProviderId[]).map((p) => `${p}:${store.providerKey(p).key ? 'live' : 'simulated'}`).join(' ');
  console.log(`[tokenomics] gateway listening on http://${env.host}:${i.port} · providers ${keys}`);
});

export { app, sampleRequest };
