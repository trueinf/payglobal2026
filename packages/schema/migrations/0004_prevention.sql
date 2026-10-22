-- Phase 2: event-driven agents (Pay Event Sentinel, Incident Clustering, Day-7 Resolution Verifier)
set search_path = strada, public;
alter table cases add column if not exists remedy jsonb;              -- {type, reference, dispatched_at, expected_settlement} mirrored from Strada payments
alter table cases add column if not exists verified_at timestamptz;   -- Day-7 verifier confirmed the remedy settled
alter table cases add column if not exists verification jsonb;        -- {outcome: settled|reopened, checked_at, detail}
alter table cases add column if not exists incident jsonb;            -- on an incident (parent) case: {affected, pay_group, code, root_cause, confidence, client_notified_at}
alter table cases add column if not exists created_by text;           -- 'Pay Event Sentinel' etc. for proactively opened cases
alter table alerts add column if not exists agent text;               -- which agent sent it
alter table alerts add column if not exists read_at timestamptz;
alter table alerts add column if not exists title text;
create index if not exists alerts_contact_idx on alerts(contact_id, sent_at desc);
