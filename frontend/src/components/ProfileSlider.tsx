import clsx from 'clsx';
import { Gauge } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type Profile } from '../api';
import { useToast } from '../state/toast';

const STOPS: { id: Profile; label: string; desc: string; color: string }[] = [
  { id: 'eco', label: 'Eco', desc: 'Cheapest model in family (Haiku · GPT-4o-mini) · max 1 search · searches only when clearly needed', color: '#34D399' },
  { id: 'balanced', label: 'Balanced', desc: 'The model the client asked for · up to 2 searches', color: '#A1A1AA' },
  { id: 'performance', label: 'Performance', desc: 'Frontier model (Opus · GPT-4o) · up to 3 queries across multiple search engines', color: '#A78BFA' },
];

type Ctx = { profile: Profile | null; setProfile: (p: Profile) => void };
const ProfileCtx = createContext<Ctx>({ profile: null, setProfile: () => {} });

/** One shared copy of the routing profile so every slider on screen agrees. */
export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, set] = useState<Profile | null>(null);
  const toast = useToast();
  useEffect(() => {
    api.getSettings().then((s) => set(s.routing?.profile ?? 'balanced'), () => set('balanced'));
  }, []);
  const setProfile = useCallback(
    (p: Profile) => {
      const prev = profile;
      set(p);
      api.updateSettings({ routing: { profile: p } }).then(
        () => toast(`Routing: ${STOPS.find((s) => s.id === p)!.label}`, 'ok'),
        (e) => {
          set(prev);
          toast(e instanceof Error ? e.message : 'Could not change routing', 'error');
        },
      );
    },
    [profile, toast],
  );
  return <ProfileCtx.Provider value={{ profile, setProfile }}>{children}</ProfileCtx.Provider>;
}

export const useProfile = () => useContext(ProfileCtx);

/** The global "Cost vs Speed" control. `compact` fits in a page header. */
export function ProfileSlider({ compact }: { compact?: boolean }) {
  const { profile, setProfile } = useProfile();
  const idx = Math.max(0, STOPS.findIndex((s) => s.id === profile));
  const stop = STOPS[idx];

  if (compact)
    return (
      <div className="flex items-center gap-2" title={stop.desc}>
        <Gauge size={14} className="text-fg-subtle" />
        <div role="radiogroup" aria-label="Cost vs speed" className="flex h-7 items-center rounded-lg bg-white/[0.04] p-0.5">
          {STOPS.map((s) => (
            <button key={s.id} role="radio" aria-checked={profile === s.id} onClick={() => setProfile(s.id)} className={clsx('h-full rounded-md px-2 text-[11.5px] transition-colors', profile === s.id ? 'bg-white/[0.09] text-fg' : 'text-fg-subtle hover:text-fg-muted')}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
    );

  return (
    <div className="rounded-2xl border border-[#1f1f25] bg-[#0f0f12] p-4">
      <div className="mb-3 flex items-center gap-2">
        <Gauge size={14} className="text-fg-subtle" />
        <span className="text-[12.5px] font-medium text-fg">Cost vs Speed</span>
        <span className="ml-auto text-[12px] font-medium" style={{ color: stop.color }}>
          {profile ? stop.label : '…'}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={2}
        step={1}
        value={idx}
        disabled={!profile}
        onChange={(e) => setProfile(STOPS[Number(e.target.value)].id)}
        aria-label="Cost vs speed"
        aria-valuetext={stop.label}
        className="range w-full"
        style={{ background: `linear-gradient(90deg, #34D399, #A1A1AA 50%, #A78BFA)`, ['--thumb' as string]: stop.color }}
      />
      <div className="mt-1.5 flex justify-between text-[11px] text-fg-subtle">
        {STOPS.map((s) => (
          <button key={s.id} onClick={() => setProfile(s.id)} className={clsx('hover:text-fg', profile === s.id && 'text-fg')}>
            {s.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11.5px] leading-snug text-fg-subtle">{stop.desc}</p>
    </div>
  );
}
