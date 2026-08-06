'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createSupervisorUserSchema, assignSupervisorSitesSchema, type CreateSupervisorUserInput } from '@mc-labor/shared';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { BrandPageTitle } from '@/components/brand';
import { BRAND_HERO_IMAGES } from '@/lib/navigation';
import { PortalRecordsPanel, portalFormFieldClassName } from '@/components/portal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { Table, Th, Td, ThActions } from '@/components/ui/Table';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { api, type SupervisorUser } from '@/lib/api-client';

type CreateSupervisorInput = CreateSupervisorUserInput;

export default function SupervisorsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [selected, setSelected] = useState<SupervisorUser | null>(null);
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);
  const queryClient = useQueryClient();

  const { data: supervisors, isLoading } = useQuery({
    queryKey: ['supervisors'],
    queryFn: () => api.getSupervisors(),
  });

  const { data: jobSites } = useQuery({
    queryKey: ['job-sites'],
    queryFn: () => api.getJobSites({ status: 'ACTIVE' }),
  });

  const form = useForm<CreateSupervisorInput>({
    resolver: zodResolver(createSupervisorUserSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  const createMutation = useMutation({
    mutationFn: (values: CreateSupervisorInput) => api.createSupervisorUser(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supervisors'] });
      setCreateOpen(false);
      form.reset();
    },
  });

  const assignMutation = useMutation({
    mutationFn: () => {
      assignSupervisorSitesSchema.parse({
        userId: selected!.id,
        jobSiteIds: selectedSiteIds,
      });
      return api.setSupervisorJobSites(selected!.id, selectedSiteIds);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supervisors'] });
      setAssignOpen(false);
      setSelected(null);
    },
  });

  async function openAssign(supervisor: SupervisorUser) {
    const ids = await api.getSupervisorJobSiteIds(supervisor.id);
    setSelected(supervisor);
    setSelectedSiteIds(ids);
    setAssignOpen(true);
  }

  function toggleSite(siteId: string) {
    setSelectedSiteIds((prev) =>
      prev.includes(siteId) ? prev.filter((id) => id !== siteId) : [...prev, siteId],
    );
  }

  return (
    <DashboardLayout heroTitle="Supervisors" heroImage={BRAND_HERO_IMAGES.inner}>
      <BrandPageTitle
        title="Supervisors"
        description="Create supervisor accounts and assign job sites"
        action={
          <Button icon="userPlus" onClick={() => setCreateOpen(true)}>
            Add Supervisor
          </Button>
        }
      />

      {isLoading && <LoadingState />}
      {!isLoading && supervisors?.length === 0 && (
        <EmptyState
          title="No supervisors yet"
          description="Add a supervisor and assign them to job sites for the field portal."
        />
      )}
      {supervisors && supervisors.length > 0 && (
        <PortalRecordsPanel title="Supervisor accounts" count={supervisors.length}>
          <Table hasActions>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Assigned sites</Th>
                <ThActions />
              </tr>
            </thead>
            <tbody>
              {supervisors.map((supervisor) => (
                <tr key={supervisor.id}>
                  <Td className="font-medium text-slate-800">{supervisor.name}</Td>
                  <Td>{supervisor.email}</Td>
                  <Td>{supervisor.assignedJobSiteCount ?? 0}</Td>
                  <Td>
                    <Button size="sm" variant="softPrimary" icon="mapPin" onClick={() => openAssign(supervisor)}>
                      Assign sites
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </PortalRecordsPanel>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add Supervisor"
        subtitle="Create a supervisor portal login"
        icon="userPlus"
        tone="success"
      >


        
        <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
          <FormField label="Name" error={form.formState.errors.name?.message}>
            <Input {...form.register('name')} className={portalFormFieldClassName} />
          </FormField>
          <FormField label="Email" error={form.formState.errors.email?.message}>
            <Input type="email" {...form.register('email')} className={portalFormFieldClassName} />
          </FormField>
          <FormField label="Password" error={form.formState.errors.password?.message}>
            <Input type="password" {...form.register('password')} className={portalFormFieldClassName} />
          </FormField>
          <ModalFooter>
            <Button type="button" variant="secondary" icon="cancel" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" icon="userPlus" loading={createMutation.isPending}>
              Create Supervisor
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="Assign Job Sites"
        subtitle={selected ? `Sites for ${selected.name}` : undefined}
        icon="mapPin"
        size="lg"
      >
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {jobSites?.map((site) => (
            <label
              key={site.id}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-sm shadow-sm hover:border-primary/25"
            >
              <input
                type="checkbox"
                checked={selectedSiteIds.includes(site.id)}
                onChange={() => toggleSite(site.id)}
                className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/20"
              />
              <span>
                <span className="font-medium text-slate-800">{site.name}</span>
                <span className="block text-xs text-slate-500">{site.customer?.companyName}</span>
              </span>
            </label>
          ))}
        </div>
        <ModalFooter>
          <Button type="button" variant="secondary" icon="cancel" onClick={() => setAssignOpen(false)}>
            Cancel
          </Button>
          <Button icon="save" loading={assignMutation.isPending} onClick={() => assignMutation.mutate()}>
            Save Assignments
          </Button>
        </ModalFooter>
      </Modal>
    </DashboardLayout>
  );
}
