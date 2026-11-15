/** Turns a trace into short plain-English sentences, one per step that did something. */
import type { Span, Trace } from '../types';
import { fmtMs, fmtUsd } from './format';

export type Step = { kind: Span['kind']; text: string; tone: 'good' | 'bad' | 'neutral' };

const pct = (x?: number) => `${((x ?? 0) * 100).toFixed(1)}%`;

export function explain(t: Trace): Step[] {
  const out: Step[] = [];
  for (const s of t.spans) {
    switch (s.kind) {
      case 'injection':
      case 'jailbreak': {
        const what = s.kind === 'injection' ? 'prompt injection' : 'jailbreak';
        if (s.outcome === 'blocked') out.push({ kind: s.kind, tone: 'bad', text: `Detected a ${what} attack (${pct(t.threatConfidence)} sure). Stopped before it reached any model.` });
        else if (s.outcome === 'flagged') out.push({ kind: s.kind, tone: 'bad', text: `Possible ${what} (${pct(t.threatConfidence)} sure). Allowed through but flagged for review.` });
        else if (s.outcome === 'pass') out.push({ kind: s.kind, tone: 'neutral', text: `Checked for ${what}: clean.` });
        break;
      }
      case 'block':
        out.push({ kind: s.kind, tone: 'bad', text: 'Rejected with a 403 error. $0 was spent on this request.' });
        break;
      case 'honeypot':
        out.push({ kind: s.kind, tone: 'bad', text: `Sent the attacker to a decoy model that pretends to be hacked, and kept them waiting ${fmtMs(t.latency)}. The real model never saw it.` });
        break;
      case 'pii': {
        const n = t.io?.pii?.length ?? 0;
        if (n) out.push({ kind: s.kind, tone: 'good', text: `Found ${n} piece${n > 1 ? 's' : ''} of personal data (${[...new Set(t.io!.pii!.map((p) => p.type.toLowerCase()))].join(', ')}) and replaced ${n > 1 ? 'them' : 'it'} with fake values before the model saw ${n > 1 ? 'them' : 'it'}.` });
        else out.push({ kind: s.kind, tone: 'neutral', text: 'No personal data found.' });
        break;
      }
      case 'exactCache':
        if (s.outcome === 'hit') out.push({ kind: s.kind, tone: 'good', text: 'This exact question was answered recently, so the saved answer was returned instantly. No model call.' });
        break;
      case 'semanticCache':
        if (s.outcome === 'hit') out.push({ kind: s.kind, tone: 'good', text: `A question with the same meaning (${pct(t.cache?.similarity)} similar: “${t.cache?.matched ?? ''}”) was answered recently, so that answer was reused. No model call.` });
        break;
      case 'compressor':
        if ((s.tokensSaved ?? 0) > 0) out.push({ kind: s.kind, tone: 'good', text: `Trimmed ${s.tokensSaved} tokens of duplicated or stale text from the prompt.` });
        break;
      case 'searchIntent':
        if (s.outcome === 'skipped') out.push({ kind: s.kind, tone: 'good', text: 'This question doesn’t need live web data, so the paid web search was skipped.' });
        else if (s.outcome === 'pass') out.push({ kind: s.kind, tone: 'neutral', text: 'This question needs live web data.' });
        break;
      case 'serpCache':
        if (s.outcome === 'hit') out.push({ kind: s.kind, tone: 'good', text: 'The same search ran a few minutes ago, so those results were reused instead of paying again.' });
        break;
      case 'queryOptimizer':
        if (t.searchRaw > t.searchSent && t.searchSent > 0) out.push({ kind: s.kind, tone: 'good', text: `Merged ${t.searchRaw} overlapping searches into ${t.searchSent}.` });
        break;
      case 'serpApi':
        if (t.searchSent) out.push({ kind: s.kind, tone: 'neutral', text: `Ran ${t.searchSent} live web search${t.searchSent > 1 ? 'es' : ''} and added the results to the prompt.` });
        break;
      case 'llm':
        if (s.outcome === 'called') out.push({ kind: s.kind, tone: 'neutral', text: t.model !== t.requestedModel ? `Answered by ${t.model} (Cost vs Speed switched it from ${t.requestedModel}).` : `Answered by ${t.model}.` });
        break;
      case 'response':
        if (t.io?.pii?.length) out.push({ kind: s.kind, tone: 'good', text: 'Put the real personal data back into the answer before returning it to your app.' });
        break;
    }
  }
  return out;
}

export function costLine(t: Trace): string {
  if (t.status === 'blocked' || t.status === 'honeypot') return `Cost: ${fmtUsd(t.costActual)}. Sending it straight to the model would have cost ${fmtUsd(t.costBaseline)}.`;
  const p = t.costBaseline > 0 ? Math.round((t.saved / t.costBaseline) * 100) : 0;
  return `Cost: ${fmtUsd(t.costActual)} instead of ${fmtUsd(t.costBaseline)} without the gateway (${p}% saved) · ${fmtMs(t.latency)}`;
}
