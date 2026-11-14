import clsx from 'clsx';
import { ACCENT, PILLAR } from '../../lib/theme';
import type { Pillar } from '../../types';

const ITEMS: Pillar[] = ['security', 'efficiency', 'search'];

export function PillarLegend({ active, onToggle }: { active: string | null; onToggle: (p: string | null) => void }) {
  return (
    <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-lg border border-line-strong bg-surface/95 p-1 backdrop-blur">
      {ITEMS.map((p) => {
        const a = ACCENT[PILLAR[p].accent];
        const on = active === p;
        return (
          <button
            key={p}
            onClick={() => onToggle(on ? null : p)}
            className={clsx('flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] transition-colors', on ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:text-fg', active && !on && 'opacity-50')}
            title={on ? 'Show all pillars' : `Focus ${PILLAR[p].label}`}
          >
            <span className="h-2 w-2 rounded-[3px]" style={{ background: a.fg }} />
            {PILLAR[p].label}
            {p === 'security' && <span className="h-2 w-2 rounded-[3px]" style={{ background: ACCENT.amber.fg }} />}
          </button>
        );
      })}
    </div>
  );
}
