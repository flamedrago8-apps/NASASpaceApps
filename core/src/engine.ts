/**
 * Pipeline engine. Walks the policy graph from the Ingress node, running each node's
 * handler and following the edge for the branch it chose (`out` or `alt`). The canvas
 * IS the policy: rewiring an edge changes how real traffic flows.
 *
 * The engine is isomorphic (no Node or DOM APIs). Upstream I/O goes through the
 * `Providers` interface, time through `Clock`, so the backend runs it against real
 * APIs and the dashboard demo runs it in the browser against simulated providers.
 */
import { NODE_SPECS } from './catalog';
import { detectInjection, detectJailbreak, fmtConfidence } from './detect';
import { classifySearchIntent, naiveQueries, plannedQueries, queryKey } from './intent';
import { compressMessages, honeypotSystemPrompt, promptText, TtlCache } from './misc';
import { restorePii, swapPii } from './pii';
import { EMBED_PRICE, HONEYPOT_PRICE, modelInfo, PROFILE_SEARCH, routeModel, SERP_COST, SERP_CTX_TOKENS, tokenCost } from './pricing';
import { entities, entitiesMatch, SemanticCache } from './semantic';
import { estimateTokens, hashKey } from './text';
import type { NodeConfig, NodeKind, PiiSwap, PipelineDoc, PipelineNodeDTO, Profile, Span, SpanOutcome, Trace, TraceStatus } from './types';

// ---- I/O contracts ----------------------------------------------------------------------------

export type ChatMessage = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string };

export type GatewayRequest = {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  app: string; // API key name
  clientId: string; // fingerprint for honeypot sessions (key id + IP)
};

export type ChatResult = { text: string; inputTokens: number; outputTokens: number; model: string; simulated?: boolean };
export type SearchResult = { title: string; url: string; snippet: string; source: string };

export interface Providers {
  chat(model: string, messages: ChatMessage[], opts: { maxTokens: number }): Promise<ChatResult>;
  embed(text: string): Promise<{ vector: number[]; remote: boolean }>;
  search(query: string, engine: string, num: number): Promise<{ results: SearchResult[]; simulated?: boolean }>;
  honeypot(messages: ChatMessage[], persona: string): Promise<ChatResult>;
  /** Optional ML helpers (the Python sidecar). The engine falls back to built-in logic when absent or failing. */
  classifyTier?(prompt: string): Promise<'fast' | 'advanced'>;
  compress?(text: string): Promise<string>;
  planQueries?(prompt: string): Promise<string[]>;
}

export interface Clock {
  now(): number; // ms, monotonic within a request
  wall(): number; // epoch ms
  sleep(ms: number): Promise<void>;
}

export type CachedAnswer = { text: string; outputTokens: number; model: string; prompt: string; costBaseline: number };

export type EngineStores = {
  exact: TtlCache<CachedAnswer>;
  semantic: SemanticCache<CachedAnswer>;
  serp: TtlCache<SearchResult[]>;
  inflight: Map<string, Promise<SearchResult[]>>;
};

export const createStores = (): EngineStores => ({ exact: new TtlCache(), semantic: new SemanticCache(), serp: new TtlCache(), inflight: new Map() });

export type EngineContext = {
  providers: Providers;
  stores: EngineStores;
  clock: Clock;
  profile: Profile;
  logPayloads: boolean;
  redactPiiInLogs: boolean;
  newId(): string;
};

export type EngineResult = {
  trace: Trace;
  httpStatus: number;
  /** OpenAI chat.completion body (or OpenAI-style error body). */
  body: Record<string, unknown>;
  text: string;
};

// ---- Run state --------------------------------------------------------------------------------

