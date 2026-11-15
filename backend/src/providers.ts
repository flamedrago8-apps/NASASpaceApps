/**
 * Real upstream providers. Each one falls back to the simulated provider when its key
 * isn't configured, and says so on the trace (`simulated: true`), so the gateway always
 * works end-to-end and never pretends a fake answer came from a real model.
 */
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { createSimulatedProviders, estimateTokens, localEmbed, modelInfo, type ChatMessage, type ChatResult, type Clock, type Providers, type SearchResult } from '@tokenomics/core';
import { env } from './env';
import type { Store } from './store';

// Models that support server-side refusal fallbacks.
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-2', 'claude-fable-5-1', 'claude-opus-5']);

function anthropicMessages(messages: ChatMessage[]) {
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');
  const turns: Anthropic.MessageParam[] = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    const prev = turns[turns.length - 1];
    if (prev && prev.role === role) prev.content = `${prev.content as string}\n\n${m.content}`;
    else turns.push({ role, content: m.content });
  }
  if (turns[0]?.role === 'assistant') turns.unshift({ role: 'user', content: '(conversation continues)' });
  return { system: system || undefined, turns };
}

const cache = new Map<string, unknown>();
function memo<T>(key: string, make: () => T): T {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key) as T;
}

export function createProviders(store: Store, clock: Clock): Providers {
  const sim = createSimulatedProviders(clock);
  const anthropic = () => {
    const { key } = store.providerKey('anthropic');
    return key ? memo(`a:${key}`, () => new Anthropic({ apiKey: key, maxRetries: 2 })) : null;
  };
  const openai = () => {
    const { key } = store.providerKey('openai');
    return key ? memo(`o:${key}`, () => new OpenAI({ apiKey: key, maxRetries: 2 })) : null;
  };
  const llama = () => {
    const { key } = store.providerKey('meta');
    return key ? memo(`l:${key}`, () => new OpenAI({ apiKey: key, baseURL: env.llama.baseUrl, maxRetries: 2 })) : null;
  };
  const honeypotClient = env.honeypot.baseUrl && env.honeypot.apiKey ? new OpenAI({ apiKey: env.honeypot.apiKey, baseURL: env.honeypot.baseUrl, maxRetries: 1 }) : null;

  async function openaiChat(client: OpenAI, model: string, messages: ChatMessage[], maxTokens: number): Promise<ChatResult> {
    const r = await client.chat.completions.create({
      model,
      max_completion_tokens: maxTokens,
      messages: messages.map((m) => ({ role: m.role === 'tool' ? 'user' : m.role, content: m.content })) as OpenAI.Chat.ChatCompletionMessageParam[],
    });
    const text = r.choices[0]?.message?.content ?? '';
    return { text, inputTokens: r.usage?.prompt_tokens ?? estimateTokens(messages.map((m) => m.content).join('\n')), outputTokens: r.usage?.completion_tokens ?? estimateTokens(text), model: r.model ?? model };
  }

  // ---- Python helpers sidecar ----
  const helper = async <T,>(path: string, body: unknown, timeoutMs: number): Promise<T> => {
    const res = await fetch(`${env.helpersUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`helper ${path} ${res.status}`);
    return (await res.json()) as T;
  };
  const helpers: Pick<Providers, 'classifyTier' | 'compress' | 'planQueries'> = env.helpersUrl
    ? {
        classifyTier: async (prompt) => (await helper<{ tier: 'fast' | 'advanced' }>('/route', { prompt }, 8000)).tier,
        compress: async (text) => (await helper<{ compressed: string }>('/compress', { prompt: text }, 15000)).compressed,
        planQueries: async (prompt) => (await helper<{ queries: { query: string }[] }>('/plan', { prompt }, 15000)).queries.map((q) => q.query),
      }
    : {};

  return {
    ...helpers,
    async chat(model, messages, { maxTokens }) {
      const provider = modelInfo(model).provider;
      if (provider === 'anthropic') {
        const client = anthropic();
        if (!client) return sim.chat(model, messages, { maxTokens });
        const { system, turns } = anthropicMessages(messages);
        const params = { model, max_tokens: maxTokens, system, messages: turns };
        const res = FALLBACK_MODELS.has(model)
          ? await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
          : await client.messages.create(params);
        let text = '';
        for (const block of res.content) if (block.type === 'text') text += block.text;
        if (res.stop_reason === 'refusal' && !text) text = 'I can’t help with that request.';
        return { text, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens, model: res.model };
      }
      if (provider === 'meta') {
        const client = llama();
        if (!client) return sim.chat(model, messages, { maxTokens });
        return { ...(await openaiChat(client, env.llama.model, messages, maxTokens)), model };
      }
      const client = openai();
      if (!client) return sim.chat(model, messages, { maxTokens });
      return openaiChat(client, model, messages, maxTokens);
    },

    async embed(text) {
      const client = env.embeddings === 'openai' ? openai() : null;
      if (!client) return { vector: localEmbed(text), remote: false };
      const r = await client.embeddings.create({ model: 'text-embedding-3-small', input: text.slice(0, 8000) });
      return { vector: r.data[0].embedding, remote: true };
    },

    async search(query, engine, num) {
      const { key } = store.providerKey('serpapi');
      if (!key) return sim.search(query, engine, num);
      const url = new URL('https://serpapi.com/search.json');
      url.searchParams.set('engine', engine);
      url.searchParams.set(engine === 'bing' ? 'count' : 'num', String(num));
      url.searchParams.set('q', query);
      url.searchParams.set('api_key', key);
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`SerpAPI ${res.status}: ${(await res.text()).slice(0, 160)}`);
      const j = (await res.json()) as {
        answer_box?: { title?: string; answer?: string; snippet?: string; link?: string };
        organic_results?: { title: string; link: string; snippet?: string }[];
      };
      const out: SearchResult[] = [];
      if (j.answer_box && (j.answer_box.answer || j.answer_box.snippet)) out.push({ title: j.answer_box.title ?? 'Answer', url: j.answer_box.link ?? `serpapi:answer:${query}`, snippet: j.answer_box.answer ?? j.answer_box.snippet ?? '', source: engine });
      for (const r of j.organic_results ?? []) out.push({ title: r.title, url: r.link, snippet: r.snippet ?? '', source: engine });
      return { results: out.slice(0, num) };
    },

    async honeypot(messages, persona) {
      if (!honeypotClient || !env.honeypot.model) return sim.honeypot(messages, persona);
      return openaiChat(honeypotClient, env.honeypot.model, messages, 400);
    },
  };
}
