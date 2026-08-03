export interface NavLink {
  label: string;
  href: string;
}

export interface NavItem {
  label: string;
  href?: string;
  children?: NavLink[];
}

export function isNavGroupActive(item: NavItem, pathname: string): boolean {
  if (item.href) {
    return pathname === item.href || pathname.startsWith(item.href + '/');
  }
  return item.children?.some(
    (child) => pathname === child.href || pathname.startsWith(child.href + '/'),
  ) ?? false;
}

export function isNavLinkActive(href: string, pathname: string): boolean {
  const pathOnly = href.split('?')[0];
  return pathname === pathOnly || pathname.startsWith(pathOnly + '/');
}
