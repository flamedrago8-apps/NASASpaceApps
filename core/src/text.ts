/** Small, dependency-free text helpers shared by the detectors, caches and router. */

/** ~4 characters per token is the standard rough estimate for English text. */
export const estimateTokens = (s: string) => Math.max(1, Math.ceil(s.length / 4));

export const STOPWORDS = new Set(
  'a an the is are was were be been being am do does did of in on at to for from by with about as into over under and or but if then than so that this these those it its it’s it\'s i me my we our you your he she they them their what whats what\'s which who whom whose when where why how can could would should will shall may might must please tell show give let know find me us any some there here just also very really get got need want like vs versus compare'.split(
    ' ',
  ),
);

/** Very light stemmer — enough to make "raining/rains/rained" and "rates/rate" collide. */
export function stem(w: string): string {
  if (w.length <= 3) return w;
  for (const suf of ['ingly', 'ing', 'edly', 'ed', 'ies', 'es', 's', 'ly']) {
    if (suf === 'es' && !/(s|x|z|ch|sh)es$/.test(w)) continue;
    if (w.endsWith(suf) && w.length - suf.length >= 3) {
      let base = w.slice(0, -suf.length);
      if (suf === 'ies') base += 'y';
      if (/(.)\1$/.test(base) && !/(ll|ss)$/.test(base)) base = base.slice(0, -1);
      return base;
    }
  }
  return w;
}

export function words(s: string): string[] {
  return s.toLowerCase().replace(/[’']/g, "'").replace(/(\w)-(\w)/g, '$1 $2').match(/[a-z0-9][a-z0-9'.-]*[a-z0-9]|[a-z0-9]/g) ?? [];
}

export function keywords(s: string): string[] {
  return words(s)
    .map((w) => w.replace(/'s$/, ''))
    .filter((w) => !STOPWORDS.has(w))
    .map(stem);
}

/** FNV-1a 32-bit — fast, deterministic, good enough for cache keys and feature hashing. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const hashKey = (s: string) => fnv1a(s).toString(16).padStart(8, '0') + fnv1a(s + '#').toString(16).padStart(8, '0');

export const normalizeWs = (s: string) => s.replace(/\s+/g, ' ').trim();

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
