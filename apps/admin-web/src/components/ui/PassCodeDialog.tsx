'use client';

import { useEffect, useRef, type FormEvent } from 'react';

export const DESTRUCTIVE_ACTION_PASS_CODE = '3360';

interface PassCodeDialogProps {
  open: boolean;
  value: string;
  error: string;
  pending: boolean;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent) => void;
}

export function PassCodeDialog({
  open,
  value,
  error,
  pending,
  onChange,
  onCancel,
  onSubmit,
}: PassCodeDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    inputRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, pending, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/20 p-4">
      <form
        className="w-full max-w-[410px] border border-[#8f8f8f] bg-[#f4f4f4] font-[Arial,sans-serif] text-[14px] text-black shadow-[3px_4px_0_rgba(0,0,0,0.22)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pass-code-title"
        onSubmit={onSubmit}
      >
        <div className="flex h-[40px] items-center justify-between bg-[#ededed] px-3 text-[#6f6f6f]">
          <span id="pass-code-title">Requires Pass Code</span>
          <button
            type="button"
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center text-[25px] font-light leading-none text-[#777] hover:bg-[#d8d8d8]"
            onClick={onCancel}
            disabled={pending}
          >
            &times;
          </button>
        </div>

        <div className="grid min-h-[138px] grid-cols-[1fr_74px] grid-rows-[auto_1fr_auto] gap-x-4 px-3 pb-3 pt-3">
          <label htmlFor="destructive-action-pass-code" className="self-start pt-1.5">
            Enter the pass code:
          </label>
          <div className="row-span-2 flex flex-col gap-2">
            <button
              type="submit"
              className="h-[30px] border border-[#9d9d9d] bg-[#e9e9e9] px-3 text-[14px] shadow-[inset_1px_1px_0_white] hover:bg-[#dedede] disabled:text-[#888]"
              disabled={pending || !value.trim()}
            >
              {pending ? 'Wait...' : 'OK'}
            </button>
            <button
              type="button"
              className="h-[30px] border border-[#9d9d9d] bg-[#e9e9e9] px-3 text-[14px] shadow-[inset_1px_1px_0_white] hover:bg-[#dedede] disabled:text-[#888]"
              onClick={onCancel}
              disabled={pending}
            >
              Cancel
            </button>
          </div>
          {error ? <p className="col-start-1 self-end pb-1 text-[13px] text-red-700">{error}</p> : null}
          <input
            ref={inputRef}
            id="destructive-action-pass-code"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            disabled={pending}
            className="col-span-2 h-[30px] w-full border border-[#8b8b8b] bg-white px-2 font-mono text-[15px] outline-none focus:border-[#3b6ea5]"
          />
        </div>
      </form>
    </div>
  );
}
