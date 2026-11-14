import type { GatewayApi } from './client';
import { createHttpApi } from './http';
import { createMockApi, type MockControls } from './mock';

const url = import.meta.env.VITE_API_URL as string | undefined;
const token = import.meta.env.VITE_API_TOKEN as string | undefined;

const mock = url ? null : createMockApi();

/** The one API instance the app talks to. Set VITE_API_URL to switch from the mock to your backend. */
export const api: GatewayApi = url ? createHttpApi(url, token) : mock!;

/** Demo-only controls (traffic rate, reset). Null when talking to a real backend. */
export const mockControls: MockControls | null = mock?.controls ?? null;

export const PIPELINE_ID = (import.meta.env.VITE_PIPELINE_ID as string | undefined) || 'chat-default';

export * from './client';
export * from './types';
