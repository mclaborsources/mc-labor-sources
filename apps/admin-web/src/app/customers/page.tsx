'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  createCustomerSchema,
  updateCustomerSchema,
  createCustomerUserSchema,
  bulkCustomerRowSchema,
  CustomerStatus,
  type CreateCustomerInput,
  type CreateCustomerUserInput,
  type BulkCustomerRow,
} from '@mc-labor/shared';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { BrandPageTitle } from '@/components/brand';
import { BRAND_HERO_IMAGES } from '@/lib/navigation';
import {
  PortalFilterPanel,
  PortalRecordsPanel,
  PortalSummaryStat,
  PortalFilterField,
  portalFieldClassName,
  portalFormFieldClassName,
  PersonCell,
  TitleCell,
  ActionCell,
  TruncateCell,
} from '@/components/portal';
import { IconBuilding, IconUsers } from '@/components/dashboard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { FormField } from '@/components/ui/FormField';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { Table, Th, Td, ThActions } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { api, type Customer, type CustomerContact, type CustomerDetail } from '@/lib/api-client';
import { BulkImportModal } from '@/components/import/BulkImportModal';
import {
  primaryContactFromCustomer,
} from '@/lib/customer-contact-utils';
import { collectDistinct } from '@/lib/filter-options';

const CUSTOMER_IMPORT_FIELDS = [
  { key: 'companyName', label: 'Company Name', required: true },
  { key: 'contactName', label: 'Contact Name' },
  { key: 'contactEmail', label: 'Contact Email' },
  { key: 'contactPhone', label: 'Contact Phone' },
  { key: 'officeEmail', label: 'Office Email' },
  { key: 'address', label: 'Address' },
  { key: 'salesman', label: 'Salesman' },
  { key: 'customerType', label: 'Customer Type' },
  { key: 'status', label: 'Status' },
];

const CUSTOMER_TEMPLATE_HEADERS = CUSTOMER_IMPORT_FIELDS.map((f) => f.label);

type EditableContact = Omit<CustomerContact, 'id'>;

