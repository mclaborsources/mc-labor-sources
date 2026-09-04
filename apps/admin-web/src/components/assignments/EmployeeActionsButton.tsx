'use client';

import { useEffect, useRef, useState } from 'react';
import type { Employee } from '@/lib/domain-types';
import { EMPLOYEE_ACTION_COLORS, employeeActionFlags } from '@/lib/employee-action-status';
import { useEmployeeWeekPreview } from '@/lib/use-employee-week-preview';

export function EmployeeActionsButton({ employee, account, portalKnown, onClick }: {
  employee: Employee; account?: { status: string }; portalKnown: boolean; onClick: () => void;
}) {
  const element = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!element.current) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '100px' });
    observer.observe(element.current);
    return () => observer.disconnect();
  }, []);
  const preview = useEmployeeWeekPreview(employee.id, visible);
  const flags = employeeActionFlags(employee, account, portalKnown, preview.statusKnown ? preview.nextWeekEnabled : undefined);
  const color = EMPLOYEE_ACTION_COLORS.find(option => option.value === employee.actionButtonColor) ?? EMPLOYEE_ACTION_COLORS[0];
  const description = flags.map(flag => `${flag.label}: ${flag.enabled === undefined ? 'checking / unavailable' : flag.enabled ? 'enabled' : 'disabled'}`).join('; ');
  return <button ref={element} type="button" onClick={onClick}
    title={description} aria-label={`Actions for ${employee.firstName} ${employee.lastName}. ${description}`}
    style={{ backgroundColor: color.background, borderColor: color.border }}
    className="inline-flex h-7 w-full min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-md border px-1 text-[10px] leading-none shadow-sm transition hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
    {flags.map(flag => <span key={flag.code} title={`${flag.label}: ${flag.enabled === undefined ? 'checking / unavailable' : flag.enabled ? 'enabled' : 'disabled'}`}
      className={flag.enabled ? 'font-black text-black' : 'font-semibold text-white'}>{flag.code}</span>)}
  </button>;
}
