'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CustomerLayout } from '@/components/layout/CustomerLayout';
import { BrandJobSiteCard, BrandPageTitle } from '@/components/brand';
import { JobSiteListingFilters } from '@/components/job-sites/JobSiteListingFilters';
import { BRAND_HERO_IMAGES } from '@/lib/navigation';
import { collectJobSiteStates, filterJobSites, type JobSiteFilterValues } from '@/lib/job-site-utils';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { api } from '@/lib/api-client';

const defaultFilters: JobSiteFilterValues = {
  keywords: '',
  status: '',
  customerId: '',
  location: '',
  salesman: '',
  customerType: '',
};

export default function CustomerJobSitesPage() {
  const [filters, setFilters] = useState(defaultFilters);

  const { data, isLoading } = useQuery({
    queryKey: ['customer-job-sites'],
    queryFn: () => api.getCustomerPortalJobSites(),
  });

  const locations = useMemo(() => collectJobSiteStates(data ?? []), [data]);
  const filteredSites = useMemo(
    () => filterJobSites(data ?? [], filters),
    [data, filters],
  );

  return (
    <CustomerLayout heroTitle="Job Sites" heroImage={BRAND_HERO_IMAGES.default}>
      <BrandPageTitle
        title="Job Sites"
        description="Your active job sites and assigned workers"
      />

      <JobSiteListingFilters
        filters={filters}
        onChange={setFilters}
        locations={locations}
      />

      {isLoading && <LoadingState />}
      {!isLoading && filteredSites.length === 0 && (
        <EmptyState title={data?.length ? 'No job sites match your filters' : 'No job sites'} />
      )}
      {filteredSites.length > 0 && (
        <div className="space-y-5">
          {filteredSites.map((site) => (
            <BrandJobSiteCard
              key={site.id}
              name={site.name}
              address={site.address}
              city={site.city}
              state={site.state}
              zipCode={site.zipCode}
              status={site.status}
              foremanName={site.foremanName}
              foremanPhone={site.foremanPhone}
              foremanEmail={site.foremanEmail}
              assignments={site.assignments}
            />
          ))}
        </div>
      )}
    </CustomerLayout>
  );
}
