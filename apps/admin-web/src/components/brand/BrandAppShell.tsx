'use client';

import type { ReactNode } from 'react';
import type { AuthUser } from '@/lib/api-client';
import type { NavItem } from '@/lib/navigation-types';
import { cn } from '@/lib/utils';
import { BrandHeader } from './BrandHeader';

interface BrandAppShellProps {
  children: ReactNode;
  navItems: NavItem[];
  user?: AuthUser | null;
  heroTitle?: string;
  heroImage?: string;
  showHero?: boolean;
  showNav?: boolean;
  contentClassName?: string;
  headerAction?: ReactNode;
}

export function BrandAppShell({
  children,
  navItems,
  user,
  showNav = true,
  contentClassName,
  headerAction,
}: BrandAppShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-[#eef3f8]">
      <BrandHeader
        navItems={navItems}
        user={user}
        showNav={showNav}
        headerAction={headerAction}
      />
      <main
        className={cn(
          'flex-1',
          contentClassName ?? 'brand-container py-5',
        )}
      >
        {children}
      </main>
    </div>
  );
}
