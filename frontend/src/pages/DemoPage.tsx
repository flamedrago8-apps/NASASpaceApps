import { DEMO_PRESETS } from '@conduit/core';
import { ArrowUp, LoaderCircle, ShieldAlert, Zap } from 'lucide-react';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, PIPELINE_ID, type TestResult, type Trace } from '../api';
import { ProfileSlider } from '../components/ProfileSlider';
import { SavingsCounter } from '../components/SavingsCounter';
import { StatusBadge } from '../components/trace/badges';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card';
import { PageHeader } from '../components/ui/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { CATALOG } from '../lib/catalog';
import { costLine, explain } from '../lib/explain';
import { fmtMs, fmtUsd } from '../lib/format';
import { cn } from '../lib/utils';
import { useToast } from '../state/toast';
import { useTraces } from '../state/traces';

const MODELS = ['claude-sonnet-5-5', 'claude-opus-5-5', 'gpt-4o', 'gpt-4o-mini'];
const label = (t?: string) => (t === 'jailbreak' ? 'Jailbreak attempt' : t === 'prompt_injection' ? 'Prompt injection' : 'Attack');

export function DemoPage() {
  const { add } = useTraces();
  const toast = useToast();
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState(MODELS[0]);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<TestResult[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const send = async (text: string) => {
    const p = text.trim();
    if (!p || busy) return;
    setBusy(true);
    setPrompt('');
    try {
      const r = await api.sendTestRequest({ pipelineId: PIPELINE_ID, prompt: p, model });
      add(r);
      setLog((l) => [...l, r]);
      setPicked(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Request failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [log, busy]);

  const focus = log.find((r) => r.id === picked) ?? log[log.length - 1] ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Live demo" actions={<ProfileSlider compact />} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 p-4 md:gap-6 lg:p-6">
          <SavingsCounter />

          <div className="grid gap-4 md:gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            {/* ---- Playground ---- */}
            <Card className="flex min-h-[560px] min-w-0 flex-col xl:h-[calc(100svh-300px)]">
              <CardHeader className="border-b pb-4">
                <CardTitle>Playground</CardTitle>
                <CardDescription>Requests run through your current draft pipeline</CardDescription>
                <CardAction>
                  <Select value={model} onValueChange={setModel}>
                    <SelectTrigger className="h-8 w-44 text-xs" aria-label="Model">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MODELS.map((m) => (
                        <SelectItem key={m} value={m} className="text-xs">
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardAction>
              </CardHeader>

              <div ref={scroller} className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
                {log.length === 0 && !busy && (
                  <div className="mx-auto flex max-w-sm flex-col items-center gap-2 py-12 text-center">
                    <div className="text-sm font-medium">Send a request through the gateway</div>
                    <p className="text-sm text-muted-foreground">
                      Try <span className="text-foreground">Weather</span>, then <span className="text-foreground">Paraphrase</span> for a semantic cache hit, or <span className="text-foreground">Jailbreak</span> to trip the honeypot.
                    </p>
                  </div>
                )}
                {log.map((r) => (
                  <Exchange key={r.id} r={r} active={focus?.id === r.id} onSelect={() => setPicked(r.id)} />
                ))}
                {busy && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <LoaderCircle className="size-4 animate-spin" /> Routing through the gateway…
                  </div>
                )}
              </div>

              <CardFooter className="flex-col items-stretch gap-3 border-t pt-4">
                <div className="flex flex-wrap gap-1.5">
                  {DEMO_PRESETS.map((p) => (
                    <Button key={p.label} variant="outline" size="sm" onClick={() => send(p.prompt)} disabled={busy} className="h-7 rounded-full px-3 text-xs font-normal text-muted-foreground hover:text-foreground">
                      {p.label}
                    </Button>
                  ))}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    send(prompt);
                  }}
                  className="flex items-end gap-2 rounded-lg border bg-background p-2 focus-within:ring-1 focus-within:ring-ring"
                >
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        send(prompt);
                      }
                    }}
                    rows={1}
                    placeholder="Message the gateway…"
                    aria-label="Prompt"
                    className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground"
                  />
                  <Button type="submit" size="icon" disabled={busy || !prompt.trim()} className="h-8 w-8 shrink-0" aria-label="Send">
                    <ArrowUp />
                  </Button>
                </form>
              </CardFooter>
            </Card>

            {/* ---- Right column: one plain-English explanation ---- */}
            <div className="flex min-w-0 flex-col gap-4 md:gap-6">
              {focus && (focus.status === 'blocked' || focus.status === 'honeypot') && (
                <Alert variant="destructive" className="border-destructive/50 bg-destructive/5">
                  <ShieldAlert className="h-4 w-4" />
                  <AlertTitle>
                    {label(focus.threat)} blocked ({((focus.threatConfidence ?? 0) * 100).toFixed(1)}% confidence)
                  </AlertTitle>
                  <AlertDescription className="text-muted-foreground">
                    {focus.status === 'honeypot' ? 'Routed to the sandboxed honeypot. ' : 'Rejected with 403. '}The real model was never called, so nothing was charged.
                  </AlertDescription>
                </Alert>
              )}
              <WhatHappened trace={focus} />
              <ProfileSlider />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Exchange({ r, active, onSelect }: { r: TestResult; active: boolean; onSelect: () => void }) {
  const stopped = r.status === 'blocked' || r.status === 'honeypot';
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-muted px-4 py-2.5 text-sm">{r.io?.input ?? r.prompt}</div>
      </div>
      <button onClick={onSelect} className={cn('block w-full max-w-[92%] rounded-lg p-2 -m-2 text-left transition-colors hover:bg-muted/40', active && 'bg-muted/40')}>
        <div className={cn('whitespace-pre-wrap break-words text-sm leading-relaxed', stopped ? (r.status === 'honeypot' ? 'font-mono text-xs text-muted-foreground' : 'text-danger') : 'text-foreground')}>
          {r.status === 'honeypot' && <div className="mb-1.5 font-sans text-xs text-muted-foreground">Decoy reply the attacker received:</div>}
          {r.response}
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <StatusBadge status={r.status} />
          {r.cache && (
            <Badge variant="outline" className="font-normal">
              <Zap className="text-efficiency" /> {r.cache.kind === 'semantic' ? `${(r.cache.similarity * 100).toFixed(0)}% semantic cache hit` : 'Exact cache hit'}
            </Badge>
          )}
          <span className="tabular-nums">{fmtMs(r.latency)}</span>
          <span className="tabular-nums">{r.saved > 0 ? `saved ${fmtUsd(r.saved)}` : fmtUsd(r.costActual)}</span>
          <span className="ml-auto">{active ? 'Explained on the right' : 'Click to explain'}</span>
        </div>
      </button>
    </div>
  );
}

