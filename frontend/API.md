# Backend API contract

The dashboard talks to the backend only through the `GatewayApi` interface in
`src/api/client.ts`. Request and response shapes are the TypeScript types in
`src/api/types.ts` (and `Trace`/`Span` in `src/types.ts`). Those files are the
source of truth. This page summarizes them.

## Connecting a backend

The frontend reads three build-time variables. Copy `.env.example` to `.env.local` to set them:

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | Base URL of your backend, e.g. `https://api.yourgateway.com`. **When unset, the in-browser mock is used.** |
| `VITE_API_TOKEN` | Optional. Sent as `Authorization: Bearer …`, and as `?access_token=` on the SSE stream. Cookies are always sent (`credentials: 'include'`), so session auth works too. |
| `VITE_PIPELINE_ID` | Pipeline to edit. Default `chat-default`. |

> **`VITE_API_TOKEN` is compiled into the public JavaScript bundle.** On a public site such as GitHub Pages, don't put a real secret in it. Use cookie or session auth from your backend instead.

Your backend must allow CORS from the dashboard's origin, with credentials, for
`GET, POST, PUT, PATCH, DELETE`.

Errors: any non-2xx response. A body of `{ "error": { "message": "…" } }` or
`{ "message": "…" }` is shown to the user as a toast.

## Endpoints

### Pipelines
| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/v1/pipelines/:id` | – | `PipelineDoc` |
| PUT | `/v1/pipelines/:id/draft` | `PipelineDoc` | `PipelineDoc` (with `hasDraft: true`) |
| POST | `/v1/pipelines/:id/deploy` | `{ note?: string }` | `Deployment` |
| GET | `/v1/pipelines/:id/deployments` | – | `Deployment[]` (newest first) |
| POST | `/v1/pipelines/:id/restore` | `{ version: number }` | `PipelineDoc` (that version, as a draft) |

The editor autosaves the draft about 600 ms after every change. Saving a draft must
not change production traffic; only `deploy` does that.

`PipelineDoc.nodes[].id` is also the `nodeId` used in trace spans. The built-in
nodes use their kind as their id (`injection`, `semanticCache`, `llm`, …). Every
node `kind` and its `config` keys and defaults are listed in `src/lib/catalog.ts`
(`CATALOG[kind].fields` / `.defaults`).

Edges: `sourceHandle` is `"out"` for the main path or `"alt"` for the branch. The
branches are: threat → Block, cache hit → Response, no search / SERP cache hit → LLM.

### Traces
| Method | Path | Query | Returns |
| --- | --- | --- | --- |
| GET | `/v1/traces` | `status` (`ok`, `cache_hit`, `blocked`, `flagged`, `search`), `q`, `limit`, `before` (ms timestamp cursor) | `{ items: Trace[], nextBefore?: number }` |
| GET | `/v1/traces/stream` | `access_token?` | **Server-Sent Events.** One `event: trace` per request, with `data:` set to a JSON `Trace`. |
| POST | `/v1/test-requests` | body `{ pipelineId, attack?, prompt? }` | `Trace` |

For each `Trace`, emit one `Span` per node the request passed through, in order.
Give each span a `start` offset and a `duration` in ms, and an `outcome`
(`pass | hit | miss | blocked | flagged | bypassed | skipped | called | redacted`).
`saved` is the USD that step saved. `path` is the list of visited node ids;
`edges` lists the traversed `"source->target"` ids.

The canvas's per-node stats, live edge traffic and path highlighting are all
computed from these fields, so no extra endpoints are needed for them.

ROI fields on each trace:
- `costBaseline`: what the request would have cost sent straight to the model and SerpAPI.
- `costActual`: what it actually cost.
- `saved`: the difference.
- `tokensIn`/`tokensSent`, `searchRaw`/`searchSent`: before → after counts.

### Metrics
| Method | Path | Query | Returns |
| --- | --- | --- | --- |
| GET | `/v1/metrics/summary` | `range` = `1h \| 24h \| 7d \| 30d` | `Summary` |
| GET | `/v1/metrics/timeseries` | `range` | `SeriesPoint[]` (oldest first; about 30–60 buckets) |

### API keys
| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/v1/keys` | – | `ApiKey[]` |
| POST | `/v1/keys` | `{ name }` | `NewApiKey`. Includes `secret`, which is shown once and never returned again. |
| DELETE | `/v1/keys/:id` | – | `204` |

### Settings
| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/v1/settings` | – | `Settings`. Provider keys are reported only as `{ configured, last4 }`. |
| PATCH | `/v1/settings` | `SettingsPatch` | `Settings` |

`providerKeys` is write-only. Send a string to set or replace a key, or `""` to
remove it.

## Swapping in the backend

1. Implement the endpoints above.
2. Build with `VITE_API_URL` set. The Pages workflow already reads it: add a
   repository **variable** named `VITE_API_URL` under Settings → Secrets and
   variables → Actions → Variables, then re-run the deploy.
3. The "Demo data" badge disappears automatically when the mock isn't in use.