type State = {
  req: GatewayRequest;
  messages: ChatMessage[];
  pii: PiiSwap[];
  piiMode: string;
  status: TraceStatus;
  threat?: { type: string; confidence: number; signals: string[] };
  leaked: boolean;
  naiveQueries: string[];
  /** SerpAPI calls the naive baseline makes: 1 per prompt, the full fan-out when live data is needed. */
  naiveCalls: number;
  queries: string[];
  results: SearchResult[];
  searchSent: number;
  searchBypassed: boolean;
  cacheHit?: Trace['cache'];
  answer?: { text: string; outputTokens: number; model: string; inputTokens: number; simulated?: boolean };
  upstreamInput?: string;
  routedModel: string;
  embedding?: { vector: number[]; ents: string[]; partition: string };
  tokensSent: number;
  extraCost: number; // embeddings, honeypot, searches
  httpStatus: number;
  errorBody?: Record<string, unknown>;
  ttlCap?: number;
  simulated: boolean;
  tokensInNaive: number;
  serpTtl: number;
  exactTtl: number;
  semanticTtl: number;
};

type Out = { outcome: SpanOutcome; detail: string; branch?: 'out' | 'alt' | 'end'; saved?: number; meta?: string[]; tokensSaved?: number };
type Handler = (s: State, cfg: NodeConfig, ctx: EngineContext, node: PipelineNodeDTO) => Promise<Out>;

const lastUser = (m: ChatMessage[]) => [...m].reverse().find((x) => x.role === 'user')?.content ?? '';
const MAX_AGE: Record<string, number> = { '5m': 300_000, '10m': 600_000, '1h': 3_600_000, '6h': 21_600_000 };

// ---- Node handlers ----------------------------------------------------------------------------

