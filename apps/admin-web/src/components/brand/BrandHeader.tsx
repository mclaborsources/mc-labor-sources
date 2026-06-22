'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BRAND_PHONE, BRAND_PHONE_HREF } from '@mc-labor/shared';
import { logout } from '@/lib/auth';
import type { AuthUser } from '@/lib/api-client';
import type { NavItem } from '@/lib/navigation-types';
import { isNavGroupActive, isNavLinkActive } from '@/lib/navigation-types';
import { cn } from '@/lib/utils';
import { BrandLogo } from './BrandLogo';
import { PhoneIcon } from './PhoneIcon';

interface BrandHeaderProps {
  navItems: NavItem[];
  portalHome: string;
  user?: AuthUser | null;
  showNav?: boolean;
}

function ChevronDownIcon({ className, open }: { className?: string; open?: boolean }) {
  return (
    <svg
      className={cn('h-4 w-4 text-slate-400 transition-transform duration-200', open && 'rotate-180', className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}

function UserProfileMenu({ user }: { user: AuthUser }) {
  const [open, setOpen] = useState(false);
  const initial = user.name?.charAt(0)?.toUpperCase() || 'U';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          'group flex items-center gap-2.5 rounded-xl border border-slate-200/90 bg-white py-1.5 pl-1.5 pr-2.5 shadow-sm transition-all duration-200 hover:border-primary/25 hover:shadow-md focus:outline-none focus:ring-[3px] focus:ring-primary/15 sm:pr-3',
          open && 'border-primary/30 shadow-md ring-[3px] ring-primary/10',
        )}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary via-primary-dark to-primary-darker text-sm font-bold text-white shadow-sm ring-2 ring-white">
          {initial}
        </span>
        <span className="hidden max-w-[140px] truncate text-sm font-semibold text-slate-700 group-hover:text-slate-900 lg:block">
          {user.name}
        </span>
        <ChevronDownIcon open={open} className="hidden lg:block" />
      </button>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-slate-900/10 backdrop-blur-[1px]"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            className="modal-panel absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_16px_48px_rgba(15,23,42,0.14)] ring-1 ring-slate-900/5"
            role="menu"
          >
            <div className="h-1 bg-gradient-to-r from-primary via-indigo-500 to-primary" />
            <div className="border-b border-slate-100 bg-gradient-to-br from-slate-50 via-white to-blue-50/40 px-4 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-primary-dark to-primary-darker text-base font-bold text-white shadow-md ring-2 ring-white">
                  {initial}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">{user.name}</p>
                  <p className="truncate text-xs text-slate-500">{user.email}</p>
                </div>
              </div>
            </div>
            <div className="p-2">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  logout();
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-red-600 transition-all duration-150 hover:bg-gradient-to-r hover:from-red-50 hover:to-red-50/50 hover:shadow-sm"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600 ring-1 ring-red-100">
                  <LogoutIcon className="h-4 w-4" />
                </span>
                Logout
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function NavDropdown({ item, pathname, onNavigate }: { item: NavItem; pathname: string; onNavigate?: () => void }) {
  const [open, setOpen] = useState(false);
  const active = isNavGroupActive(item, pathname);

  if (!item.children?.length) return null;

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className={cn('brand-nav-link inline-flex items-center gap-1 py-2 text-[13px] xl:text-sm', active && 'brand-nav-link-active')}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {item.label}
        <span className="text-[10px] leading-none" aria-hidden="true">
          ▼
        </span>
      </button>
      {open && (
        <ul className="absolute left-0 top-full z-50 min-w-[220px] border border-primary bg-primary py-1 shadow-lg">
          {item.children.map((child) => (
            <li key={child.href}>
              <Link
                href={child.href}
                onClick={() => {
                  setOpen(false);
                  onNavigate?.();
                }}
                className={cn(
                  'brand-nav-dropdown-link block px-5 py-2.5 text-left text-base uppercase tracking-wide text-white hover:bg-primary-darker',
                  isNavLinkActive(child.href, pathname) && 'bg-primary-darker',
                )}
              >
                {child.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MobileNavSection({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate: () => void;
}) {
  const [expanded, setExpanded] = useState(isNavGroupActive(item, pathname));

  if (item.href) {
    return (
      <Link
        href={item.href}
        onClick={onNavigate}
        className={cn(
          'brand-nav-link block py-2.5 text-base',
          isNavLinkActive(item.href, pathname) && 'brand-nav-link-active',
        )}
      >
        {item.label}
      </Link>
    );
  }

  return (
    <div className="border-b border-gray-100 py-1">
      <button
        type="button"
        className={cn(
          'brand-nav-link flex w-full items-center justify-between py-2.5 text-base',
          isNavGroupActive(item, pathname) && 'brand-nav-link-active',
        )}
        onClick={() => setExpanded(!expanded)}
      >
        {item.label}
        <span className="text-xs">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && item.children && (
        <ul className="mb-2 ml-3 space-y-1 border-l-2 border-primary/30 pl-3">
          {item.children.map((child) => (
            <li key={child.href}>
              <Link
                href={child.href}
                onClick={onNavigate}
                className={cn(
                  'brand-nav-link block py-2 text-base normal-case',
                  isNavLinkActive(child.href, pathname) && 'brand-nav-link-active',
                )}
              >
                {child.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function BrandHeader({ navItems, portalHome, user, showNav = true }: BrandHeaderProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeMobile = () => setMobileOpen(false);

  return (
    <header id="header" className="border-b border-gray-200 bg-white py-2.5">
      <div className="brand-container">
        <div className="flex items-center justify-between gap-3 lg:gap-4">
          <div className="shrink-0">
            <BrandLogo href={portalHome} priority className="w-[160px] sm:w-[200px] lg:w-[220px] xl:w-[260px]" />
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-3 lg:gap-4">
            {showNav && (
              <nav className="hidden min-w-0 items-center gap-2 lg:flex xl:gap-3">
                {navItems.map((item) =>
                  item.children ? (
                    <NavDropdown key={item.label} item={item} pathname={pathname} />
                  ) : (
                    <Link
                      key={item.href}
                      href={item.href!}
                      className={cn(
                        'brand-nav-link whitespace-nowrap py-2 text-[13px] xl:text-sm',
                        isNavLinkActive(item.href!, pathname) && 'brand-nav-link-active',
                      )}
                    >
                      {item.label}
                    </Link>
                  ),
                )}
              </nav>
            )}

            <div className="flex shrink-0 items-center gap-2 sm:gap-3 lg:border-l lg:border-gray-300 lg:pl-3 xl:gap-4 xl:pl-4">
              <a
                href={BRAND_PHONE_HREF}
                className="brand-phone-link hidden items-center gap-2 whitespace-nowrap xl:inline-flex"
              >
                <PhoneIcon className="h-5 w-5 shrink-0 text-primary" />
                <span className="text-lg xl:text-xl">{BRAND_PHONE}</span>
              </a>

              {user ? <UserProfileMenu user={user} /> : null}

              {showNav && (
                <button
                  type="button"
                  className="inline-flex flex-col gap-1.5 p-2 lg:hidden"
                  onClick={() => setMobileOpen(!mobileOpen)}
                  aria-label="Toggle menu"
                >
                  <span className="block h-0.5 w-6 bg-nav" />
                  <span className="block h-0.5 w-6 bg-nav" />
                  <span className="block h-0.5 w-6 bg-nav" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {showNav && mobileOpen && (
        <nav className="border-t border-gray-200 bg-white px-4 py-4 lg:hidden">
          {navItems.map((item) => (
            <MobileNavSection
              key={item.label}
              item={item}
              pathname={pathname}
              onNavigate={closeMobile}
            />
          ))}
          <a href={BRAND_PHONE_HREF} className="brand-phone-link mt-4 inline-flex items-center gap-2 sm:hidden">
            <PhoneIcon className="h-5 w-5 text-primary" />
            <span>{BRAND_PHONE}</span>
          </a>
        </nav>
      )}
    </header>
  );
}
