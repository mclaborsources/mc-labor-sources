'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { formControlClassName } from '@/components/ui/formStyles';
import { cn } from '@/lib/utils';
import { parsePastedTable } from './paste-utils';

interface PasteImportPanelProps {
  label?: string;
  placeholder?: string;
  helpText?: string;
  onParse: (text: string) => void;
  disabled?: boolean;
}

export function PasteImportPanel({
  label = 'Paste rows from master system',
  placeholder = 'Paste tab- or comma-separated rows copied from Excel/CSV (include header row)...',
  helpText,
  onParse,
  disabled,
}: PasteImportPanelProps) {
  const [text, setText] = useState('');
  const [rowCount, setRowCount] = useState<number | null>(null);

  const handleParse = () => {
    const { rows } = parsePastedTable(text);
    setRowCount(rows.length);
    onParse(text);
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-semibold text-slate-800">{label}</label>
      {helpText ? <p className="text-sm leading-relaxed text-slate-600">{helpText}</p> : null}
      <textarea
        className={cn(formControlClassName, 'min-h-[160px] font-mono text-sm')}
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setRowCount(null);
        }}
        disabled={disabled}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="softPrimary" onClick={handleParse} disabled={disabled || !text.trim()}>
          Parse &amp; Preview
        </Button>
        {rowCount !== null ? (
          <span className="text-sm text-slate-600">
            {rowCount} row{rowCount === 1 ? '' : 's'} detected
          </span>
        ) : null}
      </div>
    </div>
  );
}