const H: Record<NodeKind, Handler> = {
  async ingress(s) {
    return { outcome: 'pass', detail: `${s.req.app} · ${s.tokensInNaive.toLocaleString()} tok · ${s.req.model}` };
  },

  async injection(s, cfg) {
    const text = promptText(s.messages, cfg.scanTools ? ['user', 'tool', 'assistant'] : ['user']);
    const d = detectInjection(text);
    return securityVerdict(s, cfg, d, 'prompt_injection', 'Prompt injection');
  },

  async jailbreak(s, cfg) {
    const d = detectJailbreak(promptText(s.messages));
    return securityVerdict(s, cfg, d, 'jailbreak', 'Jailbreak attempt');
  },

  async pii(s, cfg) {
    const mode = String(cfg.mode) as 'synthetic' | 'redact' | 'mask';
    s.piiMode = mode;
    const swaps: PiiSwap[] = [];
    s.messages = s.messages.map((m) => (m.role === 'user' || m.role === 'system' ? { ...m, content: swapPii(m.content, mode, Boolean(cfg.names), swaps).text } : m));
    s.pii = swaps;
    if (!swaps.length) return { outcome: 'pass', detail: 'no PII found' };
    const kinds = [...new Set(swaps.map((x) => x.type))].join(', ');
    return {
      outcome: 'redacted',
      detail: mode === 'synthetic' ? `swapped ${swaps.length} value${swaps.length > 1 ? 's' : ''} (${kinds}) with synthetic data` : `${mode}ed ${swaps.length} value${swaps.length > 1 ? 's' : ''} (${kinds})`,
      meta: swaps.map((x) => `${x.type}: ${x.synthetic}`),
    };
  },

  async block(s) {
    s.status = 'blocked';
    s.httpStatus = 403;
    const t = s.threat;
    s.errorBody = {
      error: {
        message: `Request blocked by gateway policy: ${t?.type ?? 'policy_violation'}${t ? ` (${fmtConfidence(t.confidence)} confidence)` : ''}.`,
        type: 'policy_violation',
        code: t?.type ?? 'policy_violation',
      },
    };
    return { outcome: 'blocked', detail: `403 · ${t ? `${label(t.type)} blocked (${fmtConfidence(t.confidence)})` : 'policy violation'} · upstream never called`, branch: 'end' };
  },

  async honeypot(s, cfg, ctx) {
    s.status = 'honeypot';
    const persona = String(cfg.persona);
    const tarpit = Number(cfg.tarpitMs) || 0;
    if (tarpit) await ctx.clock.sleep(tarpit);
    const r = await ctx.providers.honeypot([{ role: 'system', content: honeypotSystemPrompt(persona) }, ...s.messages.filter((m) => m.role !== 'system')], persona);
    s.answer = { text: r.text, outputTokens: r.outputTokens, inputTokens: r.inputTokens, model: s.req.model, simulated: r.simulated };
    s.extraCost += r.simulated ? 0 : (r.inputTokens * HONEYPOT_PRICE.in + r.outputTokens * HONEYPOT_PRICE.out) / 1e6;
    s.simulated ||= !!r.simulated;
    return {
      outcome: 'trapped',
      detail: `attacker routed to sandboxed decoy (${persona}${r.simulated ? ', local' : `, ${r.model}`}) · +${(tarpit / 1000).toFixed(1)}s tarpit · real models untouched`,
      branch: 'end',
    };
  },

  async exactCache(s, cfg, ctx) {
    s.exactTtl = Number(cfg.ttl) * 1000;
    if (s.pii.length) return { outcome: 'miss', detail: 'skipped: request contains PII' };
    const key = exactKey(s);
    const hit = ctx.stores.exact.get(key, ctx.clock.wall());
    if (!hit) return { outcome: 'miss', detail: `no entry · key ${key.slice(0, 10)}` };
    s.answer = { text: hit.text, outputTokens: hit.outputTokens, inputTokens: 0, model: hit.model };
    s.cacheHit = { kind: 'exact', similarity: 1, matched: hit.prompt };
    s.status = s.status === 'flagged' ? 'flagged' : 'cache_hit';
    return { outcome: 'hit', detail: `exact match · key ${key.slice(0, 10)}`, branch: 'alt' };
  },

  async semanticCache(s, cfg, ctx) {
    s.semanticTtl = Number(cfg.ttl) * 1000;
    if (s.pii.length) return { outcome: 'miss', detail: 'skipped: request contains PII' };
    const text = lastUser(s.messages);
    const { vector, remote } = await ctx.providers.embed(text);
    if (remote) s.extraCost += (estimateTokens(text) * EMBED_PRICE) / 1e6;
    const ents = [...entities(text)];
    const partition = partitionKey(s);
    s.embedding = { vector, ents, partition };
    const near = ctx.stores.semantic.nearest(vector, partition, ctx.clock.wall());
    const th = Number(cfg.similarity);
    if (!near) return { outcome: 'miss', detail: 'cache empty for this context' };
    const pct = (near.sim * 100).toFixed(1);
    if (near.sim < th) return { outcome: 'miss', detail: `best match ${pct}% < ${(th * 100).toFixed(0)}% · “${trim(near.entry.text, 40)}”` };
    if (cfg.entityGuard && !entitiesMatch(new Set(ents), new Set(near.entry.entities)))
      return { outcome: 'miss', detail: `${pct}% similar but entities differ (${ents.join(', ') || '—'} vs ${near.entry.entities.join(', ') || '—'})` };
    const hit = near.entry.value;
    s.answer = { text: hit.text, outputTokens: hit.outputTokens, inputTokens: 0, model: hit.model };
    s.cacheHit = { kind: 'semantic', similarity: near.sim, matched: near.entry.text };
    s.status = s.status === 'flagged' ? 'flagged' : 'cache_hit';
    return { outcome: 'hit', detail: `${pct}% semantic match · “${trim(near.entry.text, 48)}”`, branch: 'alt' };
  },

  async compressor(s, cfg, ctx) {
    const r = compressMessages(s.messages, Number(cfg.keepTurns), String(cfg.strategy));
    s.messages = r.messages;
    let via = '';
    // LLMLingua-2 (Python sidecar) on long context: older turns, and pasted documents in the latest message.
    if (ctx.providers.compress) {
      const lastU = s.messages.map((m) => m.role).lastIndexOf('user');
      try {
        const out = await Promise.all(
          s.messages.map(async (m, i) => (m.role !== 'system' && (i !== lastU || m.content.length > 1200) && m.content.length > 400 ? { ...m, content: await ctx.providers.compress!(m.content) } : m)),
        );
        const after = out.reduce((n, m) => n + estimateTokens(m.content), 0);
        if (after < r.after) {
          s.messages = out;
          r.after = after;
          via = ' · LLMLingua-2';
        }
      } catch {
        via = ' · LLMLingua unavailable, used built-in';
      }
    }
    const saved = r.before - r.after;
    const pin = modelInfo(s.routedModel).in / 1e6;
    if (saved <= 0) return { outcome: 'pass', detail: `${r.before.toLocaleString()} tok · nothing to prune${via}` };
    return { outcome: 'pass', detail: `${r.before.toLocaleString()} → ${r.after.toLocaleString()} tok (−${Math.round((saved / r.before) * 100)}%)${via}`, saved: saved * pin, tokensSaved: saved };
  },

  async searchIntent(s, cfg, ctx) {
    const intent = classifySearchIntent(lastUser(s.messages));
    const prof = PROFILE_SEARCH[ctx.profile];
    const th = prof.threshold || Number(cfg.threshold);
    const pin = modelInfo(s.req.model).in / 1e6;
    if (intent.pSearch < th) {
      s.searchBypassed = true;
      const naive = s.naiveCalls;
      return {
        outcome: 'skipped',
        detail: `Bypassed — ${intent.reason === 'internal knowledge sufficient' ? 'internal knowledge sufficient' : `${intent.reason}: internal knowledge sufficient`} (${fmtConfidence(1 - intent.pSearch)}) · saved ${naive} search${naive === 1 ? '' : 'es'}`,
        branch: 'alt',
        saved: naive * (SERP_COST + SERP_CTX_TOKENS * pin),
      };
    }
    s.ttlCap = 600_000; // answers built on live data go stale fast
    return { outcome: 'pass', detail: `live data needed: ${intent.reason} (${fmtConfidence(intent.pSearch)}) · ${ctx.profile}` };
  },

  async serpCache(s, cfg, ctx) {
    if (s.searchBypassed) return { outcome: 'skipped', detail: 'not needed: no live data required' };
    s.serpTtl = MAX_AGE[String(cfg.maxAge)] ?? 600_000;
    const merged = plannedQueries(lastUser(s.req.messages), PROFILE_SEARCH[ctx.profile].maxQueries);
    const now = ctx.clock.wall();
    const cached = merged.map((q) => ctx.stores.serp.get(queryKey(q), now));
    const pin = modelInfo(s.req.model).in / 1e6;
    if (cached.every(Boolean)) {
      s.results = dedupeResults(cached.flat() as SearchResult[]);
      return {
        outcome: 'hit',
        detail: `${merged.length} quer${merged.length > 1 ? 'ies' : 'y'} served from cache (≤ ${cfg.maxAge}) · ${s.results.length} results`,
        branch: 'alt',
        saved: s.naiveCalls * SERP_COST + Math.max(0, s.naiveCalls - merged.length) * SERP_CTX_TOKENS * pin,
        meta: merged,
      };
    }
    s.queries = s.naiveQueries;
    const partial = cached.filter(Boolean).length;
    return { outcome: 'miss', detail: partial ? `${partial}/${merged.length} cached` : `no fresh entry ≤ ${cfg.maxAge}` };
  },

  async queryOptimizer(s, cfg, ctx) {
    if (s.searchBypassed) return { outcome: 'skipped', detail: 'not needed: no live data required' };
    const raw = s.queries.length ? s.queries : s.naiveQueries;
    const max = Math.min(Number(cfg.maxQueries), PROFILE_SEARCH[ctx.profile].maxQueries);
    s.queries = plannedQueries(lastUser(s.req.messages), max);
    let via = '';
    if (ctx.providers.planQueries) {
      try {
        const planned = (await ctx.providers.planQueries(lastUser(s.req.messages))).filter(Boolean);
        if (planned.length) {
          s.queries = planned.slice(0, max);
          via = ' · planned by local LLM';
        }
      } catch {
        via = ' · planner unavailable, used built-in';
      }
    }
    const pin = modelInfo(s.req.model).in / 1e6;
    const avoided = Math.max(0, s.naiveCalls - s.queries.length);
    return {
      outcome: 'pass',
      detail: `${s.naiveCalls} naive → ${s.queries.length} quer${s.queries.length > 1 ? 'ies' : 'y'}${avoided ? ` (−${avoided})` : ''}${via}`,
      saved: avoided * (SERP_COST + SERP_CTX_TOKENS * pin),
      meta: [...raw.filter((q) => !s.queries.includes(q)).map((q) => `− ${q}`), ...s.queries.map((q) => `+ ${q}`)],
    };
  },

  async serpApi(s, cfg, ctx) {
    if (s.searchBypassed) return { outcome: 'skipped', detail: 'not needed: no live data required' };
    const queries = s.queries.length ? s.queries : s.naiveQueries;
    const prof = PROFILE_SEARCH[ctx.profile];
    const engines = prof.engines > 1 ? [String(cfg.engine), String(cfg.engine) === 'bing' ? 'google' : 'bing'] : [String(cfg.engine)];
    const num = ctx.profile === 'balanced' ? Number(cfg.num) : prof.num;
    const ttl = s.serpTtl;
    let calls = 0;
    let joined = 0;
    const all: SearchResult[] = [];
    await Promise.all(
      queries.map(async (q) => {
        const key = queryKey(q);
        const hit = ctx.stores.serp.get(key, ctx.clock.wall());
        if (hit) return void all.push(...hit);
        const existing = ctx.stores.inflight.get(key);
        if (existing) {
          joined++;
          all.push(...(await existing));
          return;
        }
        const p = (async () => {
          const per = await Promise.all(
            engines.map(async (e) => {
              calls++;
              const r = await ctx.providers.search(q, e, num);
              s.simulated ||= !!r.simulated;
              return r.results;
            }),
          );
          const merged = dedupeResults(per.flat());
          ctx.stores.serp.set(key, merged, ttl, ctx.clock.wall());
          return merged;
        })();
        ctx.stores.inflight.set(key, p);
        try {
          all.push(...(await p));
        } finally {
          ctx.stores.inflight.delete(key);
        }
      }),
    );
    s.results = dedupeResults(all);
    s.searchSent = calls;
    s.extraCost += calls * SERP_COST;
    return {
      outcome: 'called',
      detail: `${calls} call${calls === 1 ? '' : 's'} · ${engines.join('+')} · ${s.results.length} unique results${joined ? ` · joined ${joined} in-flight` : ''} · $${(calls * SERP_COST).toFixed(3)}`,
      meta: queries,
    };
  },

  async llm(s, cfg, ctx) {
    let routed = routeModel(s.req.model, ctx.profile);
    let tierNote = '';
    // Balanced: let the prompt-difficulty router (Python sidecar) send simple prompts to the small model.
    if (ctx.profile === 'balanced' && ctx.providers.classifyTier) {
      try {
        const tier = await ctx.providers.classifyTier(lastUser(s.messages));
        if (tier === 'fast') routed = routeModel(s.req.model, 'eco');
        tierNote = ` · router: ${tier}`;
      } catch {
        tierNote = ' · router unavailable';
      }
    }
    s.routedModel = routed;
    const msgs = [...s.messages];
    if (s.results.length) {
      const context = s.results
        .slice(0, 8)
        .map((r, i) => `[${i + 1}] ${r.title} — ${r.snippet} (${r.url})`)
        .join('\n');
      msgs.unshift({ role: 'system', content: `Live web results (cite as [n] when used):\n${context}` });
    }
    s.upstreamInput = lastUser(msgs);
    const maxTokens = Math.min(Number(cfg.maxTokens) || 4096, s.req.maxTokens ?? Infinity);
    let r: ChatResult;
    let note = '';
    try {
      r = await ctx.providers.chat(routed, msgs, { maxTokens });
    } catch (e) {
      const fb = String(cfg.fallback);
      note = ` · ${routed} failed (${errMsg(e)}), fell back to ${fb}`;
      try {
        r = await ctx.providers.chat(fb, msgs, { maxTokens });
        s.routedModel = fb;
      } catch (e2) {
        s.status = 'error';
        s.httpStatus = 502;
        s.errorBody = { error: { message: `Upstream model error: ${errMsg(e2)}`, type: 'upstream_error', code: 'upstream_error' } };
        return { outcome: 'blocked', detail: `upstream error: ${errMsg(e2)}`, branch: 'end' };
      }
    }
    s.simulated ||= !!r.simulated;
    s.answer = { text: r.text, outputTokens: r.outputTokens, inputTokens: r.inputTokens, model: s.routedModel, simulated: r.simulated };
    s.tokensSent = r.inputTokens;
    // Savings from routing to a cheaper model (negative in Performance mode: you're paying for quality).
    const routingSaved = tokenCost(s.req.model, r.inputTokens, r.outputTokens) - tokenCost(s.routedModel, r.inputTokens, r.outputTokens);
    const why = (routed !== s.req.model ? ` (${ctx.profile}: routed from ${s.req.model})` : '') + tierNote;
    return { outcome: 'called', detail: `${s.routedModel}${why} · ${r.inputTokens.toLocaleString()} in / ${r.outputTokens} out${r.simulated ? ' · simulated' : ''}${note}`, saved: routingSaved };
  },

  async response(s, _cfg, ctx) {
    if (!s.answer) {
      s.status = 'error';
      s.httpStatus = 500;
      s.errorBody = { error: { message: 'Pipeline produced no response: connect a path to the LLM node.', type: 'pipeline_error', code: 'no_response' } };
      return { outcome: 'blocked', detail: 'no answer reached the Response node', branch: 'end' };
    }
    const restored = s.piiMode === 'synthetic' && s.pii.length ? restorePii(s.answer.text, s.pii) : s.answer.text;
    const fresh = !s.cacheHit && s.status !== 'honeypot' && !s.pii.length && s.status !== 'flagged';
    if (fresh) {
      const value: CachedAnswer = { text: s.answer.text, outputTokens: s.answer.outputTokens, model: s.answer.model, prompt: lastUser(s.req.messages), costBaseline: 0 };
      const now = ctx.clock.wall();
      ctx.stores.exact.set(exactKey(s), value, Math.min(s.exactTtl, s.ttlCap ?? Infinity), now);
      if (s.embedding) ctx.stores.semantic.put({ vec: s.embedding.vector, text: lastUser(s.req.messages), entities: s.embedding.ents, partition: s.embedding.partition, value, expires: now + Math.min(s.semanticTtl, s.ttlCap ?? Infinity) });
    }
    s.answer.text = restored;
    const restoredN = s.piiMode === 'synthetic' ? s.pii.length : 0;
    return { outcome: 'pass', detail: `200${restoredN ? ` · restored ${restoredN} real value${restoredN > 1 ? 's' : ''}` : ''}${fresh ? ' · cached for reuse' : ''}`, branch: 'end' };
  },
};

