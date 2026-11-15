import { NODE_SPECS, PALETTE, type NodeKind, type NodeSpec } from '@tokenomics/core';
import { Archive, Ban, Cpu, Database, EyeOff, Filter, Ghost, Globe, Layers, ScanEye, Send, ShieldAlert, Shrink, Split, Webhook, type LucideIcon } from 'lucide-react';

export type { Field, HandleSide } from '@tokenomics/core';

const ICONS: Record<NodeKind, LucideIcon> = {
  ingress: Webhook,
  injection: ScanEye,
  jailbreak: ShieldAlert,
  pii: EyeOff,
  block: Ban,
  honeypot: Ghost,
  exactCache: Database,
  semanticCache: Layers,
  compressor: Shrink,
  searchIntent: Split,
  serpCache: Archive,
  queryOptimizer: Filter,
  serpApi: Globe,
  llm: Cpu,
  response: Send,
};

export type CatalogEntry = NodeSpec & { icon: LucideIcon };

/** Node specs from core, plus the icon each node shows in the UI. */
export const CATALOG = Object.fromEntries(Object.entries(NODE_SPECS).map(([k, v]) => [k, { ...v, icon: ICONS[k as NodeKind] }])) as Record<NodeKind, CatalogEntry>;

export { PALETTE };

/** Plain-English copy for the pipeline UI: a 3-word block subtitle and one sentence on what it does for you. */
export const PLAIN: Record<NodeKind, { short: string; what: string }> = {
  ingress: { short: 'Raw request', what: 'Your app’s request arrives here, exactly as it would go to OpenAI or Anthropic.' },
  injection: { short: 'Blocks hijacks', what: 'Catches prompts that try to override your instructions or leak secrets, before any model sees them.' },
  jailbreak: { short: 'Stops “no rules” tricks', what: 'Catches role-play and encoding tricks that try to get the model to ignore its safety rules.' },
  pii: { short: 'Hides personal data', what: 'Swaps names, emails, card and SSN numbers for fake ones before the model sees them, then puts the real ones back in the answer.' },
  block: { short: 'Rejects attack', what: 'Stops the request with a 403 error. Nothing is sent to a model, so nothing is billed.' },
  honeypot: { short: 'Traps attacker', what: 'Sends the attacker to a cheap decoy model that pretends to be hacked, wasting their time while your real system stays untouched.' },
  exactCache: { short: 'Repeat questions', what: 'If the exact same question was asked recently, returns the saved answer instantly at zero model cost.' },
  semanticCache: { short: 'Similar questions', what: 'If a question with the same meaning was answered recently (“weather in Austin?” vs “is it raining in Austin?”), reuses that answer.' },
  compressor: { short: 'Shrinks prompts', what: 'Removes duplicated and stale conversation text so fewer tokens are paid for.' },
  searchIntent: { short: 'Search only if needed', what: 'Decides whether a question needs live web data. “What is 5 + 5?” never pays for a web search.' },
  serpCache: { short: 'Reuse results', what: 'Reuses web search results from the last few minutes instead of paying for the same search again.' },
  queryOptimizer: { short: 'Fewer queries', what: 'Merges overlapping search queries into the smallest set that still answers the question.' },
  serpApi: { short: 'Live web search', what: 'Runs the remaining searches on SerpAPI and adds the results to the prompt.' },
  llm: { short: 'Claude / GPT / Llama', what: 'Calls the model. The Cost vs Speed setting picks a cheaper or stronger model automatically.' },
  response: { short: 'Answer to your app', what: 'Returns the answer in the standard OpenAI format, with real personal data restored.' },
};
