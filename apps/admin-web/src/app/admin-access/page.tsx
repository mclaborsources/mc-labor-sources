'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { BrandPageTitle } from '@/components/brand';
import { PassCodeDialog } from '@/components/ui/PassCodeDialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import { createClient } from '@/lib/supabase/client';
import { Modal, ModalFooter } from '@/components/ui/Modal';

type AdminAccount = { id: string; name: string; email: string; isSelf: boolean };

export default function AdminAccessPage() {
  const router = useRouter();
  const [passCode, setPassCode] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [selected, setSelected] = useState<AdminAccount | null>(null);
  const [removeError, setRemoveError] = useState('');

  async function request(action: 'unlock' | 'create' | 'list' | 'remove', accountId?: string) {
    const { data } = await createClient().auth.getSession();
    if (!data.session) throw new Error('Your session expired. Sign in again.');
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/manage-admin-access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}`, apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
      body: JSON.stringify({ action, passCode, accountId, ...(action === 'create' ? { name, email, password } : {}) }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to complete the request.');
    return result;
  }

  async function unlock(event: FormEvent) {
    event.preventDefault();
    setPending(true); setError('');
    try { await request('unlock'); setAccounts((await request('list')).accounts); setUnlocked(true); }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to unlock.'); }
    finally { setPending(false); }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    setError(''); setSuccess('');
    if (password !== confirmation) { setError('Passwords do not match.'); return; }
    setPending(true);
    try {
      const result = await request('create');
      setSuccess(`Admin account created for ${result.name} (${result.email}). They can now sign in to the web portal. Share their login details securely.`);
      setName(''); setEmail(''); setPassword(''); setConfirmation('');
      setAccounts((await request('list')).accounts);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to create account.'); }
    finally { setPending(false); }
  }

  async function remove() {
    if (!selected) return;
    setPending(true); setRemoveError(''); setError(''); setSuccess('');
    try {
      await request('remove', selected.id);
      setAccounts(current => current.filter(account => account.id !== selected.id));
      setSuccess(`Admin access removed for ${selected.email}.`);
      setSelected(null);
    } catch (err) { setRemoveError(err instanceof Error ? err.message : 'Unable to remove account.'); }
    finally { setPending(false); }
  }

  return <DashboardLayout heroTitle="Admin Access">
    <BrandPageTitle title="Admin Access" description="Create accounts with full access to the web portal" />
    <PassCodeDialog open={!unlocked} value={passCode} error={error} pending={pending} onChange={setPassCode} onCancel={() => router.push('/assignments')} onSubmit={unlock} />
    {unlocked && <div className="grid items-start gap-6 lg:grid-cols-2">
    <section className="min-w-0 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 className="brand-section-title text-lg">Create admin account</h2>
        <Button variant="secondary" disabled={pending} onClick={() => { setUnlocked(false); setPassCode(''); setPassword(''); setConfirmation(''); setError(''); setSuccess(''); }}>Lock page</Button>
      </div>
      <p className="mb-5 text-sm text-gray-600">New administrators can manage all weeks, employees, customers, timesheets, imports, settings, and admin access.</p>
      <form onSubmit={create} className="space-y-4">
        <fieldset disabled={pending} className="space-y-4">
          <FormField label="Full name"><Input required maxLength={200} value={name} onChange={e => setName(e.target.value)} autoComplete="off" /></FormField>
          <FormField label="Email address"><Input required type="email" maxLength={254} value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" /><p className="mt-1 text-xs text-gray-500">An employee can use the same email. Their employee login stays separate.</p></FormField>
          <FormField label="Password"><Input required type="password" minLength={8} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" /><p className="mt-1 text-xs text-gray-500">At least 8 characters. This is the new user's sign-in password.</p></FormField>
          <FormField label="Confirm password"><Input required type="password" minLength={8} maxLength={128} value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="new-password" /></FormField>
        </fieldset>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {success && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{success}</p>}
        <Button type="submit" icon="userPlus" loading={pending}>Create admin account</Button>
      </form>
    </section>
      <section aria-labelledby="admin-accounts-title" className="flex h-[min(620px,70dvh)] min-h-[240px] min-w-0 flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 px-6 py-5">
          <h2 id="admin-accounts-title" className="brand-section-title text-lg">Admin accounts created here</h2>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">{accounts.length}</span>
        </header>
        <div tabIndex={0} role="region" aria-label="Created admin accounts" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 [scrollbar-gutter:stable]">
        {!accounts.length && <p className="py-6 text-sm text-gray-500">No accounts created here yet.</p>}
        <ul className="space-y-3 py-4">
          {accounts.map(account => <li key={account.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 border-l-4 border-l-blue-500 bg-blue-50/70 px-4 py-4 transition-colors hover:bg-blue-100/70">
            <div className="min-w-0 flex-1"><p className="break-words font-semibold text-slate-900">{account.name}{account.isSelf ? ' (you)' : ''}</p><p className="mt-1 break-all text-sm text-slate-600">{account.email}</p></div>
            <Button variant="danger" disabled={pending || account.isSelf} onClick={() => { setSelected(account); setRemoveError(''); }}>Remove</Button>
          </li>)}
        </ul>
        </div>
      </section>
    </div>}
    <Modal open={!!selected} onClose={() => { if (!pending) setSelected(null); }} title="Remove admin account?">
      <p className="text-sm text-gray-600">Remove web portal access for <strong>{selected?.name}</strong> ({selected?.email})? Their login will be deleted. Historical business records will be kept.</p>
      {removeError && <p role="alert" className="mt-3 text-sm text-red-700">{removeError}</p>}
      <ModalFooter><Button variant="secondary" disabled={pending} onClick={() => setSelected(null)}>Cancel</Button><Button variant="danger" loading={pending} onClick={remove}>Remove account</Button></ModalFooter>
    </Modal>
  </DashboardLayout>;
}