function securityVerdict(s: State, cfg: NodeConfig, d: { score: number; signals: string[] }, type: string, name: string): Out {
  const th = Number(cfg.threshold);
  const sig = d.signals.length ? ` · ${d.signals.join(', ')}` : '';
  if (d.score < th) {
    if (d.score >= 0.5) s.leaked = true; // likely attack that the threshold let through
    return { outcome: 'pass', detail: `${fmtConfidence(d.score)} < ${fmtConfidence(th)}${sig}` };
  }
  s.threat = { type, confidence: d.score, signals: d.signals };
  if (cfg.action === 'block' || cfg.action === 'honeypot') return { outcome: 'blocked', detail: `${name} detected · ${fmtConfidence(d.score)} confidence${sig}`, branch: 'alt' };
  if (cfg.action === 'flag') s.status = 'flagged';
  return { outcome: 'flagged', detail: `${name} ${cfg.action}ged · ${fmtConfidence(d.score)}${sig}` };
}

// ---- Graph walk -------------------------------------------------------------------------------

export async function runPipeline(doc: PipelineDoc, req: GatewayRequest, ctx: EngineContext): Promise<EngineResult> {
  const t0 = ctx.clock.now();
  const ts = ctx.clock.wall();
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const outEdges = new Map<string, { out?: string; alt?: string }>();
  for (const e of doc.edges) {
    const o = outEdges.get(e.source) ?? {};
    if (!o[e.sourceHandle]) o[e.sourceHandle] = e.target;
    outEdges.set(e.source, o);
  }
  const tokensInNaive = req.messages.reduce((n, m) => n + estimateTokens(m.content), 0);
  const nq = naiveQueries(lastUser(req.messages));
  const naiveCalls = classifySearchIntent(lastUser(req.messages)).pSearch >= 0.5 ? nq.length : 1;
  const s: State = {
    req,
    messages: req.messages.map((m) => ({ ...m })),
    pii: [],
    piiMode: 'synthetic',
    status: 'ok',
    leaked: false,
    naiveQueries: nq,
    naiveCalls,
    queries: [],
    results: [],
    searchSent: 0,
    searchBypassed: false,
    routedModel: routeModel(req.model, ctx.profile),
    tokensSent: 0,
    extraCost: 0,
    httpStatus: 200,
    simulated: false,
    tokensInNaive,
    serpTtl: 600_000,
    exactTtl: 3_600_000,
    semanticTtl: 7_200_000,
  };

  const spans: Span[] = [];
  const path: string[] = [];
  let cur = doc.nodes.find((n) => n.kind === 'ingress');
  let guard = 0;
  while (cur && guard++ < 64) {
    const spec = NODE_SPECS[cur.kind];
    const cfg = { ...spec.defaults, ...cur.config };
    const start = ctx.clock.now() - t0;
    let r: Out;
    if (!cur.enabled && !spec.terminal) r = { outcome: 'bypassed', detail: 'node disabled — passed through' };
    else {
      try {
        r = await H[cur.kind](s, cfg, ctx, cur);
      } catch (e) {
        r = { outcome: 'blocked', detail: `node error: ${errMsg(e)}`, branch: 'end' };
        s.status = 'error';
        s.httpStatus = 500;
        s.errorBody = { error: { message: `Gateway node "${cur.label}" failed: ${errMsg(e)}`, type: 'gateway_error' } };
      }
    }
    path.push(cur.id);
    spans.push({ nodeId: cur.id, kind: cur.kind, name: cur.label, start, duration: ctx.clock.now() - t0 - start, outcome: r.outcome, detail: r.detail, saved: r.saved ?? 0, meta: r.meta, tokensSaved: r.tokensSaved });
    if (r.branch === 'end' || spec.terminal) break;
    const edges = outEdges.get(cur.id) ?? {};
    const branch = r.branch ?? 'out';
    // A blocked branch with nothing wired falls back to the main path, so a missing edge never silently drops traffic.
    const next = edges[branch] ?? edges.out;
    cur = next ? byId.get(next) : undefined;
  }

  // Path ended somewhere other than a terminal node: finish with the Response handler so callers always get an answer.
  const last = spans[spans.length - 1];
  if (last && !NODE_SPECS[last.kind].terminal && s.httpStatus === 200) {
    const r = await H.response(s, {}, ctx, { id: 'response', kind: 'response', label: 'Response', position: { x: 0, y: 0 }, enabled: true, config: {} });
    if (s.httpStatus !== 200) last.detail += ' · path did not reach Response';
    void r;
  }

  // ---- Costs: naive baseline vs actual -------------------------------------------------------
  const outTok = s.answer?.outputTokens ?? 0;
  const naiveSearch = naiveCalls;
  const req$ = modelInfo(req.model);
  const costBaseline = ((tokensInNaive + naiveSearch * SERP_CTX_TOKENS) * req$.in + outTok * req$.out) / 1e6 + naiveSearch * SERP_COST;
  const llmCalled = spans.some((x) => x.kind === 'llm' && x.outcome === 'called');
  const llmCost = llmCalled && s.answer ? tokenCost(s.routedModel, s.answer.inputTokens, s.answer.outputTokens) : 0;
  const costActual = s.status === 'error' ? 0 : llmCost + s.extraCost;
  const saved = s.status === 'error' ? 0 : costBaseline - costActual;
  // Terminal short-circuits (caches, block, honeypot) get the remainder attributed so pillar totals add up.
  const attributed = spans.reduce((a, x) => a + x.saved, 0);
  const shortCircuit = spans.find((x) => x.outcome === 'hit' && (x.kind === 'exactCache' || x.kind === 'semanticCache')) ?? spans.find((x) => x.kind === 'block' || x.kind === 'honeypot');
  if (shortCircuit) shortCircuit.saved += saved - attributed;

  const prompt = lastUser(req.messages);
  const logText = (t: string) => (ctx.redactPiiInLogs ? swapPii(t, 'mask', true).text : t);
  const trace: Trace = {
    id: ctx.newId(),
    ts,
    app: req.app,
    route: '/v1/chat/completions',
    model: s.status === 'honeypot' ? 'honeypot-decoy' : s.routedModel,
    requestedModel: req.model,
    profile: ctx.profile,
    prompt: ctx.logPayloads ? logText(prompt) : '[payload logging off]',
    status: s.status,
    spans,
    path,
    edges: path.slice(1).map((id, i) => {
      const from = path[i];
      const e = doc.edges.find((x) => x.source === from && x.target === id);
      return e?.id ?? `${from}->${id}`;
    }),
    latency: ctx.clock.now() - t0,
    tokensIn: tokensInNaive,
    tokensSent: llmCalled ? s.tokensSent : 0,
    tokensOut: outTok,
    searchRaw: naiveSearch,
    searchSent: s.searchSent,
    costBaseline,
    costActual,
    saved,
    threat: s.threat?.type,
    threatConfidence: s.threat?.confidence,
    leakedThreat: s.leaked && !s.threat,
    cache: s.cacheHit,
    searchBypassed: s.searchBypassed,
    simulated: s.simulated || undefined,
    error: s.errorBody ? String((s.errorBody.error as { message?: string })?.message ?? '') : undefined,
    io: ctx.logPayloads
      ? {
          input: logText(prompt),
          upstreamInput: s.upstreamInput,
          upstreamOutput: s.status === 'honeypot' ? undefined : s.cacheHit ? undefined : s.answer && s.pii.length ? applyUpstreamText(s) : undefined,
          output: s.answer ? logText(s.answer.text) : undefined,
          pii: s.pii.length ? s.pii.map((p) => ({ ...p, real: ctx.redactPiiInLogs ? swapPii(p.real, 'mask', true).text : p.real })) : undefined,
        }
      : undefined,
  };

  const text = s.answer?.text ?? '';
  const body =
    s.httpStatus === 200
      ? {
          id: `chatcmpl-${trace.id}`,
          object: 'chat.completion',
          created: Math.floor(ts / 1000),
          model: s.status === 'honeypot' ? req.model : s.routedModel,
          choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
          usage: { prompt_tokens: trace.tokensSent, completion_tokens: outTok, total_tokens: trace.tokensSent + outTok },
        }
      : (s.errorBody ?? { error: { message: 'Request failed', type: 'gateway_error' } });

  return { trace, httpStatus: s.httpStatus, body, text };
}