/** Step-by-step, plain-English account of one request. */
function WhatHappened({ trace }: { trace: TestResult | null }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>What just happened</CardTitle>
        <CardDescription>Each step the gateway took for this request</CardDescription>
      </CardHeader>
      <CardContent>
        {!trace ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Send a request and this panel explains, step by step, how the gateway handled it.</p>
        ) : (
          <div className="space-y-5">
            <ol className="space-y-3">
              {explain(trace).map((s, i) => {
                const Icon = CATALOG[s.kind].icon;
                return (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className={cn('mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border', s.tone === 'good' && 'border-efficiency/40 text-efficiency', s.tone === 'bad' && 'border-destructive/50 text-danger', s.tone === 'neutral' && 'text-muted-foreground')}>
                      <Icon className="size-3.5" />
                    </span>
                    <span className="leading-relaxed">{s.text}</span>
                  </li>
                );
              })}
            </ol>
            {trace.searchBypassed && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="line-through">SerpAPI</span> bypassed: internal knowledge sufficient
              </p>
            )}
            {!!trace.io?.pii?.length && <PiiCompare trace={trace} />}
            <p className="border-t pt-4 text-sm font-medium">{costLine(trace)}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Highlight({ text, values }: { text: string; values: string[] }) {
  const vs = values.filter(Boolean).sort((a, b) => b.length - a.length);
  if (!vs.length) return <>{text}</>;
  const re = new RegExp(`(${vs.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  return (
    <>
      {text.split(re).map((part, i) =>
        vs.includes(part) ? (
          <mark key={i} className="rounded bg-accent px-0.5 text-foreground">
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

/** What the app sent vs what the model saw, and back. */
function PiiCompare({ trace }: { trace: Trace | null }) {
  const io = trace?.io;
  const real = io?.pii?.map((p) => p.real) ?? [];
  const fake = io?.pii?.map((p) => p.synthetic) ?? [];
  return (
    <div>
      <div className="mb-2 text-sm font-medium">What the model saw vs. what your app got</div>
      {!io?.pii?.length ? null : (
          <Tabs defaultValue="request">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="request">Request</TabsTrigger>
              <TabsTrigger value="response">Response</TabsTrigger>
              <TabsTrigger value="mapping">Mapping</TabsTrigger>
            </TabsList>
            <TabsContent value="request" className="grid gap-3 sm:grid-cols-2">
              <Pane title="Your app sent">
                <Highlight text={io.input} values={real} />
              </Pane>
              <Pane title="The model saw">
                <Highlight text={io.upstreamInput ?? ''} values={fake} />
              </Pane>
            </TabsContent>
            <TabsContent value="response" className="grid gap-3 sm:grid-cols-2">
              <Pane title="The model replied">
                <Highlight text={io.upstreamOutput ?? '—'} values={fake} />
              </Pane>
              <Pane title="Your app received">
                <Highlight text={io.output ?? ''} values={real} />
              </Pane>
            </TabsContent>
            <TabsContent value="mapping">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Type</TableHead>
                    <TableHead>Real value</TableHead>
                    <TableHead>Sent to model</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {io.pii.map((p, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-muted-foreground">{p.type}</TableCell>
                      <TableCell className="font-mono text-xs">{p.real}</TableCell>
                      <TableCell className="font-mono text-xs">{p.synthetic}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
      )}
    </div>
  );
}

function Pane({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">{title}</div>
      <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">{children}</div>
    </div>
  );
}
