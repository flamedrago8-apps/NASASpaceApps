# Conduit: AI Gateway & Search Optimizer

**[Live demo →](https://flamedrago8-apps.github.io/NASASpaceApps/)** (runs entirely in your browser on simulated upstreams)

An OpenAI-compatible gateway that sits between your apps and LLM providers. Change one line (`baseURL`) and every request is guarded, cached, compressed, routed and search-optimized according to a policy you draw on a canvas.

```js
const openai = new OpenAI({
  apiKey: process.env.CONDUIT_KEY,
  baseURL: 'https://your-gateway.example.com/v1', // ← the only change
});
```

| | Feature | Where |
| --- | --- | --- |
| 🛡️ | Live attack & block alerts with confidence scores | Live demo page, `core/src/detect.ts` |
| 🛡️ | Two-way synthetic PII swapping (model sees a fake profile, app gets the real one) | `core/src/pii.ts`, Live demo side-by-side |
| 🛡️ | Honeypot: jailbreakers get a sandboxed decoy that "leaks" fake secrets and tarpits them | `honeypot` node |
| 💰 | Live before-vs-after savings counter | Live demo + Overview |
| 💰 | Semantic cache with entity guard ("weather in Austin" ≈ "raining in Austin, TX", never Dallas) | `core/src/semantic.ts` |
| 💰 | Cost vs Speed slider (Eco / Balanced / Performance model + search routing) | header of every page |
| 🌐 | Intent-based search bypass ("What is 5 + 5?" never costs a search credit) | `core/src/intent.ts` |
| 🌐 | Query merging, in-flight de-duplication, 10-minute result cache, multi-engine aggregation | `serpCache` / `queryOptimizer` / `serpApi` nodes |
| 🛠️ | One-line drop-in for any OpenAI SDK | API keys page quickstart |
| 🛠️ | Pipeline page: one left-to-right flow of tools. Switch tools on/off and drag to reorder; the order *is* the policy the gateway runs. | Pipeline page, `core/src/defaults.ts` (`wireLinear`) |

## Layout

```
core/      Shared TypeScript: pipeline engine, detectors, caches, router, metrics, types (no dependencies)
backend/   Node gateway server (Hono): OpenAI-compatible proxy + dashboard API · see backend/README.md
frontend/  Dashboard (React, Tailwind, React Flow) · see frontend/README.md and frontend/API.md
```

The same `core` engine runs on the server against real Anthropic / OpenAI / SerpAPI calls, and in the browser demo against simulated ones, so the demo shows the real logic.

## Quick start

```bash
cd backend && npm install && npm run dev                                  # gateway on :8787, prints your first API key
cd frontend && npm install && VITE_API_URL=http://localhost:8787 npm run dev   # dashboard on :5173
```

Without provider keys, upstream calls are simulated and clearly marked. Add `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` and `SERPAPI_API_KEY` to go live.

## Deploy the backend

- **Render (one click):** New → Blueprint → pick this repo. `render.yaml` builds the Dockerfile, which serves the gateway *and* the dashboard on one URL. Render generates `ADMIN_TOKEN`; copy it from the service's Environment tab.
- **Anything else that runs containers:** `docker build -t conduit . && docker run -p 8787:8787 -e ADMIN_TOKEN=... conduit`.

## Connect the dashboard to it

On any copy of the dashboard (including the GitHub Pages one), go to **Settings → Gateway connection**, then paste the gateway URL and admin token and press **Test and connect**. Every page switches from demo data to the live gateway, with no rebuild. The connection is saved in that browser only. A Pages site is served over https, so the gateway must be https too (Render is).
