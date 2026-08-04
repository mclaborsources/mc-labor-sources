'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { BrandAppShell } from '@/components/brand';
import { customerNavItems, BRAND_HERO_IMAGES } from '@/lib/navigation';
import { getCurrentUser, isCustomerRole } from '@/lib/auth';
import type { AuthUser } from '@/lib/api-client';
import { LoadingState } from '../ui/LoadingState';

interface CustomerLayoutProps {
  children: ReactNode;
  heroTitle?: string;
  heroImage?: string;
  showHero?: boolean;
  contentClassName?: string;
}

export function CustomerLayout({
  children,
  heroTitle = 'Customer Portal',
  heroImage = BRAND_HERO_IMAGES.default,
  showHero = true,
  contentClassName,
}: CustomerLayoutProps) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function load() {
      const u = await getCurrentUser();
      if (!u) {
        router.replace('/login');
        return;
      }
      if (!isCustomerRole(u.role)) {
        router.replace('/login');
        return;
      }
      setUser(u);
      setReady(true);
    }
    load();
  }, [router]);

  if (!ready) return <LoadingState />;

  return (
    <BrandAppShell
      navItems={customerNavItems}
      user={user}
      heroTitle={heroTitle}
      heroImage={heroImage}
      showHero={showHero}
      contentClassName={contentClassName}
    >
      {children}
    </BrandAppShell>
  );
}
