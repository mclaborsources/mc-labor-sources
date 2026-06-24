import { cn } from '@/lib/utils';

interface DateTimeCellProps {
  value?: string | null;
}

export function DateCell({ value }: DateTimeCellProps) {
  if (!value) {
    return <span className="text-gray-400">—</span>;
  }

  const date = new Date(value.includes('T') ? value : `${value}T12:00:00`);

  return (
    <span className="inline-flex rounded-lg bg-slate-100 px-2.5 py-1 text-sm font-medium text-slate-700">
      {date.toLocaleDateString()}
    </span>
  );
}

export function DateTimeCell({ value }: DateTimeCellProps) {
  if (!value) {
    return <span className="text-gray-400">—</span>;
  }

  const date = new Date(value);

  return (
    <div className="leading-tight">
      <div className="font-medium text-slate-800">{date.toLocaleDateString()}</div>
      <div className="text-xs text-gray-500">{date.toLocaleTimeString()}</div>
    </div>
  );
}

interface PersonCellProps {
  name: string;
  compact?: boolean;
}

export function PersonCell({ name, compact = false }: PersonCellProps) {
  if (name === '—') {
    return <span className="text-gray-400">—</span>;
  }

  const initial = name.trim().charAt(0).toUpperCase() || '?';

  if (compact) {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
          {initial}
        </span>
        <span className="truncate text-sm font-medium text-slate-800" title={name}>
          {name}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
        {initial}
      </span>
      <span className="font-medium text-slate-800">{name}</span>
    </div>
  );
}

interface YesNoCellProps {
  value: boolean;
}

export function YesNoCell({ value }: YesNoCellProps) {
  return (
    <span
      className={
        value
          ? 'inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700'
          : 'inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600'
      }
    >
      {value ? 'Yes' : 'No'}
    </span>
  );
}

interface HoursCellProps {
  value?: string | number | null;
}

export function HoursCell({ value }: HoursCellProps) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-gray-400">—</span>;
  }

  return (
    <span className="inline-flex rounded-lg bg-slate-100 px-2.5 py-1 text-sm font-semibold text-slate-700">
      {value}h
    </span>
  );
}

interface TitleCellProps {
  title: string;
  subtitle?: string | null;
}

export function TitleCell({ title, subtitle }: TitleCellProps) {
  return (
    <div className="min-w-0 leading-tight">
      <div className="truncate font-semibold text-slate-800" title={title}>
        {title}
      </div>
      {subtitle && (
        <div className="mt-0.5 truncate text-xs text-gray-500" title={subtitle}>
          {subtitle}
        </div>
      )}
    </div>
  );
}

interface TruncateCellProps {
  value?: string | null;
  className?: string;
}

export function TruncateCell({ value, className }: TruncateCellProps) {
  const text = value?.trim();
  if (!text) {
    return <span className="text-gray-400">—</span>;
  }

  return (
    <span className={cn('block truncate', className)} title={text}>
      {text}
    </span>
  );
}

interface LinkCellProps {
  href: string;
  label?: string;
}

export function LinkCell({ href, label = 'Download' }: LinkCellProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg bg-primary/5 px-2.5 py-1 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
    >
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 3v12M8 11l4 4 4-4M5 21h14" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </a>
  );
}

interface ActionCellProps {
  children: React.ReactNode;
}

export function ActionCell({ children }: ActionCellProps) {
  return <div className="portal-action-cell">{children}</div>;
}
