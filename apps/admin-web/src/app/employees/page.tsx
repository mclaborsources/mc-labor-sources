'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  createWorkerUserSchema,
  bulkEmployeeRowSchema,
  EmployeeStatus,
  type CreateEmployeeInput,
  type CreateWorkerUserInput,
  type BulkEmployeeRow,
} from '@mc-labor/shared';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { BrandPageTitle } from '@/components/brand';
import { BRAND_HERO_IMAGES } from '@/lib/navigation';
import {
  PortalFilterPanel,
  PortalRecordsPanel,
  PortalSummaryStat,
  portalFieldClassName,
  portalFormFieldClassName,
  PersonCell,
  ActionCell,
} from '@/components/portal';
import { IconUsers, IconBriefcase } from '@/components/dashboard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { FormField } from '@/components/ui/FormField';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { DESTRUCTIVE_ACTION_PASS_CODE, PassCodeDialog } from '@/components/ui/PassCodeDialog';
import { Table, Th, Td, ThActions } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { api, type Employee, type PortalAccount } from '@/lib/api-client';
import { BulkImportModal } from '@/components/import/BulkImportModal';

const EMPLOYEE_IMPORT_FIELDS = [
  { key: 'firstName', label: 'First Name', required: true },
  { key: 'lastName', label: 'Last Name', required: true },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'position', label: 'Position' },
  { key: 'hourlyRate', label: 'Hourly Rate' },
  { key: 'status', label: 'Status' },
  { key: 'password', label: 'Portal Password' },
];

const EMPLOYEE_TEMPLATE_HEADERS = EMPLOYEE_IMPORT_FIELDS.map((f) => f.label);

