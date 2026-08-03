'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { BrandPageTitle } from '@/components/brand';
import { BRAND_HERO_IMAGES } from '@/lib/navigation';
import { PortalRecordsPanel, PersonCell } from '@/components/portal';
import { Button } from '@/components/ui/Button';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { DESTRUCTIVE_ACTION_PASS_CODE, PassCodeDialog } from '@/components/ui/PassCodeDialog';
import { Table, Th, Td, ThActions } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { api, type PortalAccount } from '@/lib/api-client';

export default function PortalAccessPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedAccount, setSelectedAccount] = useState<PortalAccount | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [passCodeOpen, setPassCodeOpen] = useState(false);
  const [passCode, setPassCode] = useState('');
  const [passCodeError, setPassCodeError] = useState('');

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['worker-portal-accounts'],
    queryFn: () => api.getWorkerPortalAccounts(),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deletePortalAccount(selectedAccount!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worker-portal-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      setDeleteOpen(false);
      setPassCodeOpen(false);
      setPassCode('');
      setPassCodeError('');
      setSelectedAccount(null);
    },
    onError: (error: Error) => {
      setPassCodeError(error.message || 'Failed to delete portal access');
    },
  });

  function confirmDelete(event: FormEvent) {
    event.preventDefault();
    if (passCode.trim() !== DESTRUCTIVE_ACTION_PASS_CODE) {
      setPassCodeError('Incorrect pass code.');
      return;
    }
    deleteMutation.mutate();
  }

  return (
    <DashboardLayout heroTitle="Portal Access" heroImage={BRAND_HERO_IMAGES.inner}>
      <BrandPageTitle
        title="Portal Access"
        description="View and manage employee accounts that can sign in to the Worker Portal"
        action={
          <Button icon="userPlus" onClick={() => router.push('/employees')}>
            Add Portal Access
          </Button>
        }
      />

      {isLoading ? <LoadingState /> : null}
      {!isLoading && !accounts?.length ? (
        <EmptyState
          title="No portal accounts"
          description="No workers currently have access to the Worker Portal. Open Employees to create an account."
        />
      ) : null}

      {accounts?.length ? (
        <PortalRecordsPanel title="Worker portal accounts" count={accounts.length} countLabel="accounts">
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
              {accounts.map((account) => (
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
                        setSelectedAccount(account);
                        setDeleteOpen(true);
                      }}
                    >
                      Delete Portal Access
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </PortalRecordsPanel>
      ) : null}

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete Portal Access?"
        subtitle="This removes the portal login but keeps the employee and their records."
        icon="trash"
        tone="danger"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            The portal login for <strong>{selectedAccount?.name}</strong> using{' '}
            <strong>{selectedAccount?.email}</strong> will be deleted.
          </div>
          <ModalFooter>
            <Button type="button" variant="secondary" icon="cancel" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              icon="trash"
              onClick={() => {
                setPassCode('');
                setPassCodeError('');
                setPassCodeOpen(true);
              }}
            >
              Delete Portal Access
            </Button>
          </ModalFooter>
        </div>
      </Modal>

      <PassCodeDialog
        open={passCodeOpen}
        value={passCode}
        error={passCodeError}
        pending={deleteMutation.isPending}
        onChange={(value) => {
          setPassCode(value);
          if (passCodeError) setPassCodeError('');
        }}
        onCancel={() => {
          if (deleteMutation.isPending) return;
          setPassCodeOpen(false);
          setPassCode('');
          setPassCodeError('');
        }}
        onSubmit={confirmDelete}
      />
    </DashboardLayout>
  );
}
