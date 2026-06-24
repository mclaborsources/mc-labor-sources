'use client';

export function ImportHelpBanner() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50 via-white to-blue-50/40 p-4 shadow-sm ring-1 ring-slate-900/[0.03] sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="space-y-1 text-sm text-slate-600">
        <p>
          Import order:{' '}
          <span className="font-medium text-slate-800">Employees → Customers → Jobs → Assignments</span>
        </p>
        <p className="text-slate-500">
          Preferred format:{' '}
          <code className="rounded bg-white/80 px-1.5 py-0.5 text-xs text-slate-700">
            docs/2026-06-19 Sample Imports.xlsx
          </code>{' '}
          (week ending 06/19/2026). Employee Status optional; assignment conflicts use the selected working week.
        </p>
      </div>
      <span className="inline-flex w-fit shrink-0 items-center rounded-full border border-amber-200/90 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-800">
        Staging only
      </span>
    </div>
  );
}
