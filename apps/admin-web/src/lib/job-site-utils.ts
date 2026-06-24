interface JobSiteLike {
  name: string;
  address: string;
  city: string | null;
  state: string | null;
  zipCode?: string | null;
  status: string;
  foremanName?: string | null;
  customerId?: string;
  customer?: {
    companyName: string;
    salesman?: string | null;
    customerType?: string | null;
  } | null;
}

export function formatJobSiteLocation(site: Pick<JobSiteLike, 'city' | 'state' | 'address'>) {
  const cityState = [site.city, site.state].filter(Boolean).join(', ');
  return cityState || site.address || '—';
}

export function formatJobSiteAddress(site: JobSiteLike) {
  const line = site.address;
  const cityStateZip = [site.city, site.state, site.zipCode].filter(Boolean).join(', ');
  return cityStateZip ? `${line}, ${cityStateZip}` : line;
}

export function getJobSiteSummary(site: JobSiteLike, workerCount = 0) {
  const location = formatJobSiteLocation(site);
  const parts = [`Located at ${location}.`];

  if (site.foremanName) {
    parts.push(`Foreman: ${site.foremanName}.`);
  }

  if (site.customer?.companyName) {
    parts.push(`Customer: ${site.customer.companyName}.`);
  }

  parts.push(
    workerCount === 1 ? '1 worker assigned.' : `${workerCount} workers assigned.`,
  );

  return parts.join(' ');
}

export function collectJobSiteStates(sites: JobSiteLike[]) {
  return [...new Set(sites.map((site) => site.state).filter(Boolean) as string[])].sort();
}

export interface JobSiteFilterValues {
  keywords: string;
  status: string;
  customerId: string;
  location: string;
  salesman: string;
  customerType: string;
}

export function filterJobSites<T extends JobSiteLike>(
  sites: T[],
  filters: JobSiteFilterValues,
): T[] {
  const keywords = filters.keywords.trim().toLowerCase();

  return sites.filter((site) => {
    if (filters.status && site.status !== filters.status) return false;
    if (filters.customerId && site.customerId !== filters.customerId) {
      return false;
    }
    if (filters.location && site.state !== filters.location) return false;
    if (filters.salesman && (site.customer?.salesman ?? '') !== filters.salesman) return false;
    if (filters.customerType && (site.customer?.customerType ?? '') !== filters.customerType) {
      return false;
    }

    if (!keywords) return true;

    const haystack = [
      site.name,
      site.address,
      site.city,
      site.state,
      site.foremanName,
      site.customer?.companyName,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(keywords);
  });
}
