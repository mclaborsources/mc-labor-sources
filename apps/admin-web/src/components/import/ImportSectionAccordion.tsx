'use client';

import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type ImportSectionStats = {
  pasted: number;
  created: number;
  updated: number;
  skipped?: number;
  failed: number;
  warnings?: number;
  conflicts?: number;
};

interface ImportSectionAccordionProps {
  step: number;
  label: string;
  stats: ImportSectionStats;
  defaultOpen?: boolean;
  children: ReactNode;
}

function CountBadge({ label, value, tone }: { label: string; value: number; tone?: 'neutral' | 'warn' | 'error' }) {
  if (value <= 0) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        tone === 'error' && 'bg-red-100 text-red-800',
        tone === 'warn' && 'bg-amber-100 text-amber-800',
        !tone && 'bg-slate-100 text-slate-700',
      )}
    >
      {value} {label}
    </span>
  );
}

export function ImportSectionAccordion({
  step,
  label,
  stats,
  defaultOpen = false,
  children,
}: ImportSectionAccordionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const hasIssues = stats.failed > 0 || (stats.conflicts ?? 0) > 0;

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border bg-white transition-shadow',
        hasIssues ? 'border-amber-200/80' : 'border-slate-200/80',
        open && 'shadow-sm',
      )}
    >
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50/80 sm:px-5"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
          {step}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-900">{label}</span>
            <span className="text-xs text-slate-500">{stats.pasted} rows</span>
            {stats.failed === 0 && (stats.conflicts ?? 0) === 0 ? (
              <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                Ready
              </span>
            ) : null}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <CountBadge label="create" value={stats.created} />
            <CountBadge label="update" value={stats.updated} />
            {stats.skipped != null ? <CountBadge label="skip" value={stats.skipped} /> : null}
            <CountBadge label="warn" value={stats.warnings ?? 0} tone="warn" />
            <CountBadge label="conflict" value={stats.conflicts ?? 0} tone="warn" />
            <CountBadge label="fail" value={stats.failed} tone="error" />
          </div>
        </div>
        <svg
          className={cn('h-5 w-5 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? <div className="border-t border-slate-100 px-2 py-3 sm:px-4">{children}</div> : null}
    </div>
  );
}
