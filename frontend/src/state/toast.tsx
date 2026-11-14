import clsx from 'clsx';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type Toast = { id: number; msg: string; kind: 'ok' | 'error' | 'info' };
type ToastFn = (msg: string, kind?: Toast['kind']) => void;

const Ctx = createContext<ToastFn>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const show = useCallback<ToastFn>((msg, kind = 'info') => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-2), { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 5000 : 2800);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed bottom-16 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="flex animate-toast-in items-center gap-2 rounded-xl border border-[#2a2a31] bg-[#18181c] px-4 py-2 text-[12.5px] text-fg shadow-2xl shadow-black/60">
            {t.kind === 'ok' && <CircleCheck size={14} className="text-efficiency" />}
            {t.kind === 'error' && <CircleAlert size={14} className="text-danger" />}
            <span className={clsx(t.kind === 'error' && 'text-danger')}>{t.msg}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
