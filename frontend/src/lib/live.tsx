import { createContext, useContext } from 'react';
import type { NodeStat } from './stats';
import type { Trace } from '../types';

export type Highlight = { nodes: Set<string>; edges: Set<string> } | null;

export type LiveState = {
  nodeStats: Record<string, NodeStat>;
  edgeShare: Record<string, number>;
  lastTrace: Trace | undefined;
  highlight: Highlight;
  dimPillar: string | null;
};

export const LiveContext = createContext<LiveState>({
  nodeStats: {},
  edgeShare: {},
  lastTrace: undefined,
  highlight: null,
  dimPillar: null,
});

export const useLive = () => useContext(LiveContext);
