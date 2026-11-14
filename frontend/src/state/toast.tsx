import { createContext, useContext, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';

type ToastFn = (msg: string, kind?: 'ok' | 'error' | 'info') => void;

const show: ToastFn = (msg, kind = 'info') => (kind === 'ok' ? toast.success(msg) : kind === 'error' ? toast.error(msg) : toast(msg));
const Ctx = createContext<ToastFn>(show);
export const useToast = () => useContext(Ctx);

/** Toasts via shadcn/ui's Sonner. */
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <Ctx.Provider value={show}>
      {children}
      <Toaster position="bottom-center" />
    </Ctx.Provider>
  );
}
