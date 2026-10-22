-- Phase 1: employee-facing assistant sessions (Strada Pay chat + voice) before a conversation reaches the queue.
set search_path = strada, public;

-- state 'Assistant' = the Strada Pay assistant is handling it (not yet in a queue); then Open → Active → Wrap-up → Closed
alter table conversations add column if not exists verified boolean not null default false;
alter table conversations add column if not exists verify_method text;
alter table conversations add column if not exists transferred_by text;          -- 'Strada Pay assistant' when handed over with context
alter table conversations add column if not exists transfer_reason text;
alter table conversations add column if not exists handled_by_assistant boolean not null default false;

-- audio for the representative side of a voice conversation (ElevenLabs TTS), keyed by transcript line
create table if not exists voice_audio (
  line_id bigint primary key references transcript_lines(id) on delete cascade,
  mime text not null default 'audio/mpeg',
  bytes bytea not null,
  created_at timestamptz not null default now()
);
alter table conversations add column if not exists assigned_to text;        -- representative name once accepted
