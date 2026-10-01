'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/LoadingState';
import { createClient } from '@/lib/supabase/client';

type Connection = {
  id: string;
  provider: 'GMAIL' | 'OUTLOOK' | 'TEST';
  mailbox_email: string;
  status: 'CONNECTED' | 'ERROR' | 'DISCONNECTED';
  connected_at: string;
  last_synced_at: string | null;
  last_error: string | null;
};

const date = (value: string | null) => value ? new Date(value).toLocaleString() : 'Not yet';

export function EmailReplySyncPanel() {
  const client = createClient();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState('');
  const [mailboxTargets, setMailboxTargets] = useState<Record<string, string>>({});

  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get('connection');
    if (result === 'success') setNotice('Mailbox connected. Use Sync now to fetch and match replies.');
    if (result === 'failed') setNotice('The mailbox connection was not completed.');
    if (result === 'expired') setNotice('The connection request expired. Please try again.');
  }, []);

  const connections = useQuery({
    queryKey: ['email-reply-connections-v2'],
    queryFn: async () => {
      const { data, error } = await client.from('email_reply_connections_v2').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Connection[];
    },
  });

  async function invoke(body: Record<string, unknown>) {
    const { data, error } = await client.functions.invoke('email-reply-sync-v2', { body });
    if (error) {
      const response = (error as { context?: Response }).context;
      if (response) {
        try {
          const details = await response.clone().json() as { error?: string };
          if (details.error) throw new Error(details.error);
        } catch (detailsError) {
          if (detailsError instanceof Error && detailsError.message !== 'Unexpected end of JSON input') throw detailsError;
        }
      }
      if (/failed to send a request/i.test(error.message)) {
        throw new Error('Email Reply Sync V2 is not active in Supabase yet. Its database migration and Edge Function must be deployed before mailbox testing can begin.');
      }
      throw error;
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }

  const connect = useMutation({
    mutationFn: (provider: 'GMAIL' | 'OUTLOOK') => invoke({ action: 'start', provider }),
    onSuccess: (result) => { window.location.href = result.authorizationUrl; },
    onError: (error: Error) => setNotice(error.message),
  });

  const sync = useMutation({
    mutationFn: (input: { connectionId: string; mailboxEmail: string }) => invoke({ action: 'sync', ...input }),
    onSuccess: async (result) => {
      setNotice(`Sync finished for ${result.mailboxEmail ?? 'mailbox'}: ${result.checked} checked, ${result.matched} matched, ${result.unmatched} unmatched replies, ${result.skipped} unrelated messages ignored.`);
      await queryClient.invalidateQueries({ queryKey: ['email-reply-connections-v2'] });
    },
    onError: (error: Error) => setNotice(error.message),
  });

  const disconnect = useMutation({
    mutationFn: (connectionId: string) => invoke({ action: 'disconnect', connectionId }),
    onSuccess: async () => {
      setNotice('Mailbox disconnected. Saved access credentials were removed; replies already fetched are kept.');
      await queryClient.invalidateQueries({ queryKey: ['email-reply-connections-v2'] });
    },
    onError: (error: Error) => setNotice(error.message),
  });

  const test = useMutation({
    mutationFn: () => invoke({ action: 'test' }),
    onSuccess: async (result) => {
      setNotice(result.matched
        ? 'Test passed: the synthetic reply matched the latest sent timesheet email.'
        : 'Test reply was saved but could not be matched.');
      await queryClient.invalidateQueries({ queryKey: ['email-reply-connections-v2'] });
    },
    onError: (error: Error) => setNotice(error.message),
  });

  const busy = connect.isPending || sync.isPending || disconnect.isPending || test.isPending;
  const realConnections = (connections.data ?? []).filter((connection) => connection.provider !== 'TEST');
  const visibleConnections = realConnections.filter((connection) => connection.status !== 'DISCONNECTED');
  const connectedCount = realConnections.filter((connection) => connection.status === 'CONNECTED').length;

  return <div className="space-y-5"><div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
      <strong>Safe V2 test area.</strong> Connecting or testing here does not remove existing sent emails, imports, approvals, or evidence records.
    </div>
    {connections.isError ? <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <strong>V2 setup is not active yet.</strong> Deploy the V2 database migration and Edge Function before using the connection or test buttons.
    </div> : null}
    {notice ? <div role="status" className="mb-5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700">{notice}</div> : null}

    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900">Connect a reply mailbox</h2>
      <p className="mt-1 text-sm text-slate-600">The mailbox owner signs in on Google or Microsoft. Their password is never shown to this app.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button type="button" disabled={busy} onClick={() => connect.mutate('GMAIL')}>Connect Gmail</Button>
        <Button type="button" disabled={busy} variant="secondary" onClick={() => connect.mutate('OUTLOOK')}>Connect Outlook</Button>
        <Button type="button" disabled={busy} variant="secondary" onClick={() => test.mutate()}>Run safe matching test</Button>
      </div>
      <p className="mt-3 text-xs text-slate-500">The safe test creates one clearly marked synthetic reply and never reads a real mailbox. Outlook shared inboxes require Microsoft shared-mailbox read permission; reconnect Outlook after this change to approve it.</p>
    </section>

    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Connected mailboxes</h2>
          <p className="mt-1 text-sm text-slate-600">Automatic scheduling can be enabled after a real mailbox is approved and tested.</p>
        </div>
        <div className="text-sm text-slate-600">{connectedCount} connected</div>
      </div>
      {connections.isLoading ? <LoadingState /> : visibleConnections.length ? <div className="mt-4 space-y-3">
      {visibleConnections.map((connection) => <article key={connection.id} className="rounded-xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-slate-900">{connection.mailbox_email}</div>
              <div className="mt-1 text-xs text-slate-500">{connection.provider} · {connection.status} · Last sync: {date(connection.last_synced_at)}</div>
              {connection.last_error ? <div className="mt-2 text-sm text-red-700">{connection.last_error}</div> : null}
              {connection.provider === 'OUTLOOK' ? <label className="mt-3 block text-xs font-medium text-slate-600">Inbox to read (enter the shared mailbox address if applicable)<input type="email" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={mailboxTargets[connection.id] ?? connection.mailbox_email} onChange={(event) => setMailboxTargets((current) => ({ ...current, [connection.id]: event.target.value }))} /></label> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {connection.status !== 'DISCONNECTED' ? <Button type="button" disabled={busy} loading={sync.isPending} loadingText="Syncing…" aria-busy={sync.isPending} onClick={() => sync.mutate({ connectionId: connection.id, mailboxEmail: mailboxTargets[connection.id] ?? connection.mailbox_email })}>Sync now</Button> : null}
              {connection.status !== 'DISCONNECTED' ? <Button type="button" disabled={busy} variant="secondary" onClick={() => {
                if (window.confirm(`Disconnect ${connection.mailbox_email}? This removes the saved mailbox credentials. Replies already fetched will remain.`)) {
                  disconnect.mutate(connection.id);
                }
              }}>Disconnect</Button> : null}
            </div>
          </div>
        </article>)}
      </div> : <p className="mt-4 rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-600">No mailboxes are currently connected.</p>}
    </section>

  </div>;
}
