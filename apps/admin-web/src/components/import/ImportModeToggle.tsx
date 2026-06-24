'use client';

import { cn } from '@/lib/utils';

export type ImportMode = 'workbook' | 'paste';

interface ImportModeToggleProps {
  value: ImportMode;
  onChange: (mode: ImportMode) => void;
}

const OPTIONS: { id: ImportMode; label: string; description: string }[] = [
  { id: 'workbook', label: 'Weekly Workbook', description: 'Upload one .xlsx with four sheets' },
  { id: 'paste', label: 'Single-Sheet Paste', description: 'Copy/paste one entity at a time' },
];

export function ImportModeToggle({ value, onChange }: ImportModeToggleProps) {
  return (
    <div className="inline-flex rounded-xl border border-slate-200/90 bg-slate-100/80 p-1 shadow-inner">
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={cn(
            'rounded-lg px-4 py-2.5 text-left transition-all duration-200 sm:min-w-[180px]',
            value === option.id
              ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80'
              : 'text-slate-600 hover:text-slate-900',
          )}
        >
          <span className="block text-sm font-semibold">{option.label}</span>
          <span className="mt-0.5 hidden text-xs text-slate-500 sm:block">{option.description}</span>
        </button>
      ))}
    </div>
  );
}
