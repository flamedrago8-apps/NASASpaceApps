import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSimulatedProviders, createStores, defaultPipelineDoc, DEMO_PRESETS, runPipeline, virtualClock, type EngineContext, type GatewayRequest } from '../src/index';

const doc = defaultPipelineDoc();
const clock = virtualClock(Date.now());
let n = 0;
const ctx: EngineContext = { providers: createSimulatedProviders(clock, () => 0.5), stores: createStores(), clock, profile: 'balanced', logPayloads: true, redactPiiInLogs: false, newId: () => `t${++n}` };
const req = (prompt: string, model = 'claude-sonnet-5-5'): GatewayRequest => ({ model, app: 'test', clientId: 'c1', messages: [{ role: 'system', content: 'You are helpful.' }, { role: 'user', content: prompt }] });
const run = (p: string, c: Partial<EngineContext> = {}) => runPipeline(doc, req(p), { ...ctx, ...c });
const preset = (l: string) => DEMO_PRESETS.find((x) => x.label === l)!.prompt;

test('jailbreak goes to the honeypot with high confidence', async () => {
  const r = await run(preset('Jailbreak'));
  assert.equal(r.trace.status, 'honeypot');
  assert.equal(r.httpStatus, 200);
  assert.ok(r.trace.threatConfidence! > 0.98, String(r.trace.threatConfidence));
  assert.ok(!r.trace.path.includes('llm'));
  assert.ok(r.trace.saved > 0);
});

test('injection is blocked with 403 before any model call', async () => {
  const r = await run(preset('Injection'));
  assert.equal(r.trace.status, 'blocked');
  assert.equal(r.httpStatus, 403);
  assert.equal(r.trace.costActual, 0);
  assert.match(String((r.body as any).error.message), /prompt_injection/);
});

test('PII is swapped before the model and restored after', async () => {
  const r = await run(preset('PII'));
  const io = r.trace.io!;
  assert.ok(io.pii && io.pii.length >= 3, JSON.stringify(io.pii));
  assert.ok(!io.upstreamInput!.includes('sarah.johnson@gmail.com'));
  assert.ok(!io.upstreamInput!.includes('123-45-6789'));
  assert.ok(io.upstreamInput!.includes('000-00-'));
  assert.ok(r.text.includes('Sarah'), r.text);
  assert.ok(!r.text.includes('example.net'), r.text);
});

test('semantic cache matches a paraphrase but not a different city', async () => {
  const a = await run(preset('Weather'));
  assert.equal(a.trace.status, 'ok');
  const b = await run(preset('Paraphrase'));
  assert.equal(b.trace.status, 'cache_hit', JSON.stringify(b.trace.spans.find((s) => s.kind === 'semanticCache')));
  assert.equal(b.trace.cache?.kind, 'semantic');
  assert.ok(b.trace.latency < 50, `latency ${b.trace.latency}`);
  const c = await run('Tell me if it is raining in Dallas, TX');
  assert.notEqual(c.trace.status, 'cache_hit');
});

test('exact repeat hits the exact cache', async () => {
  await run('Explain the difference between TCP and UDP');
  const r = await run('Explain the difference between TCP and UDP');
  assert.equal(r.trace.cache?.kind, 'exact');
});

test('static-knowledge prompts bypass search', async () => {
  for (const p of [preset('5 + 5'), preset('Shakespeare')]) {
    const r = await run(p);
    assert.equal(r.trace.searchBypassed, true, p);
    assert.equal(r.trace.searchSent, 0);
    assert.ok(!r.trace.path.includes('serpApi'));
  }
  const r = await run(preset('5 + 5'));
  assert.match(r.text, /10/);
});

