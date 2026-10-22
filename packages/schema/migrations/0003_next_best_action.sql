-- Next Best Action Agent output per live conversation (supervisor monitoring view)
set search_path = strada, public;
alter table conversations add column if not exists nba jsonb;
alter table conversations add column if not exists nba_at timestamptz;
