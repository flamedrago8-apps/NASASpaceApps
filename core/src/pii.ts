/**
 * Two-way synthetic PII swapper.
 *
 * Real values are replaced with realistic synthetic ones before the model sees the
 * prompt, and the mapping is reversed on the model's reply, so the model only ever
 * sees a fake profile while the app gets a response addressed to the real user.
 */
import type { PiiSwap } from './types';

type Kind = 'EMAIL' | 'SSN' | 'CARD' | 'PHONE' | 'NAME';

const FIRST = ['James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda', 'William', 'Elizabeth', 'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Charles', 'Karen', 'Daniel', 'Nancy', 'Matthew', 'Lisa', 'Anthony', 'Betty', 'Mark', 'Sandra', 'Steven', 'Ashley', 'Paul', 'Emily', 'Andrew', 'Michelle', 'Joshua', 'Amanda', 'Kevin', 'Melissa', 'Brian', 'Stephanie', 'Priya', 'Wei', 'Carlos', 'Maria', 'Ahmed', 'Fatima', 'Raj', 'Aisha', 'Diego', 'Sofia', 'Venkat', 'Arjun', 'Ana', 'Luis', 'Chen', 'Yuki', 'Omar', 'Elena', 'Noah', 'Emma', 'Liam', 'Olivia', 'Ethan', 'Ava', 'Lucas', 'Mia', 'Jordan', 'Taylor', 'Alex', 'Sam'];
const FAKE_FIRST = ['Avery', 'Morgan', 'Riley', 'Quinn', 'Parker', 'Rowan', 'Skyler', 'Emerson', 'Finley', 'Hayden'];
const FAKE_LAST = ['Calloway', 'Whitfield', 'Ashby', 'Pennington', 'Hollister', 'Langford', 'Merriweather', 'Thornbury', 'Kingsley', 'Rowe'];

const PATTERNS: { kind: Kind; re: RegExp; valid?: (s: string) => boolean }[] = [
  { kind: 'EMAIL', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { kind: 'SSN', re: /\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g },
  { kind: 'CARD', re: /\b(?:\d[ -]?){12,18}\d\b/g, valid: luhn },
  { kind: 'PHONE', re: /(?:\+?1[ .-]?)?\(?\b\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\b/g },
];

function luhn(s: string): boolean {
  const d = s.replace(/\D/g, '');
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

function synthetic(kind: Kind, i: number, real: string): string {
  switch (kind) {
    case 'EMAIL':
      return `${FAKE_FIRST[i % 10].toLowerCase()}.${FAKE_LAST[(i * 3) % 10].toLowerCase()}@example.net`;
    case 'SSN':
      return `000-00-${String(1000 + i).slice(-4)}`; // the 000 area number is never issued
    case 'CARD':
      return ['4111 1111 1111 1111', '5555 5555 5555 4444', '3782 822463 10005', '6011 1111 1111 1117'][i % 4]; // public test cards
    case 'PHONE':
      return `(555) 01${String(i).padStart(2, '0')}-${String(2000 + i * 37).slice(-4)}`; // 555-01xx is reserved for fiction
    case 'NAME': {
      const parts = real.split(/\s+/);
      const first = FAKE_FIRST[(i + 3) % 10];
      return parts.length > 1 ? `${first} ${FAKE_LAST[(i + 5) % 10]}` : first;
    }
  }
}

const NAME_CONTEXT = /\b(?:my name is|i am|i'm|this is|name:|dear|hi|hello|hey|signed|regards,|thanks,|cc|from)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g;
const KNOWN_NAME = new RegExp(`\\b(${FIRST.join('|')})(\\s+[A-Z][a-z]{2,})?\\b`, 'g');

export type PiiResult = { text: string; swaps: PiiSwap[] };

/** Swap PII in `text`, reusing `existing` mappings so a value maps to the same fake across messages. */
export function swapPii(text: string, mode: 'synthetic' | 'redact' | 'mask', names: boolean, existing: PiiSwap[] = []): PiiResult {
  const swaps = existing;
  const found: { kind: Kind; value: string }[] = [];
  for (const p of PATTERNS) {
    for (const m of text.matchAll(p.re)) if (!p.valid || p.valid(m[0])) found.push({ kind: p.kind, value: m[0] });
  }
  if (names) {
    for (const m of text.matchAll(NAME_CONTEXT)) found.push({ kind: 'NAME', value: m[1] });
    for (const m of text.matchAll(KNOWN_NAME)) found.push({ kind: 'NAME', value: m[0].trim() });
  }
  // Longest first so "Jane Doe" wins over "Jane", and card digits over phone fragments.
  found.sort((a, b) => b.value.length - a.value.length);

  let out = text;
  for (const f of found) {
    if (!out.includes(f.value)) continue;
    if (f.kind === 'PHONE' && swaps.some((s) => s.type === 'CARD' && s.real.includes(f.value))) continue;
    let s = swaps.find((x) => x.real === f.value);
    if (!s) {
      const idx = swaps.filter((x) => x.type === f.kind).length;
      const replacement = mode === 'redact' ? `[${f.kind}]` : mode === 'mask' ? mask(f.kind, f.value) : synthetic(f.kind, idx, f.value);
      s = { type: f.kind, real: f.value, synthetic: replacement };
      swaps.push(s);
    }
    out = out.split(f.value).join(s.synthetic);
  }
  return { text: out, swaps };
}

/** Put the real values back. Also handles first-name-only mentions of a swapped full name. */
export function restorePii(text: string, swaps: PiiSwap[]): string {
  let out = text;
  const ordered = [...swaps].sort((a, b) => b.synthetic.length - a.synthetic.length);
  for (const s of ordered) {
    if (s.synthetic.startsWith('[')) continue; // redacted values can't be restored
    out = out.split(s.synthetic).join(s.real);
    if (s.type === 'NAME' && s.synthetic.includes(' ')) {
      out = out.replace(new RegExp(`\\b${s.synthetic.split(' ')[0]}\\b`, 'g'), s.real.split(' ')[0]);
    }
  }
  return out;
}

export function mask(kind: string, v: string): string {
  if (kind === 'EMAIL') {
    const [u, d] = v.split('@');
    return `${u[0]}${'•'.repeat(Math.max(1, u.length - 1))}@${d}`;
  }
  if (kind === 'NAME') return v.split(/\s+/).map((p) => p[0] + '•'.repeat(p.length - 1)).join(' ');
  const digits = v.replace(/\D/g, '');
  return `•••${digits.slice(-4)}`;
}
