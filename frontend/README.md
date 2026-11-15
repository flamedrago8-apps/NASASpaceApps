# Tokenomics: AI Gateway & Search Optimizer dashboard

Frontend for an AI gateway that sits between apps and LLM providers. It runs on
Vite, React 18, TypeScript, **shadcn/ui + Tailwind CSS** (Radix primitives) and React Flow 12.

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
npm run build
```

With no backend configured it runs an in-browser demo: the same pipeline engine as the backend (`../core`), with simulated model and search providers. A "Demo data" badge in
the top-right says so, and its menu sets the simulated traffic rate or resets
the demo. To connect a real backend, set `VITE_API_URL` (see **[API.md](./API.md)**
for the full contract).

## Pages (hash routes)

| Route | What it does |
| --- | --- |
| `#/demo` | Live demo (default page). A gateway console with attack/PII/cache/search presets, red attack alerts with confidence, the PII round trip side by side, honeypot sessions, the ticking savings counter and the Cost vs Speed slider. |
| `#/overview` | KPIs, with-vs-without-gateway spend chart, savings by pillar, request volume, recent threats. Time ranges are 1h, 24h, 7d and 30d, and every chart has a table view. |
| `#/pipeline` | One left-to-right flow (Ingestion → your tools → LLM API → Return). Switch tools on or off from the list, and drag a step (or use Earlier/Later) to reorder it. Click a step for a plain-English description, its key settings and one live stat. **Run a test request** dims the steps it skipped. Drafts autosave, Deploy publishes them, and History restores old versions. |
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
  lib/          catalog.ts (icons + plain-English copy) · explain.ts (trace → plain-English steps) · stats.ts
```

To add a node type, add an entry to `CATALOG` in `src/lib/catalog.ts`. Its
settings form, palette entry and canvas card are all generated from that entry.

Layout follows shadcn/ui's official `dashboard-01` block (inset sidebar, breadcrumb header, section cards with trends, interactive Recharts area chart, data tables) plus a ⌘K command palette (`cmdk`) and ⌘B to collapse the sidebar. UI components are **shadcn/ui** (`src/components/ui/*`, configured by `components.json`), so you can add more with `npx shadcn@latest add <component>`. The theme is the shadcn CSS variables in `src/index.css` (dark zinc); pillar accent colors live in `tailwind.config.js` and `src/lib/theme.ts`.
Chart colors (`CHART` in `components/charts/charts.tsx`) were validated for the
dark background: they pass the color-blind and contrast checks.
