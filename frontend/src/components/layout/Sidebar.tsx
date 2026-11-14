import clsx from 'clsx';
import { Activity, KeyRound, Settings, Workflow } from 'lucide-react';

const NAV = [
  { icon: Workflow, label: 'Pipelines', active: true },
  { icon: Activity, label: 'Traces' },
  { icon: KeyRound, label: 'API keys' },
];

export function Sidebar() {
  return (
    <aside className="hidden w-14 shrink-0 flex-col items-center border-r border-[#1c1c21] py-3 md:flex">
      <div className="mb-5 grid h-8 w-8 place-items-center rounded-lg bg-fg text-canvas" aria-label="Conduit">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M4 7h7a4 4 0 0 1 4 4v2a4 4 0 0 0 4 4h1" />
          <path d="M4 17h3" />
        </svg>
      </div>
      <nav className="flex flex-1 flex-col items-center gap-1">
        {NAV.map(({ icon: Icon, label, active }) => (
          <button key={label} title={label} aria-label={label} className={clsx('grid h-9 w-9 place-items-center rounded-lg transition-colors', active ? 'bg-white/[0.07] text-fg' : 'text-fg-subtle hover:text-fg-muted')}>
            <Icon size={17} strokeWidth={1.75} />
          </button>
        ))}
      </nav>
      <button title="Settings" aria-label="Settings" className="grid h-9 w-9 place-items-center rounded-lg text-fg-subtle hover:text-fg-muted">
        <Settings size={17} strokeWidth={1.75} />
      </button>
    </aside>
  );
}
