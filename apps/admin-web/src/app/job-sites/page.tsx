'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createJobSiteSchema, updateJobSiteSchema, JobSiteStatus, type CreateJobSiteInput } from '@mc-labor/shared';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { BrandJobSiteCard, BrandPageTitle } from '@/components/brand';
import { JobSiteListingFilters } from '@/components/job-sites/JobSiteListingFilters';
import { BRAND_HERO_IMAGES } from '@/lib/navigation';
import { collectJobSiteStates, filterJobSites, type JobSiteFilterValues } from '@/lib/job-site-utils';
import { collectDistinct } from '@/lib/filter-options';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { FormField } from '@/components/ui/FormField';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { api, type JobSite } from '@/lib/api-client';

const defaultFilters: JobSiteFilterValues = {
  keywords: '',
  status: '',
  customerId: '',
  location: '',
  salesman: '',
  customerType: '',
};

export default function JobSitesPage() {
  const [filters, setFilters] = useState(defaultFilters);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<JobSite | null>(null);
  const [supervisorIds, setSupervisorIds] = useState<string[]>([]);
  const queryClient = useQueryClient();

  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api.getCustomers(),
  });

  const { data: supervisors } = useQuery({
    queryKey: ['supervisors'],
    queryFn: () => api.getSupervisors(),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['job-sites'],
    queryFn: () => api.getJobSites(),
  });

  const locations = useMemo(() => collectJobSiteStates(data ?? []), [data]);
  const salesmen = useMemo(
    () => collectDistinct((customers ?? []).map((c) => c.salesman)),
    [customers],
  );
  const customerTypes = useMemo(
    () => collectDistinct((customers ?? []).map((c) => c.customerType)),
    [customers],
  );
  const filteredSites = useMemo(
    () => filterJobSites(data ?? [], filters),
    [data, filters],
  );

  const form = useForm<CreateJobSiteInput>({
    resolver: async (data, context, options) =>
      zodResolver(editing ? updateJobSiteSchema : createJobSiteSchema)(data, context, options),
    defaultValues: { customerId: '', name: '', address: '', status: JobSiteStatus.ACTIVE },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: CreateJobSiteInput) => {
      const payload = {
        ...values,
        foremanEmail: values.foremanEmail || undefined,
      };
      const site = editing
        ? await api.updateJobSite(editing.id, payload)
        : await api.createJobSite(payload);
      if (editing) {
        await api.setJobSiteSupervisors(site.id, supervisorIds);
      }
      return site;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-sites'] });
      setModalOpen(false);
      setEditing(null);
    },
  });

  function openCreate() {
    setEditing(null);
    setSupervisorIds([]);
    form.reset({ customerId: '', name: '', address: '', status: JobSiteStatus.ACTIVE });
    setModalOpen(true);
  }

  async function openEdit(site: JobSite) {
    setEditing(site);
    const ids = await api.getJobSiteSupervisorIds(site.id);
    setSupervisorIds(ids);
    form.reset({
      customerId: site.customerId,
      name: site.name,
      address: site.address,
      city: site.city || '',
      state: site.state || '',
      zipCode: site.zipCode || '',
      foremanName: site.foremanName || '',
      foremanPhone: site.foremanPhone || '',
      foremanEmail: site.foremanEmail || '',
      status: site.status as JobSiteStatus,
    });
    setModalOpen(true);
  }

  return (
    <DashboardLayout heroTitle="Job Sites" heroImage={BRAND_HERO_IMAGES.default}>
      <BrandPageTitle
        title="Job Sites"
        description="Manage customer job sites"
        action={<Button icon="mapPin" onClick={openCreate}>Add Job Site</Button>}
      />

      <JobSiteListingFilters
        filters={filters}
        onChange={setFilters}
        locations={locations}
        customers={customers}
        salesmen={salesmen}
        customerTypes={customerTypes}
        showCustomerFilter
      />

      {isLoading && <LoadingState />}
      {!isLoading && filteredSites.length === 0 && (
        <EmptyState title={data?.length ? 'No job sites match your filters' : 'No job sites found'} />
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
              customerName={site.customer?.companyName}
              foremanName={site.foremanName}
              foremanPhone={site.foremanPhone}
              foremanEmail={site.foremanEmail}
              assignments={site.assignments}
              onEdit={() => openEdit(site)}
            />
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Job Site' : 'Add Job Site'}
        subtitle={editing ? 'Update site location and foreman contact' : 'Register a new customer job site'}
        icon={editing ? 'edit' : 'mapPin'}
        tone={editing ? 'primary' : 'success'}
        size="lg"
      >
        <form
          onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))}
          className="space-y-4"
        >
          <FormField label="Customer" error={form.formState.errors.customerId?.message}>
            <Select {...form.register('customerId')}>
              <option value="">Select customer</option>
              {customers?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.companyName}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Site Name" error={form.formState.errors.name?.message}>
            <Input {...form.register('name')} />
          </FormField>
          <FormField label="Address" error={form.formState.errors.address?.message}>
            <Input {...form.register('address')} />
          </FormField>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="City">
              <Input {...form.register('city')} />
            </FormField>
            <FormField label="State">
              <Input {...form.register('state')} />
            </FormField>
            <FormField label="Zip">
              <Input {...form.register('zipCode')} />
            </FormField>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Foreman Name">
              <Input {...form.register('foremanName')} />
            </FormField>
            <FormField label="Foreman Phone">
              <Input {...form.register('foremanPhone')} />
            </FormField>
            <FormField label="Foreman Email">
              <Input type="email" {...form.register('foremanEmail')} />
            </FormField>
          </div>
          <FormField label="Status">
            <Select {...form.register('status')}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </Select>
          </FormField>
          {editing && supervisors && supervisors.length > 0 ? (
            <FormField label="Assigned supervisors">
              <div className="max-h-40 space-y-2 overflow-y-auto rounded-xl border border-slate-200/80 p-3">
                {supervisors.map((supervisor) => (
                  <label key={supervisor.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={supervisorIds.includes(supervisor.id)}
                      onChange={() =>
                        setSupervisorIds((prev) =>
                          prev.includes(supervisor.id)
                            ? prev.filter((id) => id !== supervisor.id)
                            : [...prev, supervisor.id],
                        )
                      }
                      className="h-4 w-4 rounded border-slate-300 text-primary"
                    />
                    {supervisor.name}
                  </label>
                ))}
              </div>
            </FormField>
          ) : null}
          <ModalFooter>
            <Button type="button" variant="secondary" icon="cancel" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" icon="save" loading={saveMutation.isPending}>
              {editing ? 'Save' : 'Create'}
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