test('live search is deduplicated and cached', async () => {
  const r = await run(preset('Live search'));
  assert.ok(r.trace.searchSent > 0 && r.trace.searchSent < r.trace.searchRaw, `${r.trace.searchSent}/${r.trace.searchRaw}`);
  const again = await run('compare the current 30 year mortgage rates for Austin vs Denver please');
  assert.equal(again.trace.searchSent, 0, JSON.stringify(again.trace.spans.map((s) => [s.kind, s.outcome, s.detail])));
});

test('eco routes to the small model, performance to frontier', async () => {
  const eco = await run('Explain closures in JavaScript in one paragraph', { profile: 'eco', stores: createStores() });
  assert.equal(eco.trace.model, 'claude-haiku-5-5');
  const perf = await run('Explain closures in JavaScript in one paragraph', { profile: 'performance', stores: createStores() });
  assert.equal(perf.trace.model, 'claude-opus-5-5');
  assert.ok(eco.trace.costActual < perf.trace.costActual);
});

test('rewiring the graph changes behavior', async () => {
  const d = structuredClone(doc);
  d.edges = d.edges.map((e) => (e.id === 'jailbreak->honeypot' ? { ...e, id: 'jailbreak->block', target: 'block' } : e));
  const r = await runPipeline(d, req(preset('Jailbreak')), ctx);
  assert.equal(r.trace.status, 'blocked');
  const off = structuredClone(doc);
  off.nodes.find((x) => x.id === 'jailbreak')!.enabled = false;
  off.nodes.find((x) => x.id === 'injection')!.enabled = false;
  const leaked = await runPipeline(off, req(preset('Jailbreak')), ctx);
  assert.equal(leaked.trace.status, 'ok');
});

test('benign prompts are not flagged', async () => {
  for (const p of ['How do I reset my password?', 'Write a haiku about autumn', 'Can you ignore the typo in my last message and continue?', 'Show me how to print a variable in Python']) {
    const r = await run(p);
    assert.ok(r.trace.status !== 'blocked' && r.trace.status !== 'honeypot', `${p} → ${r.trace.status} ${r.trace.spans.map((s) => s.detail).join(' | ')}`);
  }
});

test('the linear tool order drives the graph', async () => {
  const { wireLinear } = await import('../src/defaults');
  // Turn off the search tools: live-data prompts now go straight to the LLM.
  const noSearch = structuredClone(doc);
  for (const n of noSearch.nodes) if (['searchIntent', 'serpCache', 'queryOptimizer', 'serpApi'].includes(n.kind)) n.enabled = false;
  const r = await runPipeline(wireLinear(noSearch), req('Weather in Denver right now?'), { ...ctx, stores: createStores() });
  assert.equal(r.trace.searchSent, 0);
  assert.ok(!r.trace.path.includes('serpApi') && r.trace.path.includes('llm'));
  // Move the semantic cache in front of security: a cached answer now skips the security checks.
  const reordered = structuredClone(doc);
  reordered.nodes.find((n) => n.kind === 'semanticCache')!.position.x = -50;
  const w = wireLinear(reordered);
  assert.equal(w.edges.find((e) => e.source === 'ingress')!.target, 'semanticCache');
  // Choosing "block" instead of "honeypot" for jailbreaks rewires the threat branch.
  const blockJb = structuredClone(doc);
  blockJb.nodes.find((n) => n.kind === 'jailbreak')!.config.action = 'block';
  const b = await runPipeline(wireLinear(blockJb), req(preset('Jailbreak')), ctx);
  assert.equal(b.trace.status, 'blocked');
});

test('search bypass holds even when the router is placed before other steps', async () => {
  const { wireLinear } = await import('../src/defaults');
  const d = structuredClone(doc);
  d.nodes.find((n) => n.kind === 'searchIntent')!.position.x = 150; // between exact and semantic cache
  const r = await runPipeline(wireLinear(d), req('Who wrote Romeo and Juliet? My account ID is 4411.'), { ...ctx, stores: createStores() });
  assert.equal(r.trace.searchBypassed, true);
  assert.equal(r.trace.searchSent, 0);
});
