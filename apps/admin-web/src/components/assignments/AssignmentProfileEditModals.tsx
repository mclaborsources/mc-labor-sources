'use client';

import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  updateCustomerSchema,
  updateEmployeeSchema,
  type CreateCustomerInput,
  type CreateEmployeeInput,
} from '@mc-labor/shared';
import { api, type Customer, type Employee } from '@/lib/api-client';
import { portalFormFieldClassName } from '@/components/portal';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';

export function AssignmentEmployeeEditModal({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const form = useForm<CreateEmployeeInput>({ resolver: zodResolver(updateEmployeeSchema) });

  useEffect(() => {
    if (!employee) return;
    form.reset({
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
        <FormField label="Position"><Input {...form.register('position')} className={portalFormFieldClassName} /></FormField>
        {employee?.masterEmployeeId ? <FormField label="Employee ID (master)"><Input value={employee.masterEmployeeId} readOnly disabled className={portalFormFieldClassName} /></FormField> : null}
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

  useEffect(() => {
    if (!customer) return;
    form.reset({
      companyName: customer.companyName,
      salesman: customer.salesman ?? '',
      customerType: customer.customerType ?? '',
      contactName: customer.contactName ?? '',
      contactPhone: customer.contactPhone ?? '',
      contactEmail: customer.contactEmail ?? '',
      officeEmail: customer.officeEmail ?? '',
      address: customer.address ?? '',
      status: customer.status as CreateCustomerInput['status'],
    });
  }, [customer, form]);

  const save = useMutation({
    mutationFn: (values: CreateCustomerInput) => api.updateCustomer(customer!.id, {
      ...values,
      contactEmail: values.contactEmail || undefined,
      officeEmail: values.officeEmail || undefined,
      salesman: values.salesman?.trim() || undefined,
      customerType: values.customerType?.trim() || undefined,
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      void queryClient.invalidateQueries({ queryKey: ['assignments'] });
      onClose();
    },
  });

  return (
    <Modal open={!!customer} onClose={onClose} title="Edit Customer" subtitle="Update company and contact details" icon="building" tone="primary" size="lg">
      <form onSubmit={form.handleSubmit((values) => save.mutate(values))} className="space-y-4">
        {customer?.masterCustomerId ? <FormField label="Customer ID (master)"><Input value={customer.masterCustomerId} readOnly disabled className={portalFormFieldClassName} /></FormField> : null}
        <FormField label="Company Name" error={form.formState.errors.companyName?.message}><Input {...form.register('companyName')} className={portalFormFieldClassName} /></FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Salesman"><Input {...form.register('salesman')} className={portalFormFieldClassName} /></FormField>
          <FormField label="Customer Type"><Input {...form.register('customerType')} className={portalFormFieldClassName} /></FormField>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Contact Name"><Input {...form.register('contactName')} className={portalFormFieldClassName} /></FormField>
          <FormField label="Contact Phone"><Input {...form.register('contactPhone')} className={portalFormFieldClassName} /></FormField>
        </div>
        <FormField label="Contact Email"><Input type="email" {...form.register('contactEmail')} className={portalFormFieldClassName} /></FormField>
        <FormField label="Office Email"><Input type="email" {...form.register('officeEmail')} className={portalFormFieldClassName} /></FormField>
        <FormField label="Address"><Textarea {...form.register('address')} rows={2} className={portalFormFieldClassName} /></FormField>
        <FormField label="Status"><Select {...form.register('status')} className={portalFormFieldClassName}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></Select></FormField>
        <ModalFooter><Button type="button" variant="secondary" icon="cancel" onClick={onClose}>Cancel</Button><Button type="submit" icon="save" loading={save.isPending}>Save Changes</Button></ModalFooter>
      </form>
    </Modal>
  );
}
