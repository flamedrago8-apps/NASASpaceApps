# Conduit gateway (backend)

An OpenAI-compatible AI gateway. Point any OpenAI SDK at it by changing **one line** (`baseURL`), and every request runs through the policy graph you drew in the dashboard:

| Pillar | What happens |
| --- | --- |
| 🛡️ Security | Prompt-injection and jailbreak scoring (shows confidence, e.g. `99.8%`). Injections get a **403** before any model is called; jailbreaks are routed to a sandboxed **honeypot** decoy that pretends to be hacked and tarpits the attacker. **PII** (names, emails, phones, SSNs, cards) is swapped for realistic synthetic values before the model sees it and swapped back into the reply. |
| 💰 Efficiency | Exact cache, **semantic cache** (embeddings + an entity guard, so "weather in Austin?" ≈ "is it raining in Austin, TX?" but never Dallas), prompt compression, and **Cost vs Speed** routing (Eco → Haiku / GPT-4o-mini, Performance → Opus / GPT-4o). |
| 🌐 SerpAPI | A sub-millisecond **search-intent classifier** skips web search when it isn't needed ("What is 5 + 5?"). Otherwise query fan-out is merged into the minimum set, identical in-flight searches are joined, results are cached for 10 minutes, and Performance mode aggregates multiple engines with URL de-duplication. |

The pipeline engine lives in [`../core`](../core) and is shared with the dashboard. The browser demo runs the same code with simulated upstreams.

## Run it

```bash
cd backend
npm install
npm run dev            # http://localhost:8787, auto-reload
```

On first start it prints your first gateway API key (shown once). Then:

```js
import OpenAI from 'openai';
const openai = new OpenAI({
  apiKey: process.env.CONDUIT_KEY,           // cdt_live_...
  baseURL: 'http://localhost:8787/v1',       // ← the only change
});
await openai.chat.completions.create({ model: 'claude-sonnet-5-5', messages: [{ role: 'user', content: 'Hi' }] });
```

Any model in `core/src/pricing.ts` works through the same client: `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`, `gpt-4o`, `gpt-4o-mini`, `llama-3.3-70b`.

To use the dashboard against this server, build it with `VITE_API_URL=http://localhost:8787` (see `../frontend/API.md`). Alternatively, set `STATIC_DIR=../frontend/dist` and the gateway serves the dashboard itself.

### No keys? It still works

Any provider without a key is **simulated**: templated answers and fake search results with realistic latency. Traces are marked `simulated: true`, and the startup log says which providers are live. Add keys as environment variables or under **Settings** in the dashboard. Keys saved from the dashboard are encrypted at rest with AES-256-GCM.

## Configuration

| Variable | Default | |
| --- | --- | --- |
| `PORT` / `HOST` | `8787` / `0.0.0.0` | |
| `DATA_DIR` | `./data` | `state.json` (pipeline, keys, settings, metrics) + `traces.jsonl` |
| `ADMIN_TOKEN` | *(unset = open)* | Protects the dashboard API. **Set this before exposing the server.** |
| `CORS_ORIGIN` | *(reflect any)* | Comma-separated dashboard origins, e.g. `https://flamedrago8-apps.github.io` |
| `SECRET_KEY` | *(generated into DATA_DIR)* | Encrypts provider keys saved from the dashboard |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `SERPAPI_API_KEY` | | Provider keys (override dashboard-saved ones) |
| `LLAMA_API_KEY`, `LLAMA_BASE_URL`, `LLAMA_MODEL` | Groq | Any OpenAI-compatible Llama host |
| `HONEYPOT_BASE_URL`, `HONEYPOT_API_KEY`, `HONEYPOT_MODEL` | *(local decoy)* | A cheap, isolated model for the honeypot. Without one, a zero-cost local decoy is used. |
| `EMBEDDINGS` | `local` | `local` (sub-ms, lexical + synonyms) or `openai` (`text-embedding-3-small`; better recall, ~100–300 ms per request) |
| `DEMO_TRAFFIC`, `DEMO_TRAFFIC_PER_MIN` | off, 40 | Simulated background traffic for demos. It always uses simulated providers and its own caches, so it never spends money or pollutes real caches. |
| `STATIC_DIR` | | Serve the built dashboard from the same origin |
| `PUBLIC_BASE_URL` | request origin | Base URL shown in the dashboard's quickstart |

## Endpoints

- **Gateway** (auth: gateway key): `POST /v1/chat/completions` (incl. `stream: true`), `GET /v1/models`
- **Dashboard API** (auth: `ADMIN_TOKEN`): see [`../frontend/API.md`](../frontend/API.md)

Gateway responses carry the headers `x-gateway-trace-id`, `x-gateway-status` (`ok`, `cache_hit`, `blocked`, `honeypot`, …), `x-gateway-saved-usd` and `x-gateway-cache`. Blocked requests return an OpenAI-style error body with HTTP 403, so OpenAI SDKs raise their normal `PermissionDeniedError`.

## Test

```bash
npm test                                   # engine tests (core) — no server needed
GATEWAY_KEY=cdt_live_... npm test          # + end-to-end tests against a running server, via the OpenAI SDK
```

## Deploy

The root [`Dockerfile`](../Dockerfile) builds a single container serving both the gateway and the dashboard:

```bash
docker build -t conduit .
docker run -p 8787:8787 -v conduit-data:/data -e ADMIN_TOKEN=change-me -e ANTHROPIC_API_KEY=... conduit
```

It runs anywhere that runs a container: Fly.io, Render, Railway, Cloud Run, a VM. Mount `/data` on a persistent volume.

## Known limits

- **One process.** State is a JSON file, and the caches and rate limits are in memory. To run several replicas, move them to Postgres or Redis (see `store.ts` and `createStores()`).
- **Buffered streaming.** With `stream: true` the reply is generated in full, then re-chunked as SSE. The gateway has to see the whole answer to swap real PII back in before anything leaves.
- **Heuristic detectors and classifier.** The injection/jailbreak detectors and the search-intent classifier are fast weighted rules, not ML models. They catch the common patterns (see `core/test/engine.test.ts`), but determined attackers can phrase around rules. An LLM-judge node would be the next step.
- **Name detection is approximate.** Structured PII (emails, phones, SSNs, cards) is detected reliably; person names use context patterns and a first-name list.
