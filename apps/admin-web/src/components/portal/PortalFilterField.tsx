import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PortalFilterFieldProps {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}

export function PortalFilterField({ label, hint, children, className }: PortalFilterFieldProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="space-y-0.5">
        <span className="block text-sm font-medium text-slate-700">{label}</span>
        {hint ? <span className="block text-xs leading-relaxed text-slate-500">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}
