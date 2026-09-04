'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';

export type ToastMessage = {
  tone: 'success' | 'error';
  title?: string;
  message: string;
};

export function Toast({ toast, onClose }: { toast: ToastMessage | null; onClose: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(onClose, 5000);
    return () => window.clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast || typeof document === 'undefined') return null;

  const success = toast.tone === 'success';
  return createPortal(
    <div className="fixed bottom-4 right-4 z-[200] w-[min(24rem,calc(100vw-2rem))]" role={success ? 'status' : 'alert'} aria-live="polite">
      <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 shadow-2xl ${success ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-red-300 bg-red-50 text-red-900'}`}>
        <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-black text-white ${success ? 'bg-emerald-600' : 'bg-red-600'}`} aria-hidden="true">
          {success ? '✓' : '!'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">{toast.title ?? (success ? 'Sent successfully' : 'Sending failed')}</p>
          <p className="mt-0.5 text-sm">{toast.message}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded p-1 text-current opacity-60 hover:bg-black/5 hover:opacity-100" aria-label="Close notification">×</button>
      </div>
    </div>,
    document.body,
  );
}