export default function EmployeesPage() {
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [createPortalAccess, setCreatePortalAccess] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [portalAccountsModalOpen, setPortalAccountsModalOpen] = useState(false);
  const [deletePortalModalOpen, setDeletePortalModalOpen] = useState(false);
  const [deletePortalPassCodeOpen, setDeletePortalPassCodeOpen] = useState(false);
  const [deletePortalPassCode, setDeletePortalPassCode] = useState('');
  const [deletePortalPassCodeError, setDeletePortalPassCodeError] = useState('');
  const [portalError, setPortalError] = useState('');
  const [editing, setEditing] = useState<Employee | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [selectedPortalAccount, setSelectedPortalAccount] = useState<PortalAccount | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['employees', search],
    queryFn: () => api.getEmployees({ search }),
  });

  const stats = useMemo(() => {
    const employees = data ?? [];
    return {
      total: employees.length,
      active: employees.filter((e) => e.status === 'ACTIVE').length,
    };
  }, [data]);

  const form = useForm<CreateEmployeeInput>({
    resolver: async (data, context, options) =>
      zodResolver(editing ? updateEmployeeSchema : createEmployeeSchema)(data, context, options),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      position: '',
      status: EmployeeStatus.ACTIVE,
    },
  });

  const userForm = useForm<CreateWorkerUserInput>({
    resolver: zodResolver(createWorkerUserSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: CreateEmployeeInput) => {
      const payload = {
        ...values,
        email: values.email || undefined,
        hourlyRate: values.hourlyRate ? Number(values.hourlyRate) : undefined,
        billRate: values.billRate ? Number(values.billRate) : undefined,
      };
      if (editing) {
        return api.updateEmployee(editing.id, payload);
      }
      return api.createEmployee(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      closeModal();
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: (emp: Employee) =>
      api.updateEmployee(emp.id, {
        status: emp.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employees'] }),
  });

  const createUserMutation = useMutation({
    mutationFn: (values: CreateWorkerUserInput) =>
      api.createWorkerUser(selectedEmployee!.id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      setUserModalOpen(false);
      setPortalError('');
      userForm.reset();
    },
    onError: (err: Error) => {
      setPortalError(err.message || 'Failed to create worker user');
    },
  });

  const { data: portalAccounts, isLoading: portalAccountsLoading } = useQuery({
    queryKey: ['worker-portal-accounts'],
    queryFn: () => api.getWorkerPortalAccounts(),
    enabled: portalAccountsModalOpen,
  });

  const deletePortalMutation = useMutation({
    mutationFn: () => selectedPortalAccount
      ? api.deletePortalAccount(selectedPortalAccount.id)
      : api.deleteWorkerPortalAccess(selectedEmployee!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['worker-portal-accounts'] });
      setDeletePortalModalOpen(false);
      setDeletePortalPassCodeOpen(false);
      setDeletePortalPassCode('');
      setDeletePortalPassCodeError('');
      setUserModalOpen(false);
      setSelectedPortalAccount(null);
      setPortalError('');
    },
    onError: (err: Error) => {
      setDeletePortalPassCodeError(err.message || 'Failed to delete portal access');
    },
  });

  function confirmDeletePortalAccess(event: FormEvent) {
    event.preventDefault();
    if (deletePortalPassCode.trim() !== DESTRUCTIVE_ACTION_PASS_CODE) {
      setDeletePortalPassCodeError('Incorrect pass code.');
      return;
    }
    deletePortalMutation.mutate();
  }

  function openPortalAccess(emp: Employee) {
    setSelectedPortalAccount(null);
    setSelectedEmployee(emp);
    setPortalError('');
    userForm.reset({
      name: `${emp.firstName} ${emp.lastName}`.trim(),
      email: emp.email || '',
      password: '',
      phone: emp.phone || '',
    });
    setUserModalOpen(true);
  }

  function openCreate() {
    setEditing(null);
    form.reset({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      position: '',
      status: EmployeeStatus.ACTIVE,
    });
    setModalOpen(true);
  }

  function openEdit(emp: Employee) {
    setEditing(emp);
    form.reset({
      firstName: emp.firstName,
      lastName: emp.lastName,
      email: emp.email || '',
      phone: emp.phone || '',
      position: emp.position || '',
      hourlyRate: emp.hourlyRate != null && emp.hourlyRate !== '' ? Number(emp.hourlyRate) : undefined,
      billRate: emp.billRate != null && emp.billRate !== '' ? Number(emp.billRate) : undefined,
      status: emp.status as EmployeeStatus,
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
  }

  return (
    <DashboardLayout heroTitle="Employees" heroImage={BRAND_HERO_IMAGES.default}>
      <BrandPageTitle
        title="Employees"
        description="Manage MC Labor workforce"
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon="upload" onClick={() => setImportOpen(true)}>
              Import Employees
            </Button>
            <Button
              variant="secondary"
              icon="userMinus"
              onClick={() => setPortalAccountsModalOpen(true)}
            >
              Portal Accounts
            </Button>
            <Button icon="plus" onClick={openCreate}>
              Add Employee
            </Button>
          </div>
        }
      />

      {data && data.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-2">
          <PortalSummaryStat label="Total employees" value={stats.total} icon={<IconUsers className="h-5 w-5" />} />
          <PortalSummaryStat
            label="Active"
            value={stats.active}
            icon={<IconBriefcase className="h-5 w-5" />}
            accent="green"
          />
        </div>
      )}

      <PortalFilterPanel title="Search">
        <FormField label="Keywords">
          <Input
            placeholder="Search by name, email, or position..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={portalFieldClassName}
          />
        </FormField>
      </PortalFilterPanel>

      {isLoading && <LoadingState />}
      {!isLoading && data?.length === 0 && (
        <EmptyState title="No employees found" description="Add your first employee to get started." />
      )}
      {data && data.length > 0 && (
        <PortalRecordsPanel title="Employee directory" count={data.length} countLabel="employees">
          <Table hasActions>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Position</Th>
                <Th>Email</Th>
                <Th>Phone</Th>
                <Th>Rate</Th>
                <Th>Status</Th>
                <ThActions />
              </tr>
            </thead>
            <tbody>
              {data.map((emp) => (
                <tr key={emp.id}>
                  <Td>
                    <PersonCell name={`${emp.firstName} ${emp.lastName}`} />
                  </Td>
                  <Td>{emp.position || '—'}</Td>
                  <Td>{emp.email || '—'}</Td>
                  <Td>{emp.phone || '—'}</Td>
                  <Td>{emp.hourlyRate ? `$${emp.hourlyRate}` : '—'}</Td>
                  <Td>
                    <Badge status={emp.status} className="rounded-full normal-case" />
                  </Td>
                  <Td>
                    <ActionCell>
                      <Button size="sm" variant="secondary" icon="edit" onClick={() => openEdit(emp)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="softPrimary"
                        icon="userPlus"
                        disabled={!emp.email}
                        title={!emp.email ? 'Employee needs an email address' : undefined}
                        onClick={() => openPortalAccess(emp)}
                      >
                        Portal Access
                      </Button>
                      <Button
                        size="sm"
                        variant={emp.status === 'ACTIVE' ? 'softDanger' : 'softPrimary'}
                        icon={emp.status === 'ACTIVE' ? 'userMinus' : 'userCheck'}
                        onClick={() => toggleStatusMutation.mutate(emp)}
                      >
                        {emp.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
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
        open={portalAccountsModalOpen}
        onClose={() => setPortalAccountsModalOpen(false)}
        title="Portal Accounts"
        subtitle="Registered worker logins and the email addresses currently in use"
        icon="users"
        size="lg"
      >
        {portalAccountsLoading ? <LoadingState /> : null}
        {!portalAccountsLoading && !portalAccounts?.length ? (
          <EmptyState title="No portal accounts" description="No workers currently have portal access." />
        ) : null}
        {portalAccounts?.length ? (
          <Table hasActions>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Status</Th>
                <ThActions />
              </tr>
            </thead>
            <tbody>
              {portalAccounts.map((account) => (
                <tr key={account.id}>
                  <Td><PersonCell name={account.name} /></Td>
                  <Td>{account.email}</Td>
                  <Td><Badge status={account.status} className="rounded-full normal-case" /></Td>
                  <Td>
                    <Button
                      size="sm"
                      variant="softDanger"
                      icon="trash"
                      onClick={() => {
                        setSelectedEmployee(null);
                        setSelectedPortalAccount(account);
                        setDeletePortalModalOpen(true);
                      }}
                    >
                      Delete Portal Access
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
        <ModalFooter>
          <Button type="button" variant="secondary" icon="close" onClick={() => setPortalAccountsModalOpen(false)}>
            Close
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? 'Edit Employee' : 'Add Employee'}
        subtitle={editing ? 'Update workforce profile and status' : 'Add a new worker to your directory'}
        icon={editing ? 'edit' : 'plus'}
        tone={editing ? 'primary' : 'success'}
        size="lg"
      >
        <form onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="First Name" error={form.formState.errors.firstName?.message}>
              <Input {...form.register('firstName')} className={portalFormFieldClassName} />
            </FormField>
            <FormField label="Last Name" error={form.formState.errors.lastName?.message}>
              <Input {...form.register('lastName')} className={portalFormFieldClassName} />
            </FormField>
          </div>
          <FormField label="Email" error={form.formState.errors.email?.message}>
            <Input type="email" {...form.register('email')} className={portalFormFieldClassName} />
          </FormField>
          <FormField label="Phone">
            <Input {...form.register('phone')} className={portalFormFieldClassName} />
          </FormField>
          <FormField label="Position">
            <Input {...form.register('position')} className={portalFormFieldClassName} />
          </FormField>
          {editing?.masterEmployeeId ? (
            <FormField label="Employee ID (master)">
              <Input value={editing.masterEmployeeId} readOnly disabled className={portalFormFieldClassName} />
            </FormField>
          ) : null}
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Pay Rate">
              <Input
                type="number"
                step="0.01"
                {...form.register('hourlyRate', { valueAsNumber: true })}
                className={portalFormFieldClassName}
              />
            </FormField>
            <FormField label="Bill Rate">
              <Input
                type="number"
                step="0.01"
                {...form.register('billRate', { valueAsNumber: true })}
                className={portalFormFieldClassName}
              />
            </FormField>
          </div>
          <FormField label="Status">
            <Select {...form.register('status')} className={portalFormFieldClassName}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </Select>
          </FormField>
          <ModalFooter>
            <Button type="button" variant="secondary" icon="cancel" onClick={closeModal}>
              Cancel
            </Button>
            <Button
              type="submit"
              icon="save"
              loading={saveMutation.isPending}
            >
              {editing ? 'Save Changes' : 'Create Employee'}
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      <Modal
        open={userModalOpen}
        onClose={() => {
          setUserModalOpen(false);
          setPortalError('');
        }}
        title="Create Portal Access"
        subtitle={
          selectedEmployee
            ? `Mobile login for ${selectedEmployee.firstName} ${selectedEmployee.lastName}`
            : undefined
        }
        icon="userPlus"
        tone="success"
      >
        <form
          onSubmit={userForm.handleSubmit((v) => {
            setPortalError('');
            createUserMutation.mutate(v);
          })}
          className="space-y-4"
        >
          {portalError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {portalError}
            </p>
          ) : null}
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
            <Button
              type="button"
              variant="softDanger"
              icon="trash"
              onClick={() => {
                setPortalError('');
                setDeletePortalModalOpen(true);
              }}
              className="mr-auto"
            >
              Delete Portal Access
            </Button>
            <Button
              type="button"
              variant="secondary"
              icon="cancel"
              onClick={() => {
                setUserModalOpen(false);
                setPortalError('');
              }}
            >
              Cancel
            </Button>
            <Button type="submit" icon="userPlus" loading={createUserMutation.isPending}>
              Create User
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      <Modal
        open={deletePortalModalOpen}
        onClose={() => setDeletePortalModalOpen(false)}
        title="Delete Portal Access?"
        subtitle="This permanently removes the portal login but keeps the employee in the system."
        icon="trash"
        tone="danger"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {selectedPortalAccount ? (
              <>
                The portal login for <strong>{selectedPortalAccount.name}</strong> using{' '}
                <strong>{selectedPortalAccount.email}</strong> will be deleted. That email address will then be available
                for another portal account.
              </>
            ) : selectedEmployee ? (
              <>
                The portal login set up for <strong>{selectedEmployee.firstName} {selectedEmployee.lastName}</strong> will
                be deleted and its email address will become available for another portal account.
              </>
            ) : null}
          </div>
          <p className="text-sm text-slate-600">
            The employee will remain in the Employees list. Assignments, timesheets, attendance, and other employee
            records will not be deleted.
          </p>
          <ModalFooter>
            <Button type="button" variant="secondary" icon="cancel" onClick={() => setDeletePortalModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              icon="trash"
              loading={deletePortalMutation.isPending}
              onClick={() => {
                setDeletePortalPassCode('');
                setDeletePortalPassCodeError('');
                setDeletePortalPassCodeOpen(true);
              }}
            >
              Delete Portal Access
            </Button>
          </ModalFooter>
        </div>
      </Modal>

      <PassCodeDialog
        open={deletePortalPassCodeOpen}
        value={deletePortalPassCode}
        error={deletePortalPassCodeError}
        pending={deletePortalMutation.isPending}
        onChange={(value) => {
          setDeletePortalPassCode(value);
          if (deletePortalPassCodeError) setDeletePortalPassCodeError('');
        }}
        onCancel={() => {
          if (deletePortalMutation.isPending) return;
          setDeletePortalPassCodeOpen(false);
          setDeletePortalPassCode('');
          setDeletePortalPassCodeError('');
        }}
        onSubmit={confirmDeletePortalAccess}
      />

      <BulkImportModal<BulkEmployeeRow>
        open={importOpen}
        onClose={() => {
          setImportOpen(false);
          queryClient.invalidateQueries({ queryKey: ['employees'] });
        }}
        title="Import Employees"
        fields={EMPLOYEE_IMPORT_FIELDS}
        rowSchema={bulkEmployeeRowSchema}
        onImport={(rows) =>
          api.bulkCreateEmployees(rows, { createPortalAccess })
        }
        templateHeaders={EMPLOYEE_TEMPLATE_HEADERS}
        templateFilename="employee-import-template.xlsx"
        extraOptions={
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={createPortalAccess}
              onChange={(e) => setCreatePortalAccess(e.target.checked)}
              className="rounded border-gray-300"
            />
            Create portal logins for rows with email
          </label>
        }
      />
    </DashboardLayout>
  );
}
