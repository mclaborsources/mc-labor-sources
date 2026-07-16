import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface BrandPageTitleProps {
  title: string;
  titleAddon?: ReactNode;
  description?: string;
  action?: ReactNode;
  align?: 'center' | 'left';
  compact?: boolean;
}

export function BrandPageTitle({
  title,
  titleAddon,
  description,
  action,
  align = 'left',
  compact = false,
}: BrandPageTitleProps) {
  const isLeft = align === 'left';

  return (
    <div className={cn(compact ? 'mb-3' : 'mb-8', isLeft ? 'text-left' : 'text-center')}>
      <div
        className={cn(
          'relative flex flex-col',
          compact ? 'gap-2' : 'gap-4',
          isLeft
            ? 'sm:flex-row sm:items-start sm:justify-between'
            : 'items-center sm:flex-row sm:justify-center',
        )}
      >
        <div className={isLeft ? 'text-left' : 'text-center'}>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className={cn('brand-page-title', isLeft ? 'brand-page-title-left' : 'inline-block')}>
              {title}
            </h1>
            {titleAddon}
          </div>
          {description && (
            <p className={cn(compact ? 'mt-1 text-sm text-gray-500' : 'mt-3 text-base leading-relaxed text-gray-500', isLeft && 'max-w-2xl')}>
              {description}
            </p>
          )}
        </div>
        {action && <div className={isLeft ? 'shrink-0' : 'sm:absolute sm:right-0'}>{action}</div>}
      </div>
    </div>
  );
}