/** The model's raw reply (synthetic PII still in place) — what the upstream actually produced. */
function applyUpstreamText(s: State): string | undefined {
  if (!s.answer) return undefined;
  // s.answer.text has been restored by the Response handler; re-apply the swap to show the upstream view.
  let t = s.answer.text;
  for (const p of [...s.pii].sort((a, b) => b.real.length - a.real.length)) t = t.split(p.real).join(p.synthetic);
  return t;
}

// ---- helpers ----------------------------------------------------------------------------------

function exactKey(s: State): string {
  const msgs = s.req.messages;
  const fam = modelInfo(s.req.model).provider;
  return hashKey(fam + '|' + msgs.map((m) => `${m.role}:${m.content.replace(/\s+/g, ' ').trim().toLowerCase()}`).join('\n'));
}

function partitionKey(s: State): string {
  const sys = s.req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  // Multi-turn conversations only reuse answers within the same context (system prompt + prior turns).
  const history = s.req.messages.slice(0, -1).filter((m) => m.role !== 'system').map((m) => m.content).join('\n');
  return hashKey(modelInfo(s.req.model).provider + '|' + sys + '|' + history);
}

function dedupeResults(rs: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  return rs.filter((r) => {
    const k = r.url.replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const label = (t: string) => (t === 'prompt_injection' ? 'Prompt injection' : t === 'jailbreak' ? 'Jailbreak attempt' : t);
const trim = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
