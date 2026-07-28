'use client';

import type { Customer, Employee, JobSite } from '@/lib/api-client';
import { portalFormFieldClassName } from '@/components/portal';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';

const value = (input: string | number | null | undefined) => input == null ? '' : String(input);

function ReadOnlyFooter({ onClose }: { onClose: () => void }) {
  return <ModalFooter><Button type="button" variant="secondary" onClick={onClose}>Close</Button></ModalFooter>;
}

export function EmployeeProfileViewModal({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
  return (
    <Modal open={!!employee} onClose={onClose} title="Employee Profile" subtitle="Workforce profile and status" icon="user" tone="primary" size="lg">
      {employee ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="First Name"><Input value={employee.firstName} readOnly className={portalFormFieldClassName} /></FormField>
            <FormField label="Last Name"><Input value={employee.lastName} readOnly className={portalFormFieldClassName} /></FormField>
          </div>
          <FormField label="Email"><Input value={value(employee.email)} readOnly className={portalFormFieldClassName} /></FormField>
          <FormField label="Phone"><Input value={value(employee.phone)} readOnly className={portalFormFieldClassName} /></FormField>
          <FormField label="Position"><Input value={value(employee.position)} readOnly className={portalFormFieldClassName} /></FormField>
          <FormField label="Employee ID (Master)"><Input value={value(employee.masterEmployeeId)} readOnly className={portalFormFieldClassName} /></FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Pay Rate"><Input value={value(employee.hourlyRate)} readOnly className={portalFormFieldClassName} /></FormField>
            <FormField label="Bill Rate"><Input value={value(employee.billRate)} readOnly className={portalFormFieldClassName} /></FormField>
          </div>
          <FormField label="Status"><Select value={employee.status} disabled className={portalFormFieldClassName}><option value={employee.status}>{employee.status.replace(/_/g, ' ')}</option></Select></FormField>
          <ReadOnlyFooter onClose={onClose} />
        </div>
      ) : null}
    </Modal>
  );
}

export function CustomerProfileViewModal({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  return (
    <Modal open={!!customer} onClose={onClose} title="Customer Profile" subtitle="Company and contact details" icon="building" tone="primary" size="lg">
      {customer ? (
        <div className="space-y-4">
          <FormField label="Customer ID (Master)"><Input value={value(customer.masterCustomerId)} readOnly className={portalFormFieldClassName} /></FormField>
          <FormField label="Company Name"><Input value={customer.companyName} readOnly className={portalFormFieldClassName} /></FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Salesman"><Input value={value(customer.salesman)} readOnly className={portalFormFieldClassName} /></FormField>
            <FormField label="Customer Type"><Input value={value(customer.customerType)} readOnly className={portalFormFieldClassName} /></FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Contact Name"><Input value={value(customer.contactName)} readOnly className={portalFormFieldClassName} /></FormField>
            <FormField label="Contact Phone"><Input value={value(customer.contactPhone)} readOnly className={portalFormFieldClassName} /></FormField>
          </div>
          <FormField label="Contact Email"><Input value={value(customer.contactEmail)} readOnly className={portalFormFieldClassName} /></FormField>
          <FormField label="Office Email"><Input value={value(customer.officeEmail)} readOnly className={portalFormFieldClassName} /></FormField>
          <FormField label="Address"><Textarea value={value(customer.address)} readOnly rows={3} className={portalFormFieldClassName} /></FormField>
          <FormField label="Status"><Select value={customer.status} disabled className={portalFormFieldClassName}><option value={customer.status}>{customer.status.replace(/_/g, ' ')}</option></Select></FormField>
          <ReadOnlyFooter onClose={onClose} />
        </div>
      ) : null}
    </Modal>
  );
}

export function JobSiteProfileViewModal({ jobSite, onClose }: { jobSite: JobSite | null; onClose: () => void }) {
  return (
    <Modal open={!!jobSite} onClose={onClose} title="Job Site Profile" subtitle="Site and foreman details" icon="mapPin" tone="primary" size="lg">
      {jobSite ? (
        <div className="space-y-4">
          <FormField label="Job ID (Master)"><Input value={value(jobSite.masterJobId)} readOnly className={portalFormFieldClassName} /></FormField>
          <FormField label="Site Name"><Input value={jobSite.name} readOnly className={portalFormFieldClassName} /></FormField>
          <FormField label="Address"><Input value={jobSite.address} readOnly className={portalFormFieldClassName} /></FormField>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="City"><Input value={value(jobSite.city)} readOnly className={portalFormFieldClassName} /></FormField>
            <FormField label="State"><Input value={value(jobSite.state)} readOnly className={portalFormFieldClassName} /></FormField>
            <FormField label="Zip"><Input value={value(jobSite.zipCode)} readOnly className={portalFormFieldClassName} /></FormField>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField label="Foreman Name"><Input value={value(jobSite.foremanName)} readOnly className={portalFormFieldClassName} /></FormField>
            <FormField label="Foreman Phone"><Input value={value(jobSite.foremanPhone)} readOnly className={portalFormFieldClassName} /></FormField>
            <FormField label="Foreman Email"><Input value={value(jobSite.foremanEmail)} readOnly className={portalFormFieldClassName} /></FormField>
          </div>
          <FormField label="Status"><Select value={jobSite.status} disabled className={portalFormFieldClassName}><option value={jobSite.status}>{jobSite.status.replace(/_/g, ' ')}</option></Select></FormField>
          <ReadOnlyFooter onClose={onClose} />
        </div>
      ) : null}
    </Modal>
  );
}
