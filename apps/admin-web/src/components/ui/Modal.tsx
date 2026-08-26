'use client';

import { ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { Button } from './Button';
import { BUTTON_ICONS, resolveButtonIcon, type ButtonIconName } from './icons';

type ModalTone = 'primary' | 'success' | 'danger' | 'neutral';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  icon?: ButtonIconName | ReactNode;
  tone?: ModalTone;
  fullScreen?: boolean;
  headerCloseLabel?: string;
  headerLeadingActions?: ReactNode;
  headerActions?: ReactNode;
  headerActionsBelow?: boolean;
  hideHeaderClose?: boolean;
  contentClassName?: string;
}

const toneStyles: Record<ModalTone, string> = {
  primary: 'bg-primary/10 text-primary ring-primary/20',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
  neutral: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  size = 'md',
  icon = 'edit',
  tone = 'primary',
  fullScreen = false,
  headerCloseLabel,
  headerLeadingActions,
  headerActions,
  headerActionsBelow = false,
  hideHeaderClose = false,
  contentClassName,
}: ModalProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-6xl',
    '2xl': 'max-w-[min(98vw,100rem)]',
  };

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-[100] flex items-center justify-center',
        fullScreen ? 'p-2' : 'p-4 sm:p-6',
      )}
    >
      <div
        className="absolute inset-0 bg-slate-900/55 backdrop-blur-md transition-opacity"
        onClick={onClose}
        aria-hidden
      />
      <div
        className={cn(
          'modal-panel relative flex w-full flex-col overflow-hidden border border-white/60 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.22)] ring-1 ring-slate-900/5',
          fullScreen
            ? 'h-[calc(100dvh-1rem)] max-h-none max-w-none rounded-xl'
            : size === '2xl'
              ? 'h-[min(94vh,58rem)] max-h-[94vh] rounded-2xl'
              : 'max-h-[min(90vh,760px)] rounded-2xl',
          !fullScreen && sizes[size],
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="h-1 shrink-0 bg-gradient-to-r from-primary via-indigo-500 to-primary" />
        <div className={cn('flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 bg-gradient-to-br from-slate-50 via-white to-blue-50/40', fullScreen ? 'px-4 py-3' : 'px-6 py-5')}>
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <span
              className={cn(
                'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1',
                toneStyles[tone],
              )}
            >
              {resolveButtonIcon(icon, 'h-5 w-5')}
            </span>
            <div className="min-w-0">
              <h2 id="modal-title" className="text-lg font-bold tracking-tight text-slate-900">
                {title}
              </h2>
              {subtitle ? (
                <p className="mt-1 text-sm leading-relaxed text-slate-500">{subtitle}</p>
              ) : null}
            </div>
            {!headerActionsBelow && headerLeadingActions ? <div className="flex flex-wrap items-center gap-2">{headerLeadingActions}</div> : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {!headerActionsBelow ? headerActions : null}
            {!hideHeaderClose ? <Button
              type="button"
              variant={headerCloseLabel ? 'secondary' : 'ghost'}
              size={headerCloseLabel ? 'md' : 'sm'}
              icon="close"
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 text-slate-400 hover:text-slate-700"
            >
              {headerCloseLabel}
            </Button> : null}
          </div>
        </div>
        {headerActionsBelow && (headerLeadingActions || headerActions) ? (
          <div className={cn('flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-white', fullScreen ? 'px-4 py-2' : 'px-6 py-3')}>
            <div className="ml-3 flex flex-wrap items-center gap-2">{headerLeadingActions}</div>
            <div className="flex flex-wrap items-center justify-end gap-2">{headerActions}</div>
          </div>
        ) : null}
        <div className={cn('min-h-0 flex-1 overflow-y-auto', fullScreen ? 'px-4 py-3' : 'px-6 py-5', contentClassName)}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}

interface ModalFooterProps {
  children: ReactNode;
  className?: string;
}

export function ModalFooter({ children, className }: ModalFooterProps) {
  return (
    <div
      className={cn(
        '-mx-6 -mb-5 mt-6 border-t border-slate-200/80 bg-gradient-to-t from-slate-50/90 to-white px-6 py-4',
        className,
      )}
    >
      <div className="flex flex-wrap justify-end gap-2">{children}</div>
    </div>
  );
}

export { BUTTON_ICONS };
