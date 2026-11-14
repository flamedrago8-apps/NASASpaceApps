# Conduit — AI Gateway & Search Optimizer dashboard

Developer-facing dark dashboard (Vite + React 18 + TypeScript + Tailwind 3 + React Flow 12) for an AI gateway middleware.

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
npm run build
```

## What's on screen

| Area | File | Notes |
| --- | --- | --- |
| KPI strip | `src/components/layout/StatsStrip.tsx` | 24h totals + 4-min sparklines |
| Pipeline canvas | `src/components/canvas/*` | Pillar swimlanes, custom nodes, edges with animated packets sized by live traffic share |
| Node properties panel | `src/components/inspector/NodeInspector.tsx` | Schema-driven config form (`CATALOG[kind].fields`), live metrics, recent events |
| Pipeline overview | `src/components/inspector/PipelineOverview.tsx` | Shown when no node is selected; per-pillar summary + quick toggles |
| Live Trace | `src/components/trace/LiveTrace.tsx` | Waterfall table; expand a row for step-by-step spans, ROI and payload |

### The three pillars
- **Security** (purple / amber): Prompt Injection, Jailbreak Detector, PII Redactor → `Block · 403`
- **Efficiency** (green): Exact Cache, Semantic Cache, Token Compressor
- **SerpAPI Routing** (cyan): Search Intent Router, SERP Result Cache, Query Optimizer → SerpAPI

## Interactions
- Hover a trace row to light up the exact path that payload took on the canvas; click to expand its spans.
- Click a node (or a span name in a trace) to open its properties. Edits apply to the simulated traffic immediately, so moving the semantic-cache threshold or disabling the jailbreak detector visibly changes hit rates, savings and "undetected attacks".
- Drag nodes from **Add node**, connect handles, Backspace to delete. **Deploy** bumps the version and clears the unsaved-changes counter.
- **Test request** / bug icon sends a normal request or a simulated attack.
- Pillar legend (top right) focuses one pillar.

## Wiring a real backend
All data comes from `src/lib/simulator.ts` via `src/hooks/useTrafficSimulator.ts`. Replace `emit()`/the timer loop with a WebSocket or SSE subscription that pushes objects matching the `Trace` type in `src/types.ts` (one `Span` per node visited, with `nodeId` matching the canvas node id); everything else — node stats, edge traffic, KPIs — is derived from that stream.

Design tokens live in `tailwind.config.js` (and mirrored for SVG/inline use in `src/lib/theme.ts`).
