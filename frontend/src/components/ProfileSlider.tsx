import clsx from 'clsx';
import { Gauge } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type Profile } from '../api';
import { useToast } from '../state/toast';
import { Segmented } from './ui/kit';
import { Slider } from './ui/slider';

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
        <Segmented label="Cost vs speed" value={(profile ?? 'balanced') as Profile} options={STOPS.map((s) => ({ id: s.id, label: s.label }))} onChange={setProfile} />
      </div>
    );

  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="font-semibold leading-none tracking-tight">Cost vs speed</h3>
        <span className="text-sm text-muted-foreground">{profile ? stop.label : '…'}</span>
      </div>
      <p className="mb-5 text-sm text-muted-foreground">Applies to all traffic immediately.</p>
      <Slider min={0} max={2} step={1} value={[idx]} disabled={!profile} onValueChange={([v]) => setProfile(STOPS[v].id)} aria-label="Cost vs speed" />
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        {STOPS.map((s) => (
          <button key={s.id} onClick={() => setProfile(s.id)} className={clsx('hover:text-foreground', profile === s.id && 'font-medium text-foreground')}>
            {s.label}
          </button>
        ))}
      </div>
      <p className="mt-4 rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">{stop.desc}</p>
    </div>
  );
}