function emptyCustomerContacts(): EditableContact[] {
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

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [salesmanFilter, setSalesmanFilter] = useState('');
  const [customerTypeFilter, setCustomerTypeFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [editingDetail, setEditingDetail] = useState<CustomerDetail | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [editableContacts, setEditableContacts] = useState<EditableContact[]>(emptyCustomerContacts);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['customers', search],
    queryFn: () => api.getCustomers({ search }),
  });

  const filtered = useMemo(() => {
    let customers = data ?? [];
    if (statusFilter) {
      customers = customers.filter((c) => c.status === statusFilter);
    }
    if (salesmanFilter) {
      customers = customers.filter((c) => (c.salesman ?? '') === salesmanFilter);
    }
    if (customerTypeFilter) {
      customers = customers.filter((c) => (c.customerType ?? '') === customerTypeFilter);
    }
    return customers;
  }, [data, statusFilter, salesmanFilter, customerTypeFilter]);

  const salesmen = useMemo(
    () => collectDistinct((data ?? []).map((c) => c.salesman)),
    [data],
  );
  const customerTypes = useMemo(
    () => collectDistinct((data ?? []).map((c) => c.customerType)),
    [data],
  );

  const stats = useMemo(() => {
    const customers = data ?? [];
    return {
      total: customers.length,
      active: customers.filter((c) => c.status === 'ACTIVE').length,
      jobSites: customers.reduce((sum, c) => sum + (c._count?.jobSites ?? 0), 0),
    };
  }, [data]);

  const form = useForm<CreateCustomerInput>({
    resolver: async (data, context, options) =>
      zodResolver(editing ? updateCustomerSchema : createCustomerSchema)(data, context, options),
    defaultValues: { companyName: '', status: CustomerStatus.ACTIVE },
  });

  const userForm = useForm<CreateCustomerUserInput>({
    resolver: zodResolver(createCustomerUserSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: CreateCustomerInput) => {
      const primary = editableContacts[0];
      const payload = {
        ...values,
        contactName: `${primary.firstName ?? ''} ${primary.lastName ?? ''}`.trim(),
        contactEmail: primary.email || '',
        contactPhone: primary.cell || '',
        officeEmail: values.officeEmail || undefined,
        address: [values.street, values.city, values.state, values.zip]
          .map((value) => value?.trim())
          .filter(Boolean)
          .join(', '),
        salesman: values.salesman?.trim() || undefined,
        customerType: values.customerType?.trim() || undefined,
      };
      const customer = editing
        ? await api.updateCustomer(editing.id, payload)
        : await api.createCustomer(payload);
      await api.updateCustomerContacts(customer.id, editableContacts);
      return customer;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      setModalOpen(false);
      setEditing(null);
    },
  });

  const createUserMutation = useMutation({
    mutationFn: (values: CreateCustomerUserInput) =>
      api.createCustomerUser(selectedCustomer!.id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setUserModalOpen(false);
      userForm.reset();
    },
  });

  function openCreate() {
    setEditing(null);
    setEditingDetail(null);
    setEditableContacts(emptyCustomerContacts());
    form.reset({
      masterCustomerId: '',
      companyName: '',
      status: CustomerStatus.ACTIVE,
      salesman: '',
      customerType: '',
      street: '',
      city: '',
      state: '',
      zip: '',
    });
    setModalOpen(true);
  }

  async function openEdit(c: Customer) {
    setEditing(c);
    setEditingDetail(null);
    setModalOpen(true);
    setEditLoading(true);
    try {
      const detail = await api.getCustomer(c.id);
      setEditingDetail(detail);
      const primary = primaryContactFromCustomer(detail, detail.contacts);
      const contacts = emptyCustomerContacts();
      detail.contacts.forEach((contact) => {
        if (contact.slotNumber >= 1 && contact.slotNumber <= 10) {
          contacts[contact.slotNumber - 1] = {
            slotNumber: contact.slotNumber,
            firstName: contact.firstName ?? '',
            lastName: contact.lastName ?? '',
            title: contact.title ?? '',
            email: contact.email ?? '',
            cell: contact.cell ?? '',
            officePhone: contact.officePhone ?? '',
          };
        }
      });
      setEditableContacts(contacts);
      form.reset({
        masterCustomerId: detail.masterCustomerId ?? '',
        companyName: detail.companyName,
        contactName: primary.contactName,
        contactEmail: primary.contactEmail,
        contactPhone: primary.contactPhone,
        officeEmail: primary.officeEmail,
        street: detail.street ?? '',
        city: detail.city ?? '',
        state: detail.state ?? '',
        zip: detail.zip ?? '',
        address: detail.address ?? '',
        salesman: detail.salesman ?? '',
        customerType: detail.customerType ?? '',
        status: detail.status as CustomerStatus,
      });
    } finally {
      setEditLoading(false);
    }
  }

  return (
    <DashboardLayout heroTitle="Customers" heroImage={BRAND_HERO_IMAGES.default}>
      <BrandPageTitle
        title="Customers"
        description="Manage customer companies and portal access"
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon="upload" onClick={() => setImportOpen(true)}>
              Import Customers
            </Button>
            <Button icon="plus" onClick={openCreate}>
              Add Customer
            </Button>
          </div>
        }
      />

      {data && data.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
          <PortalSummaryStat label="Total customers" value={stats.total} icon={<IconBuilding className="h-5 w-5" />} />
          <PortalSummaryStat
            label="Active"
            value={stats.active}
            icon={<IconUsers className="h-5 w-5" />}
            accent="green"
          />
          <PortalSummaryStat
            label="Job sites"
            value={stats.jobSites}
            icon={<IconBuilding className="h-5 w-5" />}
            accent="slate"
          />
        </div>
      )}

      <PortalFilterPanel title="Search & filter">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <PortalFilterField label="Keywords">
            <Input
              placeholder="Company, contact, or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={portalFieldClassName}
            />
          </PortalFilterField>
          <PortalFilterField label="Salesman">
            <Select
              value={salesmanFilter}
              onChange={(e) => setSalesmanFilter(e.target.value)}
              className={portalFieldClassName}
            >
              <option value="">All salesmen</option>
              {salesmen.map((salesman) => (
                <option key={salesman} value={salesman}>
                  {salesman}
                </option>
              ))}
            </Select>
          </PortalFilterField>
          <PortalFilterField label="Customer type">
            <Select
              value={customerTypeFilter}
              onChange={(e) => setCustomerTypeFilter(e.target.value)}
              className={portalFieldClassName}
            >
              <option value="">All types</option>
              {customerTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </Select>
          </PortalFilterField>
          <PortalFilterField label="Status">
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={portalFieldClassName}
            >
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </Select>
          </PortalFilterField>
        </div>
      </PortalFilterPanel>

      {isLoading && <LoadingState />}
      {!isLoading && filtered.length === 0 && (
        <EmptyState
          title={data?.length ? 'No customers match your filters' : 'No customers found'}
          description="Add a customer company to manage job sites and portal users."
        />
      )}
      {filtered.length > 0 && (
        <PortalRecordsPanel title="Customer directory" count={filtered.length} countLabel="customers">
          <Table hasActions layoutFixed noHorizontalScroll compact>
            <colgroup>
              <col style={{ width: '19%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '12%' }} />
            </colgroup>
            <thead>
              <tr>
                <Th>Company</Th>
                <Th>Salesman</Th>
                <Th>Type</Th>
                <Th>Contact</Th>
                <Th>Email</Th>
                <Th className="text-center">Sites</Th>
                <Th>Status</Th>
                <ThActions />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <Td className="max-w-0">
                    <TitleCell
                      title={c.companyName}
                      subtitle={c.address ? c.address.split(',')[0] : undefined}
                    />
                  </Td>
                  <Td className="max-w-0">
                    <TruncateCell value={c.salesman} />
                  </Td>
                  <Td className="max-w-0">
                    <TruncateCell value={c.customerType} className="text-slate-600" />
                  </Td>
                  <Td className="max-w-0">
                    {c.contactName ? (
                      <PersonCell name={c.contactName} compact />
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </Td>
                  <Td className="max-w-0">
                    <TruncateCell
                      value={c.contactEmail || c.officeEmail}
                      className="text-slate-600"
                    />
                  </Td>
                  <Td className="text-center">
                    <span className="inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-lg bg-primary/10 px-1.5 text-xs font-semibold text-primary">
                      {c._count?.jobSites ?? 0}
                    </span>
                  </Td>
                  <Td>
                    <Badge status={c.status} className="rounded-full normal-case text-[10px]" />
                  </Td>
                  <Td>
                    <ActionCell>
                      <Button size="sm" variant="secondary" icon="edit" onClick={() => openEdit(c)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="softPrimary"
                        icon="userPlus"
                        onClick={() => {
                          setSelectedCustomer(c);
                          setUserModalOpen(true);
                        }}
                      >
                        User
                      </Button>
                    </ActionCell>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </PortalRecordsPanel>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Customer' : 'Add Customer'}
        subtitle={editing ? 'Update company and contact details' : 'Register a new customer company'}
        icon={editing ? 'building' : 'plus'}
        tone={editing ? 'primary' : 'success'}
        size="lg"
      >
        <form
          onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))}
          className="space-y-4"
        >
          {editLoading ? <LoadingState message="Loading customer details..." /> : null}
          <FormField label="Customer ID">
            <Input {...form.register('masterCustomerId')} className={portalFormFieldClassName} />
          </FormField>
          <FormField label="Company Name" error={form.formState.errors.companyName?.message}>
            <Input {...form.register('companyName')} className={portalFormFieldClassName} />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Salesman">
              <Input
                {...form.register('salesman')}
                placeholder="Assigned sales rep"
                className={portalFormFieldClassName}
              />
            </FormField>
            <FormField label="Customer type">
              <Input
                {...form.register('customerType')}
                placeholder="e.g. 01 Electrical"
                className={portalFormFieldClassName}
              />
            </FormField>
          </div>
          <FormField label="Office Email">
            <Input type="email" {...form.register('officeEmail')} className={portalFormFieldClassName} />
          </FormField>
          <FormField label="Street"><Input {...form.register('street')} className={portalFormFieldClassName} /></FormField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_7rem_8rem]">
            <FormField label="City"><Input {...form.register('city')} className={portalFormFieldClassName} /></FormField>
            <FormField label="State"><Input {...form.register('state')} className={portalFormFieldClassName} /></FormField>
            <FormField label="ZIP"><Input {...form.register('zip')} className={portalFormFieldClassName} /></FormField>
          </div>
          <FormField label="Status">
            <Select {...form.register('status')} className={portalFormFieldClassName}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </Select>
          </FormField>
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-800">Customer Contacts (01–10)</h3>
            {editableContacts.map((contact, index) => (
              <details key={contact.slotNumber} className="rounded-xl border border-slate-200 bg-white">
                <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700">
                  Contact {String(contact.slotNumber).padStart(2, '0')}
                  {contact.firstName || contact.lastName
                    ? ` — ${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trimEnd()
                    : ''}
                </summary>
                <div className="grid gap-3 border-t border-slate-100 p-4 sm:grid-cols-2">
                  {([
                    ['First Name', 'firstName'],
                    ['Last Name', 'lastName'],
                    ['Title', 'title'],
                    ['Email', 'email'],
                    ['Cell', 'cell'],
                    ['Office Phone', 'officePhone'],
                  ] as const).map(([label, key]) => (
                    <FormField key={key} label={label}>
                      <Input
                        type={key === 'email' ? 'email' : 'text'}
                        value={contact[key] ?? ''}
                        onChange={(event) =>
                          setEditableContacts((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, [key]: event.target.value } : item,
                            ),
                          )
                        }
                        className={portalFormFieldClassName}
                      />
                    </FormField>
                  ))}
                </div>
              </details>
            ))}
          </div>
          <ModalFooter>
            <Button type="button" variant="secondary" icon="cancel" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" icon="save" loading={saveMutation.isPending}>
              {editing ? 'Save Changes' : 'Create Customer'}
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      <Modal
        open={userModalOpen}
        onClose={() => setUserModalOpen(false)}
        title="Add Portal User"
        subtitle={selectedCustomer ? `Portal access for ${selectedCustomer.companyName}` : undefined}
        icon="userPlus"
        tone="success"
      >
        <form
          onSubmit={userForm.handleSubmit((v) => createUserMutation.mutate(v))}
          className="space-y-4"
        >
          <FormField label="Name" error={userForm.formState.errors.name?.message}>
            <Input {...userForm.register('name')} className={portalFormFieldClassName} />
          </FormField>
          <FormField label="Email" error={userForm.formState.errors.email?.message}>
            <Input type="email" {...userForm.register('email')} className={portalFormFieldClassName} />
          </FormField>
          <FormField label="Password" error={userForm.formState.errors.password?.message}>
            <Input type="password" {...userForm.register('password')} className={portalFormFieldClassName} />
          </FormField>
          <ModalFooter>
            <Button type="button" variant="secondary" icon="cancel" onClick={() => setUserModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" icon="userPlus" loading={createUserMutation.isPending}>
              Create User
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      <BulkImportModal<BulkCustomerRow>
        open={importOpen}
        onClose={() => {
          setImportOpen(false);
          queryClient.invalidateQueries({ queryKey: ['customers'] });
        }}
        title="Import Customers"
        fields={CUSTOMER_IMPORT_FIELDS}
        rowSchema={bulkCustomerRowSchema}
        onImport={(rows) => api.bulkCreateCustomers(rows)}
        templateHeaders={CUSTOMER_TEMPLATE_HEADERS}
        templateFilename="customer-import-template.xlsx"
      />
    </DashboardLayout>
  );
}
