-- Isolated V2 reply-sync storage. Existing manual email evidence remains unchanged.

create table public.email_reply_connections_v2 (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('GMAIL', 'OUTLOOK', 'TEST')),
  mailbox_email text not null,
  provider_account_id text,
  status text not null default 'CONNECTED' check (status in ('CONNECTED', 'ERROR', 'DISCONNECTED')),
  connected_by_user_id uuid references public.users(id) on delete set null,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, mailbox_email)
);

create table public.email_reply_credentials_v2 (
  connection_id uuid primary key references public.email_reply_connections_v2(id) on delete cascade,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text,
  access_token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.email_reply_oauth_states_v2 (
  state_hash text primary key,
  provider text not null check (provider in ('GMAIL', 'OUTLOOK')),
  requested_by_user_id uuid not null references public.users(id) on delete cascade,
  return_url text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.email_replies_v2 (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.email_reply_connections_v2(id) on delete cascade,
  provider text not null check (provider in ('GMAIL', 'OUTLOOK', 'TEST')),
  provider_message_id text not null,
  internet_message_id text,
  in_reply_to text,
  reference_ids text[] not null default '{}',
  matched_batch_id uuid references public.timesheet_delivery_batches(id) on delete set null,
  match_status text not null check (match_status in ('MATCHED', 'UNMATCHED')),
  from_email text,
  to_emails text[] not null default '{}',
  subject text,
  received_at timestamptz not null,
  body_text text,
  body_html text,
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  unique (connection_id, provider_message_id)
);

create index email_reply_connections_v2_status_idx
  on public.email_reply_connections_v2 (status, updated_at desc);
create index email_replies_v2_batch_received_idx
  on public.email_replies_v2 (matched_batch_id, received_at desc);
create index email_replies_v2_unmatched_idx
  on public.email_replies_v2 (received_at desc) where match_status = 'UNMATCHED';

alter table public.email_reply_connections_v2 enable row level security;
alter table public.email_replies_v2 enable row level security;
alter table public.email_reply_credentials_v2 enable row level security;
alter table public.email_reply_oauth_states_v2 enable row level security;
revoke all on public.email_reply_connections_v2 from anon, authenticated;
revoke all on public.email_replies_v2 from anon, authenticated;
revoke all on public.email_reply_credentials_v2 from anon, authenticated;
revoke all on public.email_reply_oauth_states_v2 from anon, authenticated;
grant select on public.email_reply_connections_v2 to authenticated;
grant select on public.email_replies_v2 to authenticated;

create policy email_reply_connections_v2_admin_read
  on public.email_reply_connections_v2 for select to authenticated
  using (public.is_admin());
create policy email_replies_v2_admin_read
  on public.email_replies_v2 for select to authenticated
  using (public.is_admin());

comment on table public.email_reply_connections_v2 is
  'V2 Gmail and Outlook mailbox connections. OAuth credentials are stored in a separate RLS-protected table with no client grants.';
comment on table public.email_replies_v2 is
  'V2 inbound replies matched to an original timesheet email by standard email thread headers.';
