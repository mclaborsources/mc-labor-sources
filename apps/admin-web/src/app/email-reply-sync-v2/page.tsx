'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { BrandPageTitle } from '@/components/brand';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/LoadingState';
import { BRAND_HERO_IMAGES } from '@/lib/navigation';
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

type Reply = {
  id: string;
  provider: string;
  matched_batch_id: string | null;
  match_status: 'MATCHED' | 'UNMATCHED';
  from_email: string | null;
  subject: string | null;
  received_at: string;
  body_text: string | null;
  is_test: boolean;
};

const date = (value: string | null) => value ? new Date(value).toLocaleString() : 'Not yet';

export default function EmailReplySyncV2Page() {
  const client = createClient();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState('');

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

  const replies = useQuery({
    queryKey: ['email-replies-v2'],
    queryFn: async () => {
      const { data, error } = await client.from('email_replies_v2').select('*').order('received_at', { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as Reply[];
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
    mutationFn: (connectionId: string) => invoke({ action: 'sync', connectionId }),
    onSuccess: async (result) => {
      setNotice(`Sync finished: ${result.checked} checked, ${result.matched} matched, ${result.unmatched} unmatched replies, ${result.skipped} unrelated messages ignored.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['email-reply-connections-v2'] }),
        queryClient.invalidateQueries({ queryKey: ['email-replies-v2'] }),
      ]);
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['email-reply-connections-v2'] }),
        queryClient.invalidateQueries({ queryKey: ['email-replies-v2'] }),
      ]);
    },
    onError: (error: Error) => setNotice(error.message),
  });

  const busy = connect.isPending || sync.isPending || disconnect.isPending || test.isPending;
  const realConnections = (connections.data ?? []).filter((connection) => connection.provider !== 'TEST');
  const visibleConnections = realConnections.filter((connection) => connection.status !== 'DISCONNECTED');
  const connectedCount = realConnections.filter((connection) => connection.status === 'CONNECTED').length;
  const matchedCount = (replies.data ?? []).filter((reply) => reply.match_status === 'MATCHED').length;
  const unmatchedCount = (replies.data ?? []).filter((reply) => reply.match_status === 'UNMATCHED').length;

  return <DashboardLayout heroTitle="Email Reply Sync V2" heroImage={BRAND_HERO_IMAGES.inner}>
    <BrandPageTitle
      title="Email Reply Sync V2"
      description="A separate test version for connecting Gmail or Outlook and matching customer replies to the original timesheet email. The existing email-evidence workflow is unchanged."
    />

    <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
      <strong>Safe V2 test area.</strong> Connecting or testing here does not remove existing sent emails, imports, approvals, or evidence records.
    </div>
    {connections.isError || replies.isError ? <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
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
      <p className="mt-3 text-xs text-slate-500">The safe test creates one clearly marked synthetic reply and never reads a real mailbox.</p>
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
            </div>
            <div className="flex flex-wrap gap-2">
              {connection.status === 'CONNECTED' ? <Button type="button" disabled={busy} onClick={() => sync.mutate(connection.id)}>Sync now</Button> : null}
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

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">V2 replies</h2>
          <p className="mt-1 text-sm text-slate-600">Matched replies are linked by email thread headers. Unmatched messages stay separate for review.</p>
        </div>
        <div className="text-sm text-slate-600">{matchedCount} matched · {unmatchedCount} unmatched</div>
      </div>
      {replies.isLoading ? <LoadingState /> : (replies.data ?? []).length ? <div className="mt-4 space-y-3">
        {(replies.data ?? []).map((reply) => <article key={reply.id} className="rounded-xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-slate-900">{reply.subject || '(No subject)'}</div>
              <div className="mt-1 text-xs text-slate-500">From {reply.from_email || 'unknown sender'} · {date(reply.received_at)} · {reply.provider}{reply.is_test ? ' · TEST' : ''}</div>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${reply.match_status === 'MATCHED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{reply.match_status}</span>
          </div>
          {reply.body_text ? <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{reply.body_text.slice(0, 500)}</p> : null}
          {reply.matched_batch_id ? <p className="mt-3 text-xs text-slate-500">Matched email batch: {reply.matched_batch_id}</p> : null}
        </article>)}
      </div> : <p className="mt-4 rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-600">No V2 replies have been collected.</p>}
    </section>
  </DashboardLayout>;
}
