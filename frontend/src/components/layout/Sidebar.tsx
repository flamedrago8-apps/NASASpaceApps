import clsx from 'clsx';
import { Activity, Archive, BookOpen, KeyRound, LayoutGrid, Radar, Settings, ShieldCheck, Workflow } from 'lucide-react';

const NAV = [
  { icon: LayoutGrid, label: 'Overview' },
  { icon: Workflow, label: 'Pipelines', active: true },
  { icon: Activity, label: 'Traces' },
  { icon: ShieldCheck, label: 'Threats' },
  { icon: Archive, label: 'Caches' },
  { icon: Radar, label: 'Search' },
  { icon: KeyRound, label: 'API keys' },
];

export function Sidebar() {
  return (
    <aside className="hidden w-[52px] shrink-0 flex-col items-center border-r border-line bg-canvas py-3 md:flex">
      <div className="mb-4 grid h-7 w-7 place-items-center rounded-md bg-fg text-canvas" aria-label="Conduit">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M4 7h7a4 4 0 0 1 4 4v2a4 4 0 0 0 4 4h1" />
          <path d="M4 17h3" />
        </svg>
      </div>
      <nav className="flex flex-1 flex-col items-center gap-1">
        {NAV.map(({ icon: Icon, label, active }) => (
          <button
            key={label}
            title={label}
            aria-label={label}
            className={clsx('group relative grid h-9 w-9 place-items-center rounded-md transition-colors', active ? 'bg-surface-3 text-fg' : 'text-fg-subtle hover:bg-surface-2 hover:text-fg-muted')}
          >
            <Icon size={17} strokeWidth={1.75} />
            <span className="pointer-events-none absolute left-11 z-50 whitespace-nowrap rounded border border-line-strong bg-surface-3 px-2 py-1 text-[11px] text-fg opacity-0 shadow-lg group-hover:opacity-100">
              {label}
            </span>
          </button>
        ))}
      </nav>
      <div className="flex flex-col items-center gap-1">
        <button title="Docs" className="grid h-9 w-9 place-items-center rounded-md text-fg-subtle hover:bg-surface-2 hover:text-fg-muted">
          <BookOpen size={17} strokeWidth={1.75} />
        </button>
        <button title="Settings" className="grid h-9 w-9 place-items-center rounded-md text-fg-subtle hover:bg-surface-2 hover:text-fg-muted">
          <Settings size={17} strokeWidth={1.75} />
        </button>
        <div className="mt-2 h-7 w-7 rounded-full bg-gradient-to-br from-security via-serp to-efficiency p-px">
          <div className="grid h-full w-full place-items-center rounded-full bg-surface-3 text-[10px] font-medium text-fg">DV</div>
        </div>
      </div>
    </aside>
  );
}
