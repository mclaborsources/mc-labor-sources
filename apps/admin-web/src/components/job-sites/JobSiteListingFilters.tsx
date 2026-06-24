'use client';

import { FormEvent } from 'react';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { PortalFilterField } from '@/components/portal/PortalFilterField';
import { portalFieldClassName } from '@/components/portal';
import type { JobSiteFilterValues } from '@/lib/job-site-utils';

interface JobSiteListingFiltersProps {
  filters: JobSiteFilterValues;
  onChange: (next: JobSiteFilterValues) => void;
  locations: string[];
  customers?: { id: string; companyName: string }[];
  salesmen?: string[];
  customerTypes?: string[];
  showCustomerFilter?: boolean;
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3-3" strokeLinecap="round" />
    </svg>
  );
}

export function JobSiteListingFilters({
  filters,
  onChange,
  locations,
  customers = [],
  salesmen = [],
  customerTypes = [],
  showCustomerFilter = false,
}: JobSiteListingFiltersProps) {
  const update = (patch: Partial<JobSiteFilterValues>) => onChange({ ...filters, ...patch });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
  };

  const hasActiveFilters = Boolean(
    filters.keywords.trim() ||
      filters.customerId ||
      filters.salesman ||
      filters.customerType ||
      filters.status ||
      filters.location,
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-8 overflow-hidden rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm ring-1 ring-slate-100/80 sm:p-6"
    >
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/10">
          <SearchIcon className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-900">Search & filter</p>
          <p className="text-xs text-slate-500">Find job sites by name, customer, or location</p>
        </div>
      </div>

      <PortalFilterField label="Keywords" className="mb-5">
        <Input
          placeholder="Site name, address, foreman…"
          value={filters.keywords}
          onChange={(event) => update({ keywords: event.target.value })}
          className={portalFieldClassName}
        />
      </PortalFilterField>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        {showCustomerFilter ? (
          <PortalFilterField label="Customer">
            <Select
              value={filters.customerId}
              onChange={(event) => update({ customerId: event.target.value })}
              className={portalFieldClassName}
              aria-label="Customer"
            >
              <option value="">All customers</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.companyName}
                </option>
              ))}
            </Select>
          </PortalFilterField>
        ) : null}

        {salesmen.length > 0 ? (
          <PortalFilterField label="Salesman">
            <Select
              value={filters.salesman}
              onChange={(event) => update({ salesman: event.target.value })}
              className={portalFieldClassName}
              aria-label="Salesman"
            >
              <option value="">All salesmen</option>
              {salesmen.map((salesman) => (
                <option key={salesman} value={salesman}>
                  {salesman}
                </option>
              ))}
            </Select>
          </PortalFilterField>
        ) : null}

        {customerTypes.length > 0 ? (
          <PortalFilterField label="Customer type">
            <Select
              value={filters.customerType}
              onChange={(event) => update({ customerType: event.target.value })}
              className={portalFieldClassName}
              aria-label="Customer type"
            >
              <option value="">All types</option>
              {customerTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </Select>
          </PortalFilterField>
        ) : null}

        <PortalFilterField label="Status">
          <Select
            value={filters.status}
            onChange={(event) => update({ status: event.target.value })}
            className={portalFieldClassName}
            aria-label="Status"
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </Select>
        </PortalFilterField>

        <PortalFilterField label="Location">
          <Select
            value={filters.location}
            onChange={(event) => update({ location: event.target.value })}
            className={portalFieldClassName}
            aria-label="Location"
          >
            <option value="">All locations</option>
            {locations.map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
          </Select>
        </PortalFilterField>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
        <Button type="submit" className="h-[42px] px-6" aria-label="Search job sites">
          <SearchIcon className="mr-2 h-4 w-4" />
          Search
        </Button>
        {hasActiveFilters ? (
          <Button
            type="button"
            variant="soft"
            className="h-[42px]"
            onClick={() =>
              onChange({
                keywords: '',
                status: '',
                customerId: '',
                location: '',
                salesman: '',
                customerType: '',
              })
            }
          >
            Clear filters
          </Button>
        ) : null}
      </div>
    </form>
  );
}
