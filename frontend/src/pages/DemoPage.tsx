import { DEMO_PRESETS } from '@conduit/core';
import { ArrowUp, Ghost, LoaderCircle, ShieldAlert, ShieldCheck, Zap } from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { fmtMs, fmtUsd } from '../lib/format';
import { cn } from '../lib/utils';
import { useToast } from '../state/toast';
import { useTraces } from '../state/traces';
import { useAsync } from '../state/useAsync';

const MODELS = ['claude-sonnet-5-5', 'claude-opus-5-5', 'gpt-4o', 'gpt-4o-mini'];
const label = (t?: string) => (t === 'jailbreak' ? 'Jailbreak attempt' : t === 'prompt_injection' ? 'Prompt injection' : 'Attack');

export function DemoPage() {
  const { traces, add } = useTraces();
  const toast = useToast();
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState(MODELS[0]);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<TestResult[]>([]);
  const [alert, setAlert] = useState<Trace | null>(null);
  const [lastPii, setLastPii] = useState<Trace | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const honeypot = useAsync(() => api.listHoneypotSessions(), [], 5000);

  const send = async (text: string) => {
    const p = text.trim();
    if (!p || busy) return;
    setBusy(true);
    setPrompt('');
    try {
      const r = await api.sendTestRequest({ pipelineId: PIPELINE_ID, prompt: p, model });
      add(r);
      setLog((l) => [...l, r]);
      if (r.status === 'blocked' || r.status === 'honeypot') {
        setAlert(r);
        honeypot.reload();
      }
      if (r.io?.pii?.length) setLastPii(r);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Request failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [log, busy]);

  const attacks = useMemo(() => traces.filter((t) => t.status === 'blocked' || t.status === 'honeypot' || t.leakedThreat).slice(0, 8), [traces]);
  const pii = lastPii ?? traces.find((t) => t.io?.pii?.length) ?? null;

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
                  <Exchange key={r.id} r={r} />
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

            {/* ---- Right column ---- */}
            <div className="flex min-w-0 flex-col gap-4 md:gap-6">
              {alert ? (
                <Alert variant="destructive" className="border-destructive/50 bg-destructive/5">
                  <ShieldAlert className="h-4 w-4" />
                  <AlertTitle>
                    {label(alert.threat)} blocked ({((alert.threatConfidence ?? 0) * 100).toFixed(1)}% confidence)
                  </AlertTitle>
                  <AlertDescription className="text-muted-foreground">
                    {alert.status === 'honeypot' ? 'Routed to the sandboxed honeypot. ' : 'Rejected with 403. '}The upstream model was never called — $0.00 charged.
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert>
                  <ShieldCheck className="h-4 w-4" />
                  <AlertTitle>Guardrails active</AlertTitle>
                  <AlertDescription className="text-muted-foreground">Injection and jailbreak detection run on every request before any model is called.</AlertDescription>
                </Alert>
              )}

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle>Security events</CardTitle>
                  <CardDescription>Attacks seen by the gateway from any client</CardDescription>
                </CardHeader>
                <CardContent className="px-0 pb-2">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="pl-6">Time</TableHead>
                        <TableHead>Outcome</TableHead>
                        <TableHead className="text-right">Confidence</TableHead>
                        <TableHead className="pr-6">Prompt</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {attacks.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="h-16 text-center text-muted-foreground">
                            No attacks yet.
                          </TableCell>
                        </TableRow>
                      )}
                      {attacks.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="whitespace-nowrap pl-6 tabular-nums text-muted-foreground">{new Date(t.ts).toLocaleTimeString([], { hour12: false })}</TableCell>
                          <TableCell>{t.leakedThreat ? <Badge variant="outline" className="text-security-amber">Missed</Badge> : <StatusBadge status={t.status} />}</TableCell>
                          <TableCell className="text-right tabular-nums">{t.threatConfidence ? `${(t.threatConfidence * 100).toFixed(1)}%` : '—'}</TableCell>
                          <TableCell className="max-w-[200px] truncate pr-6 text-muted-foreground">{t.prompt}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <PiiCompare trace={pii} />
              <ProfileSlider />

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle>Honeypot sessions</CardTitle>
                  <CardDescription>Attackers kept busy by the decoy model</CardDescription>
                  <CardAction>
                    <Ghost className="size-4 text-muted-foreground" />
                  </CardAction>
                </CardHeader>
                <CardContent className="px-0 pb-2">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="pl-6">Attacker</TableHead>
                        <TableHead className="text-right">Attempts</TableHead>
                        <TableHead className="pr-6 text-right">Time wasted</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!honeypot.data?.length && (
                        <TableRow>
                          <TableCell colSpan={3} className="h-16 text-center text-muted-foreground">
                            No one trapped yet.
                          </TableCell>
                        </TableRow>
                      )}
                      {honeypot.data?.slice(0, 5).map((h) => (
                        <TableRow key={h.id} title={`Last prompt: ${h.lastPrompt}\n\nDecoy reply: ${h.lastReply}`}>
                          <TableCell className="max-w-[160px] truncate pl-6 font-mono text-xs">{h.id}</TableCell>
                          <TableCell className="text-right tabular-nums">{h.attempts}</TableCell>
                          <TableCell className="pr-6 text-right tabular-nums">{fmtMs(h.timeWastedMs)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Exchange({ r }: { r: TestResult }) {
  const stopped = r.status === 'blocked' || r.status === 'honeypot';
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-muted px-4 py-2.5 text-sm">{r.io?.input ?? r.prompt}</div>
      </div>
      <div className="max-w-[92%] space-y-2.5">
        <div className={cn('whitespace-pre-wrap break-words text-sm leading-relaxed', stopped ? (r.status === 'honeypot' ? 'font-mono text-xs text-muted-foreground' : 'text-danger') : 'text-foreground')}>
          {r.status === 'honeypot' && <div className="mb-1.5 font-sans text-xs text-muted-foreground">Decoy reply sent to the attacker:</div>}
          {r.response}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={r.status} />
          {r.threatConfidence !== undefined && (
            <Badge variant="outline" className="font-normal">
              {label(r.threat)} · {(r.threatConfidence * 100).toFixed(1)}%
            </Badge>
          )}
          {r.cache && (
            <Badge variant="outline" className="font-normal">
              <Zap className="text-efficiency" /> {r.cache.kind === 'semantic' ? `${(r.cache.similarity * 100).toFixed(0)}% semantic cache hit` : 'Exact cache hit'}
            </Badge>
          )}
          {r.searchBypassed && (
            <Badge variant="outline" className="font-normal text-muted-foreground">
              Search bypassed · internal knowledge sufficient
            </Badge>
          )}
          {r.searchSent > 0 && (
            <Badge variant="outline" className="font-normal">
              {r.searchRaw} → {r.searchSent} searches
            </Badge>
          )}
          {!!r.io?.pii?.length && (
            <Badge variant="outline" className="font-normal">
              {r.io.pii.length} PII values swapped
            </Badge>
          )}
          <span className="ml-auto flex items-center gap-3 text-xs tabular-nums text-muted-foreground">
            <span>{r.status === 'honeypot' ? 'decoy' : r.model}</span>
            <span>{fmtMs(r.latency)}</span>
            <span className={r.saved > 0 ? 'text-foreground' : ''}>{r.saved > 0 ? `saved ${fmtUsd(r.saved)}` : fmtUsd(r.saved)}</span>
          </span>
        </div>
        <PathStrip trace={r} />
      </div>
    </div>
  );
}

/** The nodes this request visited. Skipped search shows as "Bypassed". */
function PathStrip({ trace }: { trace: Trace }) {
  const steps = trace.spans.filter((s) => s.outcome !== 'bypassed');
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
      {steps.map((s, i) => (
        <Fragment key={i}>
          {i > 0 && <span aria-hidden>›</span>}
          <span title={s.detail} className={cn(s.outcome === 'blocked' && 'text-danger', s.outcome === 'trapped' && 'text-foreground', s.outcome === 'hit' && 'text-efficiency')}>
            {CATALOG[s.kind].label}
          </span>
        </Fragment>
      ))}
      {trace.searchBypassed && (
        <>
          <span aria-hidden>·</span>
          <span className="line-through decoration-muted-foreground/50">SerpAPI</span>
          <span>bypassed — internal knowledge sufficient</span>
        </>
      )}
    </div>
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
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>PII token swap</CardTitle>
        <CardDescription>The model only ever sees synthetic values</CardDescription>
      </CardHeader>
      <CardContent>
        {!io?.pii?.length ? (
          <div className="py-4 text-center text-sm text-muted-foreground">Send the PII suggestion to see the round trip.</div>
        ) : (
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
      </CardContent>
    </Card>
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
