/**
 * Semantic cache: vector embeddings + cosine similarity, with an entity guard.
 *
 * `localEmbed` is a fast, dependency-free embedding (feature-hashed keywords with
 * synonym canonicalization + character trigrams). The backend can swap in a neural
 * embedding model (OpenAI text-embedding-3-small) via the Providers interface.
 */
import { fnv1a, keywords, words } from './text';

const DIM = 512;

/** Canonical concepts: paraphrases map to the same token. */
const SYNONYMS: Record<string, string> = {
  rain: 'weather', raining: 'weather', rainy: 'weather', forecast: 'weather', temperature: 'weather', sunny: 'weather', snow: 'weather', umbrella: 'weather', hot: 'weather', cold: 'weather', degree: 'weather', climate: 'weather',
  price: 'cost', cost: 'cost', pricing: 'cost', expensive: 'cost', cheap: 'cost',
  buy: 'purchase', purchase: 'purchase',
  reset: 'reset', recover: 'reset', forgot: 'reset', forgotten: 'reset', change: 'reset',
  pwd: 'password', passcode: 'password', password: 'password',
  movie: 'film', film: 'film', flick: 'film',
  car: 'vehicle', auto: 'vehicle', automobile: 'vehicle',
  big: 'large', large: 'large', huge: 'large',
  begin: 'start', start: 'start', commence: 'start',
  fix: 'repair', repair: 'repair', debug: 'repair',
  quick: 'fast', fast: 'fast', speedy: 'fast',
  rate: 'rate', rates: 'rate',
  los: 'lose', lost: 'lose', lose: 'lose', misplac: 'lose',
  mobile: 'phone', cell: 'phone', cellphone: 'phone', smartphone: 'phone',
  can: 'can', able: 'can',
};

/** Place qualifiers carry little meaning once the city is known ("Austin, TX" ≈ "Austin"). */
const STATES = 'al:alabama ak:alaska az:arizona ar:arkansas ca:california co:colorado ct:connecticut de:delaware fl:florida ga:georgia hi:hawaii id:idaho il:illinois in:indiana ia:iowa ks:kansas ky:kentucky la:louisiana me:maine md:maryland ma:massachusetts mi:michigan mn:minnesota ms:mississippi mo:missouri mt:montana ne:nebraska nv:nevada nh:new-hampshire nj:new-jersey nm:new-mexico ny:new-york nc:north-carolina nd:north-dakota oh:ohio ok:oklahoma or:oregon pa:pennsylvania ri:rhode-island sc:south-carolina sd:south-dakota tn:tennessee tx:texas ut:utah vt:vermont va:virginia wa:washington wv:west-virginia wi:wisconsin wy:wyoming dc:district-of-columbia';
const STATE_ABBR: Record<string, string> = Object.fromEntries(STATES.split(' ').map((p) => p.split(':')).map(([a, n]) => [a, n.replace(/-/g, ' ')]));
/** Ambiguous two-letter codes that are also common words are only treated as states after a comma ("Austin, TX"). */
const AMBIGUOUS = new Set(['in', 'me', 'or', 'oh', 'ok', 'hi', 'id', 'la', 'ma', 'de', 'pa', 'co', 'al', 'ar', 'ga', 'mo', 'ms', 'ne', 'va']);

const LOW_WEIGHT = new Set(['usa', 'us', 'uk', 'today', 'now', 'currently', 'right', 'question', 'quick', ...Object.keys(STATE_ABBR).filter((a) => !AMBIGUOUS.has(a)), ...Object.values(STATE_ABBR).flatMap((n) => n.split(' '))]);

export function canonicalTokens(text: string): { tok: string; w: number }[] {
  // "Seattle, WA" → treat the state code as a qualifier even when it is also an English word.
  const qualifiers = new Set([...text.matchAll(/,\s*([A-Z]{2})\b/g)].map((m) => m[1].toLowerCase()));
  return keywords(text).map((k) => {
    if (qualifiers.has(k)) return { tok: STATE_ABBR[k] ?? k, w: 0.15 };
    const c = SYNONYMS[k] ?? k;
    return { tok: c, w: LOW_WEIGHT.has(k) ? 0.15 : 1 };
  });
}

export function localEmbed(text: string): number[] {
  const v = new Float64Array(DIM);
  const toks = canonicalTokens(text);
  for (const { tok, w } of toks) {
    const h = fnv1a(tok);
    v[h % DIM] += (h & 0x100 ? 1 : -1) * w;
  }
  // Character trigrams add a little robustness to typos, at low weight.
  const flat = toks.map((t) => t.tok).join(' ');
  for (let i = 0; i + 3 <= flat.length; i++) {
    const h = fnv1a('#' + flat.slice(i, i + 3));
    v[h % DIM] += (h & 0x100 ? 1 : -1) * 0.08;
  }
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return Array.from(v, (x) => x / n);
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na * nb) || 1);
}

/** Proper nouns + numbers. Two prompts about different places/products/amounts must not share a cached answer. */
export function entities(text: string): Set<string> {
  const out = new Set<string>();
  const sentences = text.split(/(?<=[.!?])\s+/);
  for (const s of sentences) {
    const ws = s.match(/[A-Za-z][A-Za-z'-]*|\d[\d.,]*/g) ?? [];
    ws.forEach((w, i) => {
      if (/^\d/.test(w)) out.add(w.replace(/[.,]$/, ''));
      else if (i > 0 && /^[A-Z][a-z]/.test(w) && !/^(I|I'm|What|Tell|Is|Are|The|How|Who|Can|Please)$/.test(w)) out.add(w.toLowerCase());
    });
  }
  // Normalize state abbreviations so "Austin, TX" and "Austin, Texas" agree, then drop them (qualifiers, not subjects).
  for (const w of words(text)) if (STATE_ABBR[w]) out.delete(w);
  for (const full of Object.values(STATE_ABBR)) out.delete(full);
  return out;
}

export type SemanticEntry<T> = { vec: number[]; text: string; entities: string[]; partition: string; value: T; expires: number };

export class SemanticCache<T> {
  private entries: SemanticEntry<T>[] = [];
  constructor(private max = 5000) {}

  nearest(vec: number[], partition: string, now: number): { entry: SemanticEntry<T>; sim: number } | null {
    let best: { entry: SemanticEntry<T>; sim: number } | null = null;
    for (const e of this.entries) {
      if (e.partition !== partition || e.expires < now) continue;
      const sim = cosine(vec, e.vec);
      if (!best || sim > best.sim) best = { entry: e, sim };
    }
    return best;
  }

  put(entry: SemanticEntry<T>) {
    this.entries.push(entry);
    if (this.entries.length > this.max) this.entries.splice(0, this.entries.length - this.max);
  }

  size() {
    return this.entries.length;
  }
}

/** Entities in the new prompt must all appear in the cached one (and vice versa) to reuse its answer. */
export function entitiesMatch(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}
