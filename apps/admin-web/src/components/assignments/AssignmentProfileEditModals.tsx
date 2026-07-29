'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  updateCustomerSchema,
  updateEmployeeSchema,
  updateJobSiteSchema,
  type CreateCustomerInput,
  type CreateEmployeeInput,
  type CreateJobSiteInput,
} from '@mc-labor/shared';
import { api, type Customer, type CustomerContact, type Employee, type JobSite } from '@/lib/api-client';
import { portalFormFieldClassName } from '@/components/portal';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';

type EditableCustomerContact = Omit<CustomerContact, 'id'>;

function emptyContacts(): EditableCustomerContact[] {
  return Array.from({ length: 10 }, (_, index) => ({
    slotNumber: index + 1,
    firstName: '',
    lastName: '',
    title: '',
    email: '',
    cell: '',
    officePhone: '',
  }));
}

export function AssignmentEmployeeEditModal({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const form = useForm<CreateEmployeeInput>({ resolver: zodResolver(updateEmployeeSchema) });

  useEffect(() => {
    if (!employee) return;
    form.reset({
      masterEmployeeId: employee.masterEmployeeId ?? '',
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email ?? '',
      phone: employee.phone ?? '',
      position: employee.position ?? '',
      hourlyRate: employee.hourlyRate != null ? Number(employee.hourlyRate) : undefined,
      billRate: employee.billRate != null ? Number(employee.billRate) : undefined,
      status: employee.status as CreateEmployeeInput['status'],
    });
  }, [employee, form]);

  const save = useMutation({
    mutationFn: (values: CreateEmployeeInput) => api.updateEmployee(employee!.id, {
      ...values,
      email: values.email || undefined,
      hourlyRate: values.hourlyRate ? Number(values.hourlyRate) : undefined,
      billRate: values.billRate ? Number(values.billRate) : undefined,
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
      void queryClient.invalidateQueries({ queryKey: ['assignments'] });
      onClose();
    },
  });

  return (
    <Modal open={!!employee} onClose={onClose} title="Edit Employee" subtitle="Update workforce profile and status" icon="edit" tone="primary" size="lg">
      <form onSubmit={form.handleSubmit((values) => save.mutate(values))} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField label="First Name" error={form.formState.errors.firstName?.message}><Input {...form.register('firstName')} className={portalFormFieldClassName} /></FormField>
          <FormField label="Last Name" error={form.formState.errors.lastName?.message}><Input {...form.register('lastName')} className={portalFormFieldClassName} /></FormField>
        </div>
        <FormField label="Email" error={form.formState.errors.email?.message}><Input type="email" {...form.register('email')} className={portalFormFieldClassName} /></FormField>
        <FormField label="Phone"><Input {...form.register('phone')} className={portalFormFieldClassName} /></FormField>
        <FormField label="Trade"><Input {...form.register('position')} className={portalFormFieldClassName} /></FormField>
        <FormField label="Employee ID"><Input {...form.register('masterEmployeeId')} className={portalFormFieldClassName} /></FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Pay Rate"><Input type="number" step="0.01" {...form.register('hourlyRate', { valueAsNumber: true })} className={portalFormFieldClassName} /></FormField>
          <FormField label="Bill Rate"><Input type="number" step="0.01" {...form.register('billRate', { valueAsNumber: true })} className={portalFormFieldClassName} /></FormField>
        </div>
        <FormField label="Status"><Select {...form.register('status')} className={portalFormFieldClassName}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></Select></FormField>
        <ModalFooter><Button type="button" variant="secondary" icon="cancel" onClick={onClose}>Cancel</Button><Button type="submit" icon="save" loading={save.isPending}>Save Changes</Button></ModalFooter>
      </form>
    </Modal>
  );
}

export function AssignmentCustomerEditModal({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const form = useForm<CreateCustomerInput>({ resolver: zodResolver(updateCustomerSchema) });
  const [contacts, setContacts] = useState<EditableCustomerContact[]>(emptyContacts);

  useEffect(() => {
    if (!customer) return;
    void api.getCustomer(customer.id).then((detail) => {
      const nextContacts = emptyContacts();
      detail.contacts.forEach((contact) => {
        if (contact.slotNumber < 1 || contact.slotNumber > 10) return;
        nextContacts[contact.slotNumber - 1] = {
          slotNumber: contact.slotNumber,
          firstName: contact.firstName ?? '',
          lastName: contact.lastName ?? '',
          title: contact.title ?? '',
          email: contact.email ?? '',
          cell: contact.cell ?? '',
          officePhone: contact.officePhone ?? '',
        };
      });
      setContacts(nextContacts);
      form.reset({
        masterCustomerId: detail.masterCustomerId ?? '',
        companyName: detail.companyName,
        salesman: detail.salesman ?? '',
        customerType: detail.customerType ?? '',
        officeEmail: detail.officeEmail ?? '',
        street: detail.street ?? '',
        city: detail.city ?? '',
        state: detail.state ?? '',
        zip: detail.zip ?? '',
        status: detail.status as CreateCustomerInput['status'],
      });
    });
  }, [customer, form]);

  const save = useMutation({
    mutationFn: async (values: CreateCustomerInput) => {
      const primary = contacts[0];
      const updated = await api.updateCustomer(customer!.id, {
        ...values,
        address: [values.street, values.city, values.state, values.zip].filter(Boolean).join(', '),
        contactName: `${primary.firstName ?? ''} ${primary.lastName ?? ''}`.trim(),
        contactEmail: primary.email || '',
        contactPhone: primary.cell || '',
        officeEmail: values.officeEmail || undefined,
        salesman: values.salesman?.trim() || undefined,
        customerType: values.customerType?.trim() || undefined,
      });
      await api.updateCustomerContacts(customer!.id, contacts);
      return updated;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      void queryClient.invalidateQueries({ queryKey: ['assignments'] });
      onClose();
    },
  });

  return (
    <Modal open={!!customer} onClose={onClose} title="Edit Customer" subtitle="Update company and contact details" icon="building" tone="primary" size="lg">
      <form onSubmit={form.handleSubmit((values) => save.mutate(values))} className="space-y-4">
        <FormField label="Customer ID"><Input {...form.register('masterCustomerId')} className={portalFormFieldClassName} /></FormField>
        <FormField label="Company Name" error={form.formState.errors.companyName?.message}><Input {...form.register('companyName')} className={portalFormFieldClassName} /></FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Salesman"><Input {...form.register('salesman')} className={portalFormFieldClassName} /></FormField>
          <FormField label="Customer Type"><Input {...form.register('customerType')} className={portalFormFieldClassName} /></FormField>
        </div>
        <FormField label="Office Email"><Input type="email" {...form.register('officeEmail')} className={portalFormFieldClassName} /></FormField>
        <FormField label="Street"><Input {...form.register('street')} className={portalFormFieldClassName} /></FormField>
        <div className="grid grid-cols-3 gap-4">
          <FormField label="City"><Input {...form.register('city')} className={portalFormFieldClassName} /></FormField>
          <FormField label="State"><Input {...form.register('state')} className={portalFormFieldClassName} /></FormField>
          <FormField label="ZIP"><Input {...form.register('zip')} className={portalFormFieldClassName} /></FormField>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-bold text-slate-800">Customer Contacts (01–10)</p>
          {contacts.map((contact, index) => (
            <details key={contact.slotNumber} className="rounded-xl border border-slate-200">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
                Contact {String(contact.slotNumber).padStart(2, '0')}
              </summary>
              <div className="grid gap-3 border-t p-4 sm:grid-cols-2">
                {([
                  ['First Name', 'firstName'], ['Last Name', 'lastName'], ['Title', 'title'],
                  ['Email', 'email'], ['Cell', 'cell'], ['Office Phone', 'officePhone'],
                ] as const).map(([label, key]) => (
                  <FormField key={key} label={label}>
                    <Input
                      type={key === 'email' ? 'email' : 'text'}
                      value={contact[key] ?? ''}
                      onChange={(event) => setContacts((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, [key]: event.target.value } : item,
                        ),
                      )}
                      className={portalFormFieldClassName}
                    />
                  </FormField>
                ))}
              </div>
            </details>
          ))}
        </div>
        <FormField label="Status"><Select {...form.register('status')} className={portalFormFieldClassName}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></Select></FormField>
        <ModalFooter><Button type="button" variant="secondary" icon="cancel" onClick={onClose}>Cancel</Button><Button type="submit" icon="save" loading={save.isPending}>Save Changes</Button></ModalFooter>
      </form>
    </Modal>
  );
}

export function AssignmentJobSiteEditModal({ jobSite, onClose }: { jobSite: JobSite | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const form = useForm<CreateJobSiteInput>({ resolver: zodResolver(updateJobSiteSchema) });

  useEffect(() => {
    if (!jobSite) return;
    form.reset({
      customerId: jobSite.customerId,
      name: jobSite.name,
      address: jobSite.address,
      city: jobSite.city ?? '',
      state: jobSite.state ?? '',
      zipCode: jobSite.zipCode ?? '',
      foremanName: jobSite.foremanName ?? '',
      foremanPhone: jobSite.foremanPhone ?? '',
      foremanEmail: jobSite.foremanEmail ?? '',
      status: jobSite.status as CreateJobSiteInput['status'],
    });
  }, [jobSite, form]);

  const save = useMutation({
    mutationFn: (values: CreateJobSiteInput) => api.updateJobSite(jobSite!.id, {
      ...values,
      foremanEmail: values.foremanEmail || undefined,
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['job-sites'] });
      void queryClient.invalidateQueries({ queryKey: ['assignments'] });
      onClose();
    },
  });

  return (
    <Modal open={!!jobSite} onClose={onClose} title="Edit Job Site" subtitle="Update site and foreman details" icon="mapPin" tone="primary" size="lg">
      <form onSubmit={form.handleSubmit((values) => save.mutate(values))} className="space-y-4">
        {jobSite?.masterJobId ? <FormField label="Job ID (master)"><Input value={jobSite.masterJobId} readOnly disabled className={portalFormFieldClassName} /></FormField> : null}
        <FormField label="Site Name" error={form.formState.errors.name?.message}><Input {...form.register('name')} className={portalFormFieldClassName} /></FormField>
        <FormField label="Address" error={form.formState.errors.address?.message}><Input {...form.register('address')} className={portalFormFieldClassName} /></FormField>
        <div className="grid grid-cols-3 gap-4">
          <FormField label="City"><Input {...form.register('city')} className={portalFormFieldClassName} /></FormField>
          <FormField label="State"><Input {...form.register('state')} className={portalFormFieldClassName} /></FormField>
          <FormField label="Zip"><Input {...form.register('zipCode')} className={portalFormFieldClassName} /></FormField>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FormField label="Foreman Name"><Input {...form.register('foremanName')} className={portalFormFieldClassName} /></FormField>
          <FormField label="Foreman Phone"><Input {...form.register('foremanPhone')} className={portalFormFieldClassName} /></FormField>
          <FormField label="Foreman Email"><Input type="email" {...form.register('foremanEmail')} className={portalFormFieldClassName} /></FormField>
        </div>
        <FormField label="Status"><Select {...form.register('status')} className={portalFormFieldClassName}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></Select></FormField>
        <ModalFooter><Button type="button" variant="secondary" icon="cancel" onClick={onClose}>Cancel</Button><Button type="submit" icon="save" loading={save.isPending}>Save Changes</Button></ModalFooter>
      </form>
    </Modal>
  );
}
