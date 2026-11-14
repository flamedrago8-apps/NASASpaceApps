import clsx from 'clsx';
import { Bug, ChevronDown, Rocket, Send } from 'lucide-react';

type Props = { dirty: number; version: number; onDeploy: () => void; onTest: () => void; onAttack: () => void };

export function TopBar({ dirty, version, onDeploy, onTest, onAttack }: Props) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-canvas px-4">
      <nav className="flex min-w-0 items-center gap-1.5 text-[13px]" aria-label="Breadcrumb">
        <button className="flex items-center gap-1.5 rounded px-1.5 py-1 text-fg-muted hover:bg-surface-2 hover:text-fg">
          <span className="h-4 w-4 rounded-full bg-gradient-to-br from-security to-serp" />
          acme
        </button>
        <Slash />
        <button className="flex items-center gap-1 rounded px-1.5 py-1 text-fg-muted hover:bg-surface-2 hover:text-fg">
          prod-gateway
          <span className="ml-1 rounded-full border border-line-strong px-1.5 text-2xs text-fg-subtle">Production</span>
          <ChevronDown size={13} className="text-fg-subtle" />
        </button>
        <Slash />
        <span className="truncate px-1.5 font-medium text-fg">chat-default</span>
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <span className="hidden items-center gap-1.5 rounded-full border border-line-strong px-2 py-0.5 font-mono text-2xs text-fg-subtle lg:flex">
          <span className="h-1.5 w-1.5 animate-blink rounded-full bg-efficiency" />
          simulated traffic
        </span>
        <span className="hidden font-mono text-2xs text-fg-subtle sm:block">
          v{version}
          {dirty > 0 && <span className="text-security-amber"> · {dirty} unsaved change{dirty > 1 ? 's' : ''}</span>}
        </span>
        <div className="flex h-8 overflow-hidden rounded-md border border-line-strong">
          <button onClick={onTest} className="flex items-center gap-1.5 px-2.5 text-[12px] text-fg-muted hover:bg-surface-3 hover:text-fg">
            <Send size={13} /> Test request
          </button>
          <button onClick={onAttack} title="Send a simulated prompt-injection / jailbreak" className="flex items-center border-l border-line-strong px-2 text-fg-subtle hover:bg-surface-3 hover:text-danger">
            <Bug size={13} />
          </button>
        </div>
        <button
          onClick={onDeploy}
          className={clsx('flex h-8 items-center gap-1.5 rounded-md px-3 text-[12px] font-medium transition-colors', dirty ? 'bg-fg text-canvas hover:bg-white' : 'border border-line-strong text-fg-muted hover:text-fg')}
        >
          <Rocket size={13} /> Deploy
        </button>
      </div>
    </header>
  );
}

function Slash() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" className="shrink-0 text-line-strong" aria-hidden>
      <path d="M10.5 3 5.5 13" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}
