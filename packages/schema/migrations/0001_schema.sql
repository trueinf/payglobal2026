-- Strada live prototype — core schema. Applied identically to Supabase (project insightedge) and local dev.
create schema if not exists strada;
set search_path to strada, public;

create table if not exists accounts (
  id text primary key,
  name text not null,
  pay_groups text[] not null default '{}',
  state text not null,
  payroll_lead_contact_id text
);

create table if not exists contacts (
  id text primary key,
  name text not null,
  account_id text not null references accounts(id),
  employee_id text not null unique,
  email text not null,
  phone text,
  state text not null,
  pay_group text not null,
  role text not null default 'employee'  -- employee | client_lead
);

create table if not exists queues (
  id text primary key,
  name text not null
);

create table if not exists cases (
  id text primary key,
  number text not null unique,
  title text not null,
  customer_id text not null references contacts(id),
  account_id text not null references accounts(id),
  subject text not null default '',
  priority text not null default 'Normal',       -- High | Normal | Low
  status text not null default 'In Progress',    -- In Progress | On Hold | Waiting for Details | Researching | Resolved
  origin text not null default 'Web',            -- Email | Phone | Web | Chat
  type text not null default 'Problem',          -- Problem | Question | Request
  product text not null default 'US Payroll',
  description text not null default '',
  owner text not null default 'Priya Natarajan',
  queue_id text references queues(id),
  parent_id text references cases(id),
  entitlement text,
  escalated boolean not null default false,
  escalated_on timestamptz,
  first_response_sent boolean not null default false,
  follow_up_by timestamptz,
  first_response_by timestamptz,
  resolve_by timestamptz,
  intent text not null default 'Unclassified',
  script_id text,
  article_ids text[] not null default '{}',
  ai_created boolean not null default false,
  ai_updated boolean not null default false,
  ai_fields text[] not null default '{}',
  suggestions_pending boolean not null default false,
  summary text not null default '',
  highlights text[] not null default '{}',
  resolution text,
  created_on timestamptz not null default now(),
  modified_on timestamptz not null default now(),
  resolved_on timestamptz
);
create index if not exists cases_modified_idx on cases(modified_on desc);
create index if not exists cases_parent_idx on cases(parent_id);

create table if not exists activities (
  id text primary key,
  case_id text not null references cases(id) on delete cascade,
  type text not null,              -- email | chat | call | appointment | task | note | autopost
  direction text,                  -- in | out
  from_name text not null,
  subject text not null,
  body text,
  transcript jsonb,                -- [{who,text,at}]
  at timestamptz not null default now(),
  modified_at timestamptz not null default now(),
  status text,                     -- Open | Closed | Overdue | Completed
  due timestamptz,
  ai_generated boolean not null default false,
  agent text                        -- which agent wrote it, if any
);
create index if not exists activities_case_idx on activities(case_id, modified_at desc);

create table if not exists conversations (
  id text primary key,
  channel text not null,                 -- voice | chat
  state text not null default 'Open',    -- Open | Active | Wrap-up | Closed
  customer_id text references contacts(id),
  case_id text references cases(id),
  queue_id text references queues(id),
  started_at timestamptz not null default now(),
  accepted_at timestamptz,
  ended_at timestamptz,
  closed_at timestamptz,
  waiting_seconds int not null default 0,
  sentiment text not null default 'Neutral',
  recording boolean not null default true,
  disposition_code text,
  notes text not null default '',
  intent text,
  summary text not null default '',
  external_id text                        -- ElevenLabs conversation id
);

create table if not exists transcript_lines (
  id bigserial primary key,
  conversation_id text not null references conversations(id) on delete cascade,
  who text not null,                      -- Customer | Voice agent | Representative | System
  text text not null,
  at timestamptz not null default now()
);
create index if not exists transcript_conv_idx on transcript_lines(conversation_id, id);

create table if not exists knowledge_articles (
  id text primary key,
  title text not null,
  snippet text not null,
  body text[] not null default '{}',
  audience text not null default 'Internal',   -- Internal | External
  status text not null default 'Published',    -- Published | Draft | In review
  kb text not null default 'Shared rules',
  likes int not null default 0,
  views int not null default 0,
  modified timestamptz not null default now(),
  draft_from_case text references cases(id)
);

create table if not exists agent_scripts (
  id text primary key,
  name text not null,
  intent text not null,
  steps jsonb not null                        -- [{id,name,kind,text?,action?}]
);

create table if not exists agent_runs (
  id bigserial primary key,
  agent text not null,
  trigger text not null,                      -- event | conversation | api | schedule
  subject_type text,                          -- case | conversation | account
  subject_id text,
  status text not null default 'running',     -- running | done | failed | waiting
  input jsonb,
  tool_calls jsonb not null default '[]',
  output jsonb,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists agent_runs_subject_idx on agent_runs(subject_type, subject_id, started_at desc);

create table if not exists events (
  id bigserial primary key,
  type text not null,                         -- case.created, case.resolved, conversation.ended, ach.returned, timesheet.unapproved, payslip.published, w2.ready, ...
  payload jsonb not null default '{}',
  source text not null default 'runtime',
  at timestamptz not null default now(),
  processed_by text[] not null default '{}'
);
create index if not exists events_at_idx on events(at desc);

create table if not exists alerts (
  id bigserial primary key,
  contact_id text references contacts(id),
  account_id text references accounts(id),
  kind text not null,                         -- timesheet_reminder | ach_return | payslip_ready | w2_ready | address_check | status_update
  channel text not null default 'sms',
  message text not null,
  action_url text,
  sent_at timestamptz not null default now(),
  related_case_id text references cases(id)
);

create table if not exists referrals (
  id bigserial primary key,
  case_id text not null references cases(id),
  request_type text not null,                 -- reissue | correction | off_cycle | w2c | garnishment_dispute
  target text not null default 'Strada Assist',
  checklist jsonb not null default '[]',      -- [{item, satisfied, source}]
  complete boolean not null default false,
  package jsonb not null default '{}',
  strada_reference text,
  created_at timestamptz not null default now()
);

create table if not exists settings (
  key text primary key,
  value jsonb not null
);
insert into settings(key, value) values ('demo_clock', '{"offset_seconds": 0}') on conflict do nothing;

-- notify the runtime on every event so WebSocket fan-out needs no polling
create or replace function strada.notify_event() returns trigger language plpgsql as $$
begin
  perform pg_notify('strada_events', json_build_object('id', new.id, 'type', new.type)::text);
  return new;
end $$;
drop trigger if exists events_notify on events;
create trigger events_notify after insert on events for each row execute function strada.notify_event();

create or replace function strada.touch_case() returns trigger language plpgsql as $$
begin
  update strada.cases set modified_on = now() where id = new.case_id;
  return new;
end $$;
drop trigger if exists activities_touch on activities;
create trigger activities_touch after insert on activities for each row execute function strada.touch_case();
