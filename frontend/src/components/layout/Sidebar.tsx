import { Activity, KeyRound, LayoutDashboard, Settings, Siren, Workflow } from 'lucide-react';
import { cn } from '@/lib/utils';
import { navigate } from '../../state/router';
import { Separator } from '../ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

export const NAV = [
  { path: '/demo', icon: Siren, label: 'Live demo' },
  { path: '/overview', icon: LayoutDashboard, label: 'Overview' },
  { path: '/pipeline', icon: Workflow, label: 'Pipeline' },
  { path: '/traces', icon: Activity, label: 'Traces' },
  { path: '/keys', icon: KeyRound, label: 'API keys' },
];

function NavButton({ path, label, active, children }: { path: string; label: string; active: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() => navigate(path)}
          aria-label={label}
          aria-current={active ? 'page' : undefined}
          className={cn(
            'grid h-9 w-9 place-items-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export function Sidebar({ path }: { path: string }) {
  return (
    <aside className="flex w-14 shrink-0 flex-col items-center gap-2 border-r bg-card/40 py-3">
      <button onClick={() => navigate('/demo')} className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground" aria-label="Conduit home">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
          <path d="M4 7h7a4 4 0 0 1 4 4v2a4 4 0 0 0 4 4h1" />
          <path d="M4 17h3" />
        </svg>
      </button>
      <Separator className="my-1 w-6" />
      <nav className="flex flex-1 flex-col items-center gap-1" aria-label="Main">
        {NAV.map(({ path: p, icon: Icon, label }) => (
          <NavButton key={p} path={p} label={label} active={path === p}>
            <Icon size={17} strokeWidth={1.75} />
          </NavButton>
        ))}
      </nav>
      <NavButton path="/settings" label="Settings" active={path === '/settings'}>
        <Settings size={17} strokeWidth={1.75} />
      </NavButton>
    </aside>
  );
}
