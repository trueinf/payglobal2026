-- Phase 3: Identity & Risk, Garnishment Order Reader, Client Insight, Quality Evaluation, Customer Intent
set search_path = strada, public;
alter table conversations add column if not exists risk jsonb;        -- latest Identity & Risk assessment on the conversation
alter table conversations add column if not exists quality jsonb;     -- Quality Evaluation after close
alter table cases add column if not exists risk jsonb;
create table if not exists identity_events (
  id bigserial primary key,
  contact_id text references contacts(id),
  conversation_id text references conversations(id) on delete set null,
  kind text not null,                 -- verify_ok | verify_fail | bank_change_requested | bank_change_blocked | step_up_sent | step_up_ok | address_change
  channel text,
  detail jsonb not null default '{}',
  at timestamptz not null default now()
);
create index if not exists identity_events_contact_idx on identity_events(contact_id, at desc);
create table if not exists client_insights (
  id bigserial primary key,
  account_id text not null references accounts(id),
  period text not null,
  brief jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists client_insights_acct_idx on client_insights(account_id, created_at desc);
