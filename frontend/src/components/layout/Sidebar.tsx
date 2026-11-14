import clsx from 'clsx';
import { Activity, KeyRound, LayoutDashboard, Settings, Workflow } from 'lucide-react';
import { navigate } from '../../state/router';

export const NAV = [
  { path: '/overview', icon: LayoutDashboard, label: 'Overview' },
  { path: '/pipeline', icon: Workflow, label: 'Pipeline' },
  { path: '/traces', icon: Activity, label: 'Traces' },
  { path: '/keys', icon: KeyRound, label: 'API keys' },
];

function NavButton({ path, label, active, children }: { path: string; label: string; active: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={() => navigate(path)}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={clsx('group relative grid h-9 w-9 place-items-center rounded-lg transition-colors', active ? 'bg-white/[0.08] text-fg' : 'text-fg-subtle hover:text-fg-muted')}
    >
      {children}
      <span className="pointer-events-none absolute left-11 z-50 whitespace-nowrap rounded-md border border-[#2a2a31] bg-[#18181c] px-2 py-1 text-[11.5px] text-fg opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        {label}
      </span>
    </button>
  );
}

export function Sidebar({ path }: { path: string }) {
  return (
    <aside className="flex w-14 shrink-0 flex-col items-center border-r border-[#1c1c21] py-3">
      <button onClick={() => navigate('/overview')} className="mb-5 grid h-8 w-8 place-items-center rounded-lg bg-fg text-canvas" aria-label="Conduit home">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
          <path d="M4 7h7a4 4 0 0 1 4 4v2a4 4 0 0 0 4 4h1" />
          <path d="M4 17h3" />
        </svg>
      </button>
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
