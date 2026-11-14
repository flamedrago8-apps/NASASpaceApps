import clsx from 'clsx';

type Props = { dirty: number; version: number; running: boolean; onToggleRunning: () => void; onDeploy: () => void };

export function TopBar({ dirty, version, running, onToggleRunning, onDeploy }: Props) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[#1c1c21] px-4">
      <div className="flex min-w-0 items-center gap-2 text-[13px]">
        <span className="text-fg-subtle">prod-gateway</span>
        <span className="text-fg-subtle/60">/</span>
        <span className="truncate font-medium text-fg">chat-default</span>
        <span className="ml-1 hidden rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[11px] text-fg-subtle sm:inline">v{version}</span>
      </div>

      <div className="ml-auto flex items-center gap-3">
        {dirty > 0 && <span className="hidden text-[12px] text-fg-subtle sm:inline">{dirty} unsaved</span>}
        <button onClick={onToggleRunning} className="flex items-center gap-2 text-[12px] text-fg-muted hover:text-fg" aria-pressed={running}>
          <span className={clsx('relative h-[18px] w-8 rounded-full transition-colors', running ? 'bg-efficiency' : 'bg-[#2a2a32]')}>
            <span className={clsx('absolute top-[2px] h-3.5 w-3.5 rounded-full bg-canvas transition-all', running ? 'left-[16px]' : 'left-[2px]')} />
          </span>
          {running ? 'Live' : 'Paused'}
        </button>
        <button
          onClick={onDeploy}
          className={clsx('h-8 rounded-lg px-3.5 text-[12.5px] font-medium transition-colors', dirty ? 'bg-fg text-canvas hover:bg-white' : 'bg-white/[0.06] text-fg-muted hover:text-fg')}
        >
          {dirty ? 'Deploy' : 'Deployed'}
        </button>
      </div>
    </header>
  );
}
