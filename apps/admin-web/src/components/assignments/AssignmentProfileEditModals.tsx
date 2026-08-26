'use client';

import { useEffect, useState, type ReactNode } from 'react';
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
import { api, type Assignment, type Customer, type CustomerContact, type Employee, type JobSite } from '@/lib/api-client';
import { portalFormFieldClassName } from '@/components/portal';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { IconCheck, IconClipboard } from '@/components/ui/icons';

type EditableCustomerContact = Omit<CustomerContact, 'id'>;

function CopyableValue({ field, value, copiedField, onCopy, children }: { field: string; value: unknown; copiedField: string; onCopy: (field: string, value: string) => void; children: ReactNode }) {
  const text = value == null ? '' : String(value);
  const copied = copiedField === field;
  return <div className="relative">{children}<button type="button" disabled={!text.trim()} onClick={() => onCopy(field, text)} className={copied ? 'absolute right-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md bg-emerald-100 text-emerald-700' : 'absolute right-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35'} aria-label={copied ? `${field} copied` : `Copy ${field}`} title={copied ? 'Copied' : `Copy ${field}`}>{copied ? <IconCheck className="h-4 w-4" /> : <IconClipboard className="h-4 w-4" />}</button></div>;
}

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

export function AssignmentEmployeeEditModal({ employee, assignment, onClose }: { employee: Employee | null; assignment?: Assignment | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const form = useForm<CreateEmployeeInput>({ resolver: zodResolver(updateEmployeeSchema) });
  const [copiedField, setCopiedField] = useState('');
  const values = form.watch();

  function copyField(field: string, value: string) {
    void navigator.clipboard.writeText(value).then(() => {
      setCopiedField(field);
      window.setTimeout(() => setCopiedField((current) => current === field ? '' : current), 1600);
    });
  }

  useEffect(() => {
    if (!employee) return;
    setCopiedField('');
    form.reset({
      masterEmployeeId: employee.masterEmployeeId ?? '',
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email ?? '',
      phone: employee.phone ?? '',
      homePhone: employee.homePhone ?? '',
      address: employee.address ?? '',
      position: employee.position ?? '',
      hourlyRate: assignment?.payRate != null ? Number(assignment.payRate) : employee.hourlyRate != null ? Number(employee.hourlyRate) : undefined,
      billRate: employee.billRate != null ? Number(employee.billRate) : undefined,
      status: employee.status as CreateEmployeeInput['status'],
    });
  }, [assignment, employee, form]);

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
          <FormField label="First Name" error={form.formState.errors.firstName?.message}><CopyableValue field="first name" value={values.firstName} copiedField={copiedField} onCopy={copyField}><Input {...form.register('firstName')} className={`${portalFormFieldClassName} pr-24`} /></CopyableValue></FormField>
          <FormField label="Last Name" error={form.formState.errors.lastName?.message}><CopyableValue field="last name" value={values.lastName} copiedField={copiedField} onCopy={copyField}><Input {...form.register('lastName')} className={`${portalFormFieldClassName} pr-24`} /></CopyableValue></FormField>
        </div>
        <FormField label="Email" error={form.formState.errors.email?.message}><CopyableValue field="email" value={values.email} copiedField={copiedField} onCopy={copyField}><Input type="email" {...form.register('email')} className={`${portalFormFieldClassName} pr-24`} /></CopyableValue></FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Mobile Phone"><CopyableValue field="mobile phone" value={values.phone} copiedField={copiedField} onCopy={copyField}><Input {...form.register('phone')} className={`${portalFormFieldClassName} pr-24`} /></CopyableValue></FormField>
          <FormField label="Home Phone"><CopyableValue field="home phone" value={values.homePhone} copiedField={copiedField} onCopy={copyField}><Input {...form.register('homePhone')} className={`${portalFormFieldClassName} pr-24`} /></CopyableValue></FormField>
        </div>
        <FormField label="Trade"><CopyableValue field="trade" value={values.position} copiedField={copiedField} onCopy={copyField}><Input {...form.register('position')} className={`${portalFormFieldClassName} pr-24`} /></CopyableValue></FormField>
        {assignment ? (
          <FormField label="Job Position">
            <CopyableValue field="job position" value={assignment.jobPosition} copiedField={copiedField} onCopy={copyField}><Input value={assignment.jobPosition ?? ''} readOnly className={`${portalFormFieldClassName} pr-24`} /></CopyableValue>
          </FormField>
        ) : null}
        <FormField label="Employee Address"><CopyableValue field="employee address" value={values.address} copiedField={copiedField} onCopy={copyField}><Textarea {...form.register('address')} rows={2} className={`${portalFormFieldClassName} pr-24`} /></CopyableValue></FormField>
        <FormField label="Employee ID"><CopyableValue field="employee ID" value={values.masterEmployeeId} copiedField={copiedField} onCopy={copyField}><Input {...form.register('masterEmployeeId')} className={`${portalFormFieldClassName} pr-24`} /></CopyableValue></FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Pay Rate">
            {employee?.hidePayRate ? (
              <CopyableValue field="pay rate" value="N/A" copiedField={copiedField} onCopy={copyField}><Input value="N/A" readOnly disabled className={`${portalFormFieldClassName} pr-24`} /></CopyableValue>
            ) : (
              <CopyableValue field="pay rate" value={values.hourlyRate} copiedField={copiedField} onCopy={copyField}><Input type="number" step="0.01" {...form.register('hourlyRate', { valueAsNumber: true })} className={`${portalFormFieldClassName} pr-24`} /></CopyableValue>
            )}
          </FormField>
          <FormField label="Bill Rate"><CopyableValue field="bill rate" value={values.billRate} copiedField={copiedField} onCopy={copyField}><Input type="number" step="0.01" {...form.register('billRate', { valueAsNumber: true })} className={`${portalFormFieldClassName} pr-24`} /></CopyableValue></FormField>
        </div>
        <FormField label="Status"><CopyableValue field="status" value={values.status} copiedField={copiedField} onCopy={copyField}><Select {...form.register('status')} className={`${portalFormFieldClassName} pr-24`}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></Select></CopyableValue></FormField>
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
          <div>
            <p className="text-sm font-bold text-slate-800">Customer Contacts (01–10)</p>
            <p className="mt-0.5 text-xs text-slate-500">
              All imported customer contacts are shown below. Scroll horizontally to view phone fields.
            </p>
          </div>
          <div className="max-h-[22rem] overflow-auto rounded-xl border border-slate-300">
            <table className="w-full min-w-[58rem] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 bg-slate-200 text-xs font-bold uppercase tracking-wide text-slate-700">
                <tr>
                  <th className="w-24 border-b border-r border-slate-300 px-3 py-2">Contact</th>
                  <th className="border-b border-r border-slate-300 px-2 py-2">First Name</th>
                  <th className="border-b border-r border-slate-300 px-2 py-2">Last Name</th>
                  <th className="border-b border-r border-slate-300 px-2 py-2">Title</th>
                  <th className="min-w-52 border-b border-r border-slate-300 px-2 py-2">Email</th>
                  <th className="border-b border-r border-slate-300 px-2 py-2">Cell</th>
                  <th className="border-b border-slate-300 px-2 py-2">Office Phone</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact, index) => (
                  <tr key={contact.slotNumber} className="odd:bg-white even:bg-slate-50/80">
                    <th className="whitespace-nowrap border-b border-r border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">
                      Contact {String(contact.slotNumber).padStart(2, '0')}
                    </th>
                    {([
                      ['firstName', 'First name'],
                      ['lastName', 'Last name'],
                      ['title', 'Title'],
                      ['email', 'Email'],
                      ['cell', 'Cell'],
                      ['officePhone', 'Office phone'],
                    ] as const).map(([key, label]) => (
                      <td key={key} className="border-b border-r border-slate-200 p-1.5 last:border-r-0">
                        <Input
                          aria-label={`${label} for contact ${String(contact.slotNumber).padStart(2, '0')}`}
                          type={key === 'email' ? 'email' : 'text'}
                          value={contact[key] ?? ''}
                          onChange={(event) => setContacts((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, [key]: event.target.value } : item,
                            ),
                          )}
                          className="h-9 min-w-28 rounded-md border-slate-200 bg-white px-2 text-sm"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
