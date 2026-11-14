import { NODE_SPECS, PALETTE, type NodeKind, type NodeSpec } from '@conduit/core';
import { Archive, Ban, Cpu, Database, EyeOff, Filter, Ghost, Globe, Layers, ScanEye, Send, ShieldAlert, Shrink, Split, Webhook, type LucideIcon } from 'lucide-react';

export type { Field, HandleSide } from '@conduit/core';

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
