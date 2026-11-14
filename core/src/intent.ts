/**
 * Search-intent classifier and query planner.
 *
 * `classifySearchIntent` returns how likely a prompt is to need live web data.
 * `naiveQueries` is the fan-out a naive search agent would send (the baseline).
 * `optimizeQueries` merges and caps that fan-out into the minimum set.
 */
import { jaccard, keywords, normalizeWs } from './text';

export type Intent = { pSearch: number; reason: string };

const LIVE = [
  [/\b(today|tonight|tomorrow|yesterday|right now|currently|this (week|month|year|morning|evening|weekend))\b/i, 1.6, 'time-sensitive'],
  [/\b(latest|newest|recent|breaking|live|up[- ]to[- ]date|current|as of)\b/i, 1.4, 'recency'],
  [/\b(weather|forecast|rain(ing)?|snow(ing)?|temperature|humidity|storm)\b/i, 1.8, 'weather'],
  [/\b(news|headlines?|announce(d|ment)?|election|poll|results?)\b/i, 1.2, 'news/events'],
  [/\b(stock|share price|price of|prices?|exchange rate|crypto|bitcoin|mortgage rates?|interest rates?|inflation)\b/i, 1.3, 'market data'],
  [/\b(score|game|match|standings|playoffs?)\b/i, 1.0, 'sports'],
  [/\b(flight|delays?|traffic|open now|hours|near me|nearby|tickets?|showtimes?)\b/i, 1.2, 'local/real-time'],
  [/\b(20(2[4-9]|3\d))\b/, 0.9, 'recent year'],
  [/\b(release date|launched|launch|benchmarks?|leaderboard|version \d)/i, 0.8, 'fast-moving facts'],
  [/\b(search|look up|google|find (online|on the web)|browse)\b/i, 1.5, 'explicit search'],
] as const;

const STATIC = [
  [/^[\s\d+\-*/().,=?x×÷^%]+$/, 3, 'arithmetic'],
  [/\b(what is|what's|calculate|compute)\s+[\d\s+\-*/().x×÷^%]+\??$/i, 3, 'arithmetic'],
  [/\b(who (wrote|painted|composed|invented|discovered)|capital of|define|definition of|meaning of|synonym|translate)\b/i, 2, 'encyclopedic knowledge'],
  [/\b(explain|how does|how do i|why does|what does|difference between|example of|tutorial)\b/i, 1.2, 'explanation'],
  [/\b(code|function|refactor|regex|typescript|javascript|python|sql|bug|error|stack trace|compile|schema|api|class|hook)\b/i, 1.4, 'coding task'],
  [/\b(write|draft|rewrite|summari[sz]e (this|the following)|poem|story|essay|email|tweet|slogan|joke)\b/i, 1.3, 'generation task'],
  [/\b(reset|password|account|billing|order|refund|2fa|login)\b/i, 0.8, 'support workflow'],
] as const;

export function classifySearchIntent(prompt: string): Intent {
  const text = prompt.slice(-2000);
  let live = 0;
  let stat = 0;
  const reasons: string[] = [];
  for (const [re, w, why] of LIVE) if (re.test(text)) (live += w), reasons.push(why);
  for (const [re, w, why] of STATIC) if (re.test(text)) (stat += w), reasons.push(why);
  const z = -0.6 + live * 1.1 - stat * 1.0;
  const pSearch = 1 / (1 + Math.exp(-z));
  const top = live >= stat ? reasons.find((r) => LIVE.some((x) => x[2] === r)) : reasons.find((r) => STATIC.some((x) => x[2] === r));
  return { pSearch, reason: top ?? (pSearch > 0.5 ? 'needs fresh data' : 'internal knowledge sufficient') };
}

const FILLER = /^(hey|hi|hello|please|can you|could you|would you|tell me|i want to know|i'd like to know|do you know|search for|look up|find)\b[\s,]*/i;

function clean(q: string): string {
  let s = normalizeWs(q.replace(/[?!.]+$/g, ''));
  for (let i = 0; i < 4; i++) s = s.replace(FILLER, '');
  return s.slice(0, 120);
}

/** Split "X in Austin vs Denver" into one query per side, carrying the shared subject over. */
function comparisonSides(q: string): string[] | null {
  const m = q.match(/(.+?)\s+(?:vs\.?|versus|compared (?:to|with))\s+(.+)/i);
  if (!m) return null;
  const [left, right] = [m[1], m[2].replace(/[?.!]+$/, '')];
  if (right.trim().split(/\s+/).length > 3) return [left, right];
  const caps = [...left.matchAll(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g)].filter((x) => x.index! > 0);
  const last = caps[caps.length - 1];
  return [left, last ? left.slice(0, last.index) + right + left.slice(last.index! + last[0].length) : `${left} ${right}`];
}

const kwQuery = (q: string) => keywords(q).filter((k) => k !== 'latest').slice(0, 8).join(' ');

/** The fan-out a naive "always search" agent sends: the question, a keyword query, a freshness variant, and each side of a comparison. */
export function naiveQueries(prompt: string): string[] {
  const last = prompt.split(/\n/).filter(Boolean).pop() ?? prompt;
  const base = clean(last);
  const kw = kwQuery(last);
  const out = [base, kw, `${kw} latest`, ...(comparisonSides(last)?.map(clean) ?? [])];
  return [...new Set(out.filter((q) => q.length > 1))].slice(0, 5);
}

/** The minimum set: one compact keyword query, or one per side of a comparison. */
export function plannedQueries(prompt: string, max: number): string[] {
  const last = prompt.split(/\n/).filter(Boolean).pop() ?? prompt;
  const sides = comparisonSides(last);
  const qs = sides ? sides.map(kwQuery) : [kwQuery(last)];
  return [...new Set(qs.filter(Boolean))].slice(0, Math.max(1, max));
}

/** Merge near-duplicates (Jaccard ≥ 0.6 on keywords) and cap at `max`. Used when the client supplies its own queries. */
export function optimizeQueries(queries: string[], max: number): string[] {
  const groups: { q: string; kw: Set<string> }[] = [];
  for (const q of queries) {
    const kw = new Set(keywords(q).filter((k) => k !== 'latest'));
    const g = groups.find((x) => jaccard(x.kw, kw) >= 0.6);
    if (g) {
      if (kw.size < g.kw.size) Object.assign(g, { q, kw });
    } else groups.push({ q, kw });
  }
  return groups.map((g) => kwQuery(g.q) || clean(g.q)).slice(0, Math.max(1, max));
}

/** Canonical cache key for a query: sorted, stemmed keywords. */
export const queryKey = (q: string) => [...new Set(keywords(q).filter((k) => k !== 'latest'))].sort().join(' ');
