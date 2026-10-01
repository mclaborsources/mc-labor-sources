import { ButtonHTMLAttributes, forwardRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { IconSpinner, resolveButtonIcon, type ButtonIconName } from './icons';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | 'primary'
    | 'secondary'
    | 'outline'
    | 'danger'
    | 'ghost'
    | 'soft'
    | 'softPrimary'
    | 'softDanger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  loadingText?: string;
  icon?: ButtonIconName | ReactNode;
  iconRight?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      loading,
      loadingText = 'Loading…',
      disabled,
      children,
      icon,
      iconRight = false,
      ...props
    },
    ref,
  ) => {
    const variants = {
      primary:
        'rounded-xl border border-white/15 bg-gradient-to-br from-primary via-primary-dark to-primary-darker font-semibold text-white shadow-md shadow-primary/25 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/35 active:translate-y-0 active:shadow-md normal-case tracking-normal',
      secondary:
        'rounded-xl border border-slate-200/90 bg-white font-medium text-slate-700 shadow-sm transition-all duration-200 hover:border-slate-300 hover:bg-slate-50 hover:shadow-md normal-case tracking-normal',
      outline:
        'rounded-xl border border-slate-300 bg-transparent font-medium text-slate-800 transition-all duration-200 hover:border-primary/40 hover:bg-primary/5 normal-case tracking-normal',
      danger:
        'rounded-xl border border-red-500/20 bg-gradient-to-br from-red-500 to-red-600 font-semibold text-white shadow-md shadow-red-500/20 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-red-500/30 active:translate-y-0 normal-case tracking-normal',
      ghost:
        'rounded-xl bg-transparent font-medium text-primary transition-all duration-200 hover:bg-primary/8 normal-case tracking-normal',
      soft: 'rounded-xl border border-slate-200/90 bg-slate-50 font-semibold text-slate-700 shadow-sm transition-all duration-200 hover:border-slate-300 hover:bg-slate-100 hover:shadow-md normal-case tracking-normal',
      softPrimary:
        'rounded-xl border border-primary/20 bg-gradient-to-br from-primary/8 to-primary/5 font-semibold text-primary shadow-sm transition-all duration-200 hover:border-primary/35 hover:from-primary/12 hover:to-primary/8 hover:shadow-md normal-case tracking-normal',
      softDanger:
        'rounded-xl border border-red-200/90 bg-gradient-to-br from-red-50 to-red-50/50 font-semibold text-red-700 shadow-sm transition-all duration-200 hover:border-red-300 hover:from-red-100 hover:to-red-50 hover:shadow-md normal-case tracking-normal',
    };

    const sizes = {
      sm: 'gap-1.5 px-3 py-1.5 text-xs',
      md: 'gap-2 px-4 py-2.5 text-sm',
      lg: 'gap-2.5 px-6 py-3 text-base',
    };

    const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
    const iconNode = loading ? (
      <IconSpinner className={cn(iconSize, 'animate-spin')} />
    ) : (
      resolveButtonIcon(icon, iconSize)
    );

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex shrink-0 items-center justify-center focus:outline-none focus:ring-[3px] focus:ring-primary/20 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-md',
          variants[variant],
          sizes[size],
          className,
        )}
        disabled={disabled || loading}
        {...props}
      >
        {iconNode && !iconRight ? iconNode : null}
        {children ? <span>{loading && !icon ? loadingText : children}</span> : null}
        {iconNode && iconRight ? iconNode : null}
      </button>
    );
  },
);
Button.displayName = 'Button';
