/**
 * Simulated upstream providers. Used for the browser demo, and by the backend for any
 * provider that has no API key configured. Replies are templated but realistic enough
 * to exercise every pipeline feature (names and emails are echoed back so the PII swap
 * round-trip is visible, latency scales with model size and output length).
 */
import type { ChatMessage, ChatResult, Clock, Providers, SearchResult } from './engine';
import { localHoneypotReply } from './misc';
import { modelInfo } from './pricing';
import { localEmbed } from './semantic';
import { estimateTokens, fnv1a, keywords } from './text';

const CITY_WEATHER: Record<string, string> = { austin: '91°F and mostly sunny, 10% chance of rain', denver: '64°F with afternoon thunderstorms likely', seattle: '57°F and drizzling', 'new york': '72°F, partly cloudy', london: '61°F with light rain', dallas: '94°F and clear' };

function arithmetic(q: string): number | null {
  const expr = q.replace(/what('s| is)|calculate|compute|=|\?/gi, '').replace(/x|×/g, '*').replace(/÷/g, '/').trim();
  if (!/^[\d\s+\-*/().]+$/.test(expr) || !/\d/.test(expr)) return null;
  // Tiny recursive-descent parser: no eval.
  let i = 0;
  const s = expr.replace(/\s+/g, '');
  const num = (): number => {
    if (s[i] === '(') {
      i++;
      const v = add();
      i++;
      return v;
    }
    if (s[i] === '-') {
      i++;
      return -num();
    }
    const m = s.slice(i).match(/^\d+(\.\d+)?/);
    if (!m) throw new Error('bad');
    i += m[0].length;
    return Number(m[0]);
  };
  const mul = (): number => {
    let v = num();
    while (s[i] === '*' || s[i] === '/') v = s[i++] === '*' ? v * num() : v / num();
    return v;
  };
  const add = (): number => {
    let v = mul();
    while (s[i] === '+' || s[i] === '-') v = s[i++] === '+' ? v + mul() : v - mul();
    return v;
  };
  try {
    const v = add();
    return i === s.length && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

export function simulatedAnswer(messages: ChatMessage[]): string {
  const user = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const ctx = messages.find((m) => m.role === 'system' && m.content.startsWith('Live web results'))?.content;
  const lower = user.toLowerCase();
  const name = user.match(/\b(?:my name is|i am|i'm|this is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/)?.[1] ?? user.match(/^(?:hi|hello|hey),?\s+(?:i'm\s+)?([A-Z][a-z]+)/i)?.[1];
  const email = user.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0];
  const greet = name ? `Hi ${name}, ` : '';

  const math = arithmetic(user);
  if (math !== null) return `${user.replace(/[?]/g, '').replace(/what('s| is)\s*/i, '').trim()} = ${Number.isInteger(math) ? math : math.toFixed(4)}.`;
  if (/romeo and juliet/i.test(user)) return 'Romeo and Juliet was written by William Shakespeare, first published in 1597.';
  if (/capital of france/i.test(user)) return 'The capital of France is Paris.';
  if (/weather|rain|forecast|temperature/i.test(lower)) {
    const city = Object.keys(CITY_WEATHER).find((c) => lower.includes(c)) ?? 'your area';
    const w = CITY_WEATHER[city] ?? '70°F and clear';
    return `${greet}Right now in ${city.replace(/\b\w/g, (c) => c.toUpperCase())} it's ${w}${ctx ? ' [1]' : ''}. ${/rain/i.test(lower) ? (w.includes('rain') || w.includes('drizzl') || w.includes('thunder') ? "So yes — bring an umbrella." : "So no, it isn't raining.") : ''}`.trim();
  }
  if (/ssn|social security|card|account|billing|order|refund/i.test(lower))
    return `${greet}thanks for the details. I've verified the account${email ? ` and sent a confirmation to ${email}` : ''}. Your request is now being processed and you should see an update within 24 hours.`;
  if (/(code|function|refactor|regex|typescript|python|sql|bug|error)/i.test(lower))
    return `${greet}here's the approach: isolate the failing piece, then fix it at the source.\n\n1. Reproduce with a minimal input.\n2. Move the stateful logic into a ref or pure function so it can't capture stale values.\n3. Add a test that pins the behavior.\n\nIf you share the snippet I can point to the exact line.`;
  if (ctx) {
    const first = ctx.split('\n')[1]?.replace(/^\[1\]\s*/, '') ?? '';
    return `${greet}According to the latest sources, ${first.split(' — ')[1]?.replace(/\s*\(http.*$/, '') ?? 'the situation is still developing'} [1]. Other sources broadly agree [2].`;
  }
  const topic = keywords(user).slice(0, 4).join(' ') || 'that';
  return `${greet}here's a concise answer on ${topic}: the short version is that it depends on your constraints, but the standard approach works well for most cases. Want me to go deeper on any part?`;
}

function fakeResults(q: string, engine: string, num: number): SearchResult[] {
  const kw = keywords(q);
  const topic = kw.join(' ') || q;
  const sites = ['reuters.com', 'apnews.com', 'wikipedia.org', 'theverge.com', 'weather.com', 'bloomberg.com', 'nytimes.com', 'arstechnica.com', 'bbc.co.uk', 'techcrunch.com'];
  return Array.from({ length: num }, (_, i) => {
    const site = sites[(fnv1a(topic) + i * (engine === 'bing' ? 3 : 1)) % sites.length];
    return { title: `${topic.replace(/\b\w/g, (c) => c.toUpperCase())} — ${['latest update', 'what we know', 'explained', 'live coverage', 'analysis'][i % 5]}`, url: `https://${site}/${kw.join('-')}${i > 2 ? `-${i}` : ''}`, snippet: `${topic} — key facts reported ${['this morning', 'today', 'within the last hour', 'this week'][i % 4]}.`, source: engine };
  });
}

export function createSimulatedProviders(clock: Clock, rand: () => number = Math.random): Providers {
  return {
    async chat(model, messages) {
      const text = simulatedAnswer(messages);
      const inputTokens = messages.reduce((s, m) => s + estimateTokens(m.content), 0);
      const outputTokens = estimateTokens(text);
      const tier = modelInfo(model).tier;
      const ttft = { small: 180, mid: 320, frontier: 520 }[tier] + rand() * 250 + inputTokens * 0.02;
      const perTok = { small: 4, mid: 9, frontier: 14 }[tier];
      await clock.sleep(ttft + outputTokens * perTok * (0.8 + rand() * 0.4));
      return { text, inputTokens, outputTokens, model, simulated: true };
    },
    async embed(text) {
      return { vector: localEmbed(text), remote: false };
    },
    async search(query, engine, num) {
      await clock.sleep(380 + rand() * 600);
      return { results: fakeResults(query, engine, num), simulated: true };
    },
    async honeypot(messages, persona): Promise<ChatResult> {
      const user = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
      const text = localHoneypotReply(user, persona, fnv1a(user + Math.floor(rand() * 1e6)));
      await clock.sleep(300 + rand() * 300);
      return { text, inputTokens: estimateTokens(user), outputTokens: estimateTokens(text), model: 'decoy-local', simulated: true };
    },
  };
}

/** Virtual clock for instant back-filling: sleep() advances time without waiting. */
export function virtualClock(startWall: number): Clock & { advance(ms: number): void } {
  let t = 0;
  return { now: () => t, wall: () => startWall + t, sleep: async (ms) => void (t += ms), advance: (ms) => void (t += ms) };
}
