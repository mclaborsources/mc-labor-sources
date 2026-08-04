'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { BrandAppShell } from '@/components/brand';
import { supervisorNavItems, BRAND_HERO_IMAGES } from '@/lib/navigation';
import { getCurrentUser } from '@/lib/auth';
import type { AuthUser } from '@/lib/api-client';
import { LoadingState } from '../ui/LoadingState';

interface SupervisorLayoutProps {
  children: ReactNode;
  heroTitle?: string;
  heroImage?: string;
  showHero?: boolean;
  contentClassName?: string;
}

export function SupervisorLayout({
  children,
  heroTitle = 'Supervisor Portal',
  heroImage = BRAND_HERO_IMAGES.inner,
  showHero = true,
  contentClassName,
}: SupervisorLayoutProps) {
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
      if (u.role !== 'SUPERVISOR' && u.role !== 'SUPER_ADMIN' && u.role !== 'ADMIN') {
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
      navItems={supervisorNavItems}
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
