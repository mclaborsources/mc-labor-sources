import type { ReactNode } from 'react';
import { formControlClassName } from '@/components/ui/formStyles';
import { cn } from '@/lib/utils';

export const portalFieldClassName = formControlClassName;

/** Use on inputs inside modals and forms for consistent portal styling */
export const portalFormFieldClassName = portalFieldClassName;

interface PortalFilterPanelProps {
  children: ReactNode;
  title?: string;
  compact?: boolean;
  showHeader?: boolean;
}

export function PortalFilterPanel({ children, title = 'Filters', compact = false, showHeader = true }: PortalFilterPanelProps) {
  return (
    <div className={cn('relative z-20 overflow-visible rounded-2xl border border-slate-200/70 bg-white shadow-sm ring-1 ring-slate-100/80', compact ? 'mb-2 p-2.5 sm:p-3' : 'mb-6 p-5 sm:p-6')}>
      {showHeader && <div className={cn('flex items-center gap-3', compact ? 'mb-2' : 'mb-5')}>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/10">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round" />
          </svg>
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="text-xs text-slate-500">Refine what you see below</p>
        </div>
      </div>}
      {children}
    </div>
  );
}

interface PortalSummaryStatProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  accent?: 'primary' | 'green' | 'slate' | 'amber';
  compact?: boolean;
}

const accentStyles = {
  primary: 'bg-primary/10 text-primary',
  green: 'bg-emerald-50 text-emerald-700',
  slate: 'bg-slate-100 text-slate-700',
  amber: 'bg-amber-50 text-amber-700',
};

export function PortalSummaryStat({
  label,
  value,
  icon,
  accent = 'primary',
  compact = false,
}: PortalSummaryStatProps) {
  return (
    <article className={cn('border border-gray-100 bg-white shadow-sm', compact ? 'rounded-lg p-2' : 'rounded-2xl p-4')}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className={cn('font-medium text-gray-500', compact ? 'text-[10px]' : 'text-sm')}>{label}</p>
          <p className={cn('font-bold tracking-tight text-slate-800', compact ? 'text-base leading-tight' : 'mt-1 text-2xl')}>{value}</p>
        </div>
        <div
          className={cn('flex shrink-0 items-center justify-center rounded-xl', compact ? 'h-7 w-7' : 'h-11 w-11', accentStyles[accent])}
        >
          {icon}
        </div>
      </div>
    </article>
  );
}

interface PortalRecordsPanelProps {
  title: string;
  description?: string;
  count?: number;
  countLabel?: string;
  children: ReactNode;
  showHeader?: boolean;
}

export function PortalRecordsPanel({
  title,
  description,
  count,
  countLabel = 'records',
  children,
  showHeader = true,
}: PortalRecordsPanelProps) {
  return (
    <article className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm ring-1 ring-gray-100/80">
      {showHeader && <header className="flex flex-col gap-3 border-b border-gray-100 bg-gradient-to-r from-white to-slate-50/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <h2 className="brand-section-title text-lg">{title}</h2>
          {description && <p className="mt-1 text-sm leading-relaxed text-gray-500">{description}</p>}
        </div>
        {count !== undefined && (
          <span className="inline-flex w-fit rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
            {count} {count === 1 ? countLabel.replace(/s$/, '') : countLabel}
          </span>
        )}
      </header>}
      <div className={cn('dashboard-table', showHeader ? 'px-1 py-2 sm:px-2 sm:py-3' : 'p-0')}>{children}</div>
    </article>
  );
}
