'use client';

import { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface ImportFileDropzoneProps {
  onFile: (file: File) => void;
  disabled?: boolean;
  fileName?: string | null;
  accept?: string;
}

export function ImportFileDropzone({
  onFile,
  disabled,
  fileName,
  accept = '.xlsx,.xls',
}: ImportFileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  return (
    <div
      className={cn(
        'relative rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-200',
        dragOver && !disabled
          ? 'border-primary/50 bg-primary/5'
          : 'border-slate-200 bg-gradient-to-br from-slate-50/50 to-white',
        disabled && 'cursor-not-allowed opacity-60',
        !disabled && 'cursor-pointer hover:border-primary/30 hover:bg-primary/[0.02]',
      )}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (!disabled) handleFiles(e.dataTransfer.files);
      }}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      role="button"
      tabIndex={disabled ? -1 : 0}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 16V4M12 4l4 4M12 4L8 8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" />
        </svg>
      </div>
      {fileName ? (
        <>
          <p className="text-sm font-semibold text-slate-800">{fileName}</p>
          <p className="mt-1 text-xs text-slate-500">Click or drop to replace file</p>
        </>
      ) : (
        <>
          <p className="text-sm font-semibold text-slate-800">Drop your workbook here</p>
          <p className="mt-1 text-xs text-slate-500">or click to browse · .xlsx with Employees, Customers, Jobs, Assignments</p>
        </>
      )}
    </div>
  );
}
