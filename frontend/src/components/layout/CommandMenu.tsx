import { DEMO_PRESETS } from '@tokenomics/core';
import { Gauge, Play, ShieldAlert } from 'lucide-react';
import { useEffect } from 'react';
import { api, PIPELINE_ID } from '../../api';
import { navigate } from '../../state/router';
import { useToast } from '../../state/toast';
import { useTraces } from '../../state/traces';
import { useProfile } from '../ProfileSlider';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '../ui/command';
import { NAV_ITEMS } from './AppSidebar';

/** ⌘K: jump anywhere, send demo requests, switch routing. */
export function CommandMenu({ open, setOpen }: { open: boolean; setOpen: (o: boolean) => void }) {
  const { setProfile } = useProfile();
  const { add } = useTraces();
  const toast = useToast();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [open, setOpen]);

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  const send = async (prompt: string) => {
    try {
      const r = await api.sendTestRequest({ pipelineId: PIPELINE_ID, prompt });
      add(r);
      toast(`${r.status === 'honeypot' ? 'Trapped in honeypot' : r.status === 'blocked' ? 'Blocked' : r.status === 'cache_hit' ? 'Cache hit' : 'Completed'} · ${Math.round(r.latency)}ms`, r.status === 'blocked' || r.status === 'honeypot' ? 'error' : 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Request failed', 'error');
    }
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Go to">
          {NAV_ITEMS.map((i) => (
            <CommandItem key={i.path} onSelect={() => run(() => navigate(i.path))}>
              <i.icon />
              {i.title}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Send test request">
          {DEMO_PRESETS.map((p) => (
            <CommandItem key={p.label} value={`send ${p.label} ${p.prompt}`} onSelect={() => run(() => send(p.prompt))}>
              {p.label === 'Jailbreak' || p.label === 'Injection' ? <ShieldAlert /> : <Play />}
              <span>{p.label}</span>
              <span className="truncate text-muted-foreground">{p.prompt}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Routing">
          {(['eco', 'balanced', 'performance'] as const).map((p) => (
            <CommandItem key={p} value={`routing ${p}`} onSelect={() => run(() => setProfile(p))}>
              <Gauge />
              Switch to {p[0].toUpperCase() + p.slice(1)}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
