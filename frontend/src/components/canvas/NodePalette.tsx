import clsx from 'clsx';
import { ChevronDown, GripVertical, Plus } from 'lucide-react';
import { useState } from 'react';
import { CATALOG, PALETTE } from '../../lib/catalog';
import { ACCENT, PILLAR } from '../../lib/theme';

export function NodePalette() {
  const [open, setOpen] = useState(false);
  return (
    <div className="absolute left-3 top-3 z-10 w-52 overflow-hidden rounded-lg border border-line-strong bg-surface/95 shadow-2xl shadow-black/50 backdrop-blur">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-medium text-fg hover:bg-surface-2">
        <Plus size={14} className="text-fg-muted" />
        Add node
        <ChevronDown size={14} className={clsx('ml-auto text-fg-subtle transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="max-h-[340px] overflow-y-auto border-t border-line py-1">
          <div className="px-3 pb-1 pt-1 text-2xs text-fg-subtle">Drag a node onto the canvas</div>
          {PALETTE.map((g) => (
            <div key={g.pillar} className="py-1">
              <div className="px-3 pb-1 pt-1.5 text-2xs font-medium uppercase tracking-[0.08em]" style={{ color: ACCENT[PILLAR[g.pillar].accent].fg }}>
                {PILLAR[g.pillar].label}
              </div>
              {g.kinds.map((k) => {
                const c = CATALOG[k];
                const Icon = c.icon;
                return (
                  <div
                    key={k}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/x-conduit-node', k);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    className="group mx-1 flex cursor-grab items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-fg-muted hover:bg-surface-3 hover:text-fg active:cursor-grabbing"
                  >
                    <Icon size={13} style={{ color: ACCENT[c.accent].fg }} />
                    <span className="truncate">{c.label}</span>
                    <GripVertical size={12} className="ml-auto text-fg-subtle opacity-0 group-hover:opacity-100" />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
