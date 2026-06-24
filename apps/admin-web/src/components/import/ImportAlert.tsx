'use client';

import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type ImportAlertVariant = 'info' | 'warning' | 'error' | 'success';

interface ImportAlertProps {
  variant: ImportAlertVariant;
  title: string;
  message?: ReactNode;
  guidance?: ReactNode;
  technicalDetail?: string;
  className?: string;
}

const styles: Record<ImportAlertVariant, { box: string; icon: string }> = {
  info: {
    box: 'border-slate-200/90 bg-gradient-to-br from-slate-50 to-white text-slate-800',
    icon: 'bg-slate-100 text-slate-600',
  },
  warning: {
    box: 'border-amber-200/90 bg-gradient-to-br from-amber-50 to-white text-amber-950',
    icon: 'bg-amber-100 text-amber-700',
  },
  error: {
    box: 'border-red-200/90 bg-gradient-to-br from-red-50 to-white text-red-950',
    icon: 'bg-red-100 text-red-700',
  },
  success: {
    box: 'border-emerald-200/90 bg-gradient-to-br from-emerald-50 to-white text-emerald-950',
    icon: 'bg-emerald-100 text-emerald-700',
  },
};

function AlertIcon({ variant }: { variant: ImportAlertVariant }) {
  if (variant === 'success') {
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (variant === 'error') {
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
      </svg>
    );
  }
  if (variant === 'warning') {
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 9v4M12 17h.01" strokeLinecap="round" />
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
    );
  }
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
    </svg>
  );
}

export function ImportAlert({
  variant,
  title,
  message,
  guidance,
  technicalDetail,
  className,
}: ImportAlertProps) {
  const [showTechnical, setShowTechnical] = useState(false);
  const tone = styles[variant];

  return (
    <div
      className={cn(
        'flex gap-3 rounded-2xl border p-4 shadow-sm ring-1 ring-black/[0.03] sm:p-5',
        tone.box,
        className,
      )}
      role="alert"
    >
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', tone.icon)}>
        <AlertIcon variant={variant} />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-semibold">{title}</p>
        {message ? <p className="text-sm leading-relaxed opacity-90">{message}</p> : null}
        {guidance ? <p className="text-sm leading-relaxed opacity-80">{guidance}</p> : null}
        {technicalDetail ? (
          <div className="pt-1">
            <button
              type="button"
              className="text-xs font-medium underline opacity-70 hover:opacity-100"
              onClick={() => setShowTechnical((v) => !v)}
            >
              {showTechnical ? 'Hide technical details' : 'Show technical details'}
            </button>
            {showTechnical ? (
              <pre className="mt-2 overflow-x-auto rounded-lg bg-black/5 p-2 text-xs whitespace-pre-wrap">
                {technicalDetail}
              </pre>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
