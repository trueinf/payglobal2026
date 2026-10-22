-- Phase 2b: agents that work on an open case (Payslip Variance Explainer, State & Tax Rules, Complete-Case Referral)
set search_path = strada, public;
alter table cases add column if not exists findings jsonb not null default '{}';   -- {variance: {...}, rules: {...}} keyed by agent output
alter table referrals add column if not exists status text not null default 'preparing';   -- preparing | incomplete | submitted | accepted
alter table referrals add column if not exists missing text[] not null default '{}';
alter table referrals add column if not exists updated_at timestamptz not null default now();
alter table referrals add column if not exists expected_by text;
