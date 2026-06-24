import { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface TableProps extends HTMLAttributes<HTMLTableElement> {
  /** Right-align last column for action buttons */
  hasActions?: boolean;
  /** Fixed column widths — use with colgroup; prevents horizontal overflow */
  layoutFixed?: boolean;
  /** Hide horizontal scrollbar (content truncates instead) */
  noHorizontalScroll?: boolean;
  /** Tighter cell padding and text size */
  compact?: boolean;
}

export function Table({
  className,
  children,
  hasActions,
  layoutFixed,
  noHorizontalScroll,
  compact,
  ...props
}: TableProps) {
  return (
    <div
      className={cn(
        'table-container',
        hasActions && 'table-has-actions',
        layoutFixed && 'table-layout-fixed-wrap',
        noHorizontalScroll && 'table-no-x-scroll',
        compact && 'table-compact',
      )}
    >
      <table className={cn('data-table', layoutFixed && 'table-layout-fixed', className)} {...props}>
        {children}
      </table>
    </div>
  );
}

export function Th({ className, children, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={cn(className)} {...props}>
      {children}
    </th>
  );
}

export function ThActions({ className, children = 'Actions', ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={cn('min-w-[8.5rem]', className)} {...props}>
      {children}
    </th>
  );
}

export function Td({ className, children, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn(className)} {...props}>
      {children}
    </td>
  );
}

export function TdMuted({ className, children, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('text-slate-500', className)} {...props}>
      {children ?? <span className="text-slate-300">—</span>}
    </td>
  );
}
