# Conduit: AI Gateway & Search Optimizer dashboard

Frontend for an AI gateway that sits between apps and LLM providers. It runs on
Vite, React 18, TypeScript, Tailwind 3 and React Flow 12.

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
npm run build
```

With no backend configured it runs on an in-browser mock. A "Demo data" badge in
the top-right says so, and its menu sets the simulated traffic rate or resets
the demo. To connect a real backend, set `VITE_API_URL` (see **[API.md](./API.md)**
for the full contract).

## Pages (hash routes)

| Route | What it does |
| --- | --- |
| `#/overview` | KPIs, with-vs-without-gateway spend chart, savings by pillar, request volume, recent threats. Time ranges are 1h, 24h, 7d and 30d, and every chart has a table view. |
| `#/pipeline` | Node canvas for the three pillars (Security, Efficiency, SerpAPI routing). Drafts autosave, Deploy takes an optional note, and History restores old versions. Click a node to open its settings, and open Logs at the bottom for live traces. `?node=<id>` opens a node directly. |
| `#/traces` | Full trace explorer: filters, search, step-by-step span detail, cost per trace, paging back through older traces, and JSON export. `?status=blocked` and `?id=<traceId>` deep-link into it. |
| `#/keys` | Create and revoke gateway API keys (the secret is shown once). Includes Python, Node and cURL quickstart snippets. |
| `#/settings` | Provider keys (write-only), SerpAPI key, budget and alert webhook, logging and retention, gateway region. |

## Code map

```
src/
  api/          types.ts (contract) · client.ts (interface) · http.ts (real) · mock.ts (demo) · index.ts (picks one)
  state/        router · toasts · shared live trace stream · useAsync data hook
  pages/        Overview · Pipeline · Traces · Keys · Settings
  components/   canvas/ (nodes, edges, floating controls) · inspector/ · trace/ · charts/ · ui/kit.tsx
  lib/          catalog.ts (node types, config schema) · pipeline.ts (layout, doc <-> canvas) · simulator.ts (mock traffic) · stats.ts
```

To add a node type, add an entry to `CATALOG` in `src/lib/catalog.ts`. Its
settings form, palette entry and canvas card are all generated from that entry.

Design tokens are in `tailwind.config.js` and mirrored in `src/lib/theme.ts`.
Chart colors (`CHART` in `components/charts/charts.tsx`) were validated for the
dark background: they pass the color-blind and contrast checks.
