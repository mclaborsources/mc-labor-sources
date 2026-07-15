import type { ReactNode } from 'react';
import { formControlClassName } from '@/components/ui/formStyles';

export const portalFieldClassName = formControlClassName;

/** Use on inputs inside modals and forms for consistent portal styling */
export const portalFormFieldClassName = portalFieldClassName;

interface PortalFilterPanelProps {
  children: ReactNode;
  title?: string;
}

export function PortalFilterPanel({ children, title = 'Filters' }: PortalFilterPanelProps) {
  return (
    <div className="relative z-20 mb-6 overflow-visible rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm ring-1 ring-slate-100/80 sm:p-6">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/10">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round" />
          </svg>
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="text-xs text-slate-500">Refine what you see below</p>
        </div>
      </div>
      {children}
    </div>
  );
}

interface PortalSummaryStatProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  accent?: 'primary' | 'green' | 'slate' | 'amber';
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
}: PortalSummaryStatProps) {
  return (
    <article className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-slate-800">{value}</p>
        </div>
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${accentStyles[accent]}`}
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
}

export function PortalRecordsPanel({
  title,
  description,
  count,
  countLabel = 'records',
  children,
}: PortalRecordsPanelProps) {
  return (
    <article className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm ring-1 ring-gray-100/80">
      <header className="flex flex-col gap-3 border-b border-gray-100 bg-gradient-to-r from-white to-slate-50/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <h2 className="brand-section-title text-lg">{title}</h2>
          {description && <p className="mt-1 text-sm leading-relaxed text-gray-500">{description}</p>}
        </div>
        {count !== undefined && (
          <span className="inline-flex w-fit rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
            {count} {count === 1 ? countLabel.replace(/s$/, '') : countLabel}
          </span>
        )}
      </header>
      <div className="dashboard-table px-1 py-2 sm:px-2 sm:py-3">{children}</div>
    </article>
  );
}
