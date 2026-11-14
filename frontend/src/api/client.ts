import type {
  ApiKey,
  Deployment,
  HoneypotSession,
  Lifetime,
  NewApiKey,
  PipelineDoc,
  Range,
  SeriesPoint,
  Settings,
  SettingsPatch,
  Summary,
  TestRequest,
  TestResult,
  Trace,
  TracePage,
  TraceQuery,
} from './types';

/**
 * Everything the UI needs from the backend. Two implementations:
 *  - mock.ts  — in-browser simulator (default, used for the demo / GitHub Pages)
 *  - http.ts  — real backend, enabled by setting VITE_API_URL at build time
 */
export interface GatewayApi {
  readonly mode: 'mock' | 'http';

  getPipeline(id: string): Promise<PipelineDoc>;
  /** Autosaved on every edit (debounced). Does not affect production traffic. */
  saveDraft(doc: PipelineDoc): Promise<PipelineDoc>;
  deploy(id: string, note?: string): Promise<Deployment>;
  listDeployments(id: string): Promise<Deployment[]>;
  /** Replaces the draft with a past version. The caller then deploys it. */
  restoreVersion(id: string, version: number): Promise<PipelineDoc>;

  listTraces(q: TraceQuery): Promise<TracePage>;
  /** Live stream of new traces. Returns an unsubscribe function. */
  streamTraces(onTrace: (t: Trace) => void, onError?: (e: unknown) => void): () => void;
  /** Runs one request through the current draft. With `prompt`, that exact prompt (Live demo console). */
  sendTestRequest(req: TestRequest): Promise<TestResult>;

  getSummary(range: Range): Promise<Summary>;
  getTimeseries(range: Range): Promise<SeriesPoint[]>;
  /** All-time totals since the gateway started — drives the live savings counter. */
  getLifetime(): Promise<Lifetime>;

  /** Attackers currently trapped in the honeypot. */
  listHoneypotSessions(): Promise<HoneypotSession[]>;

  listKeys(): Promise<ApiKey[]>;
  createKey(name: string): Promise<NewApiKey>;
  revokeKey(id: string): Promise<void>;

  getSettings(): Promise<Settings>;
  updateSettings(patch: SettingsPatch): Promise<Settings>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
