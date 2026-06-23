'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
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
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      {helpText ? <p className="text-sm text-gray-500">{helpText}</p> : null}
      <textarea
        className="w-full min-h-[160px] rounded-md border border-gray-300 px-3 py-2 text-sm font-mono shadow-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setRowCount(null);
        }}
        disabled={disabled}
      />
      <div className="flex items-center gap-3">
        <Button type="button" onClick={handleParse} disabled={disabled || !text.trim()}>
          Parse &amp; Preview
        </Button>
        {rowCount !== null ? (
          <span className="text-sm text-gray-600">{rowCount} row{rowCount === 1 ? '' : 's'} detected</span>
        ) : null}
      </div>
    </div>
  );
}
