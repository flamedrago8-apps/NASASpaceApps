/**
 * Prompt-injection and jailbreak detection.
 *
 * Each rule is a weighted signal; the score combines them as 1 − Π(1 − wᵢ),
 * so several weak signals add up and one strong signal is enough on its own.
 * Rules run in well under a millisecond, so detection never delays clean traffic.
 */

export type Detection = { score: number; signals: string[] };

type Rule = { re: RegExp; w: number; label: string };

const INJECTION: Rule[] = [
  { re: /\b(ignore|disregard|forget|override|bypass)\b[^.]{0,40}\b(all |any |the |your )?(previous|prior|above|earlier|preceding|original|system)\b[^.]{0,20}\b(instructions?|prompts?|rules?|directions?)\b|\b(ignore|override|bypass)\s+(all\s+)?(instructions?|system\s+prompts?)\b/i, w: 0.97, label: 'instruction override' },
  { re: /\b(reveal|print|show|repeat|output|leak|tell me|display|dump|what (is|are)|give me)\b[^.]{0,40}\b(system|hidden|initial|original|developer)\s+(prompt|instructions?|messages?|meta prompt)\b/i, w: 0.92, label: 'system prompt extraction' },
  { re: /<\/?\s*(system|assistant|sys|user|admin)\s*>|\[\/?INST\]|<<\/?SYS>>|<\|im_(start|end)\|>/i, w: 0.88, label: 'role-tag spoofing' },
  { re: /\b(system override|admin override|developer mode enabled|maintenance mode|god mode)\b/i, w: 0.92, label: 'fake privileged mode' },
  { re: /\b(api[_ -]?keys?|passwords?|secrets?|credentials?|tokens?|env(ironment)? variables?)\b[^.]{0,40}\b(list|print|send|reveal|show|exfiltrate|forward|dump)|\b(list|print|send|reveal|show|exfiltrate|forward|dump)\b[^.]{0,40}\b(api[_ -]?keys?|passwords?|secrets?|credentials?)/i, w: 0.90, label: 'secret exfiltration' },
  { re: /\b(forward|send|email|post)\b[^.]{0,40}\b(this conversation|the conversation|chat history|all messages)\b/i, w: 0.85, label: 'conversation exfiltration' },
  { re: /\b(new instructions?\s*:|prompt injection)\b/i, w: 0.85, label: 'injected instruction block' },
];

const JAILBREAK: Rule[] = [
  { re: /\b(DAN|do anything now|STAN|DUDE|AIM|jailbreak|jailbroken|evil mode|chaos mode)\b/i, w: 0.95, label: 'known jailbreak persona' },
  { re: /\b(you are|act as|pretend (to be|you are)|roleplay as|from now on you are|behave as)\b[^.]{0,60}\b(no|without|free of|zero|unrestricted|uncensored|unfiltered)\b[^.]{0,20}\b(rules|restrictions|filters|limits|guidelines|censorship|policy|policies)?/i, w: 0.93, label: 'unrestricted persona' },
  { re: /\b(ignore|bypass|disable|turn off|remove|circumvent)\b[^.]{0,30}\b(safety|content|ethical|ethics|guardrails?|guidelines?|policy|policies|rules|training|filters?)\b/i, w: 0.92, label: 'safety bypass request' },
  { re: /\b(hypothetically|in a story|for a novel|in fiction|grandma|grandmother|as a joke)\b[^.]{0,120}\b(bomb|explosive|napalm|weapon|malware|ransomware|meth|poison|hack|bypass)/i, w: 0.88, label: 'fictional framing of harmful request' },
  { re: /\b(answer|respond|reply)\b[^.]{0,30}\b(in|using)\b[^.]{0,10}\b(base64|rot13|hex|leetspeak)\b/i, w: 0.85, label: 'output obfuscation' },
  { re: /\bstay in character\b|\bno matter what\b[^.]{0,30}\b(answer|respond)/i, w: 0.7, label: 'persona lock-in' },
  { re: /\b(unfiltered|uncensored|unrestricted|no rules|never refuse|comply with everything)\b/i, w: 0.85, label: 'unrestricted compliance command' },
];

function base64Signal(text: string): string | null {
  const m = text.match(/[A-Za-z0-9+/]{40,}={0,2}/);
  if (!m) return null;
  try {
    const decoded = typeof atob === 'function' ? atob(m[0]) : '';
    const printable = decoded.replace(/[^\x20-\x7e]/g, '').length / Math.max(1, decoded.length);
    if (printable > 0.9 && /\b(ignore|instructions|system|password|bypass)\b/i.test(decoded)) return 'base64-encoded instructions';
  } catch {
    /* not base64 */
  }
  return null;
}

function score(text: string, rules: Rule[]): Detection {
  const signals: string[] = [];
  let keep = 1;
  for (const r of rules) {
    if (r.re.test(text)) {
      signals.push(r.label);
      keep *= 1 - r.w;
    }
  }
  return { score: Math.min(0.999, 1 - keep), signals };
}

export function detectInjection(text: string): Detection {
  const d = score(text, INJECTION);
  const b64 = base64Signal(text);
  if (b64) {
    d.signals.push(b64);
    d.score = Math.min(0.999, 1 - (1 - d.score) * 0.15);
  }
  return d;
}

export function detectJailbreak(text: string): Detection {
  // Leetspeak normalization catches "j41lbr34k", "1gn0re" etc.
  const norm = text.replace(/[4@]/g, 'a').replace(/3/g, 'e').replace(/[1!]/g, 'i').replace(/0/g, 'o').replace(/[5$]/g, 's').replace(/7/g, 't');
  const a = score(text, JAILBREAK);
  const b = norm !== text ? score(norm, JAILBREAK) : a;
  return b.score > a.score ? { score: b.score, signals: [...b.signals, 'leetspeak obfuscation'] } : a;
}

export const fmtConfidence = (s: number) => `${(Math.min(0.999, s) * 100).toFixed(1)}%`;
