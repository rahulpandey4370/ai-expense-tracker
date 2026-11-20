-- AI chat: saved conversations (ADK sessions + events) and long-term memory.
-- Run once in the Supabase SQL Editor (after schema.sql). Safe to re-run.
-- Only the 10 most recently used chats are kept; the app prunes older ones.

-- One row per conversation. `state` is the ADK session state.
create table if not exists chat_sessions (
  id text primary key,
  app_name text not null default 'finwise',
  user_id text not null default 'me',
  title text not null default 'New chat',
  kind text not null default 'chat' check (kind in ('chat', 'review')),
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists chat_sessions_recent on chat_sessions (app_name, user_id, updated_at desc);

-- Every ADK event in a conversation, in order. Deleting a chat deletes these.
create table if not exists chat_events (
  id text primary key,
  session_id text not null references chat_sessions(id) on delete cascade,
  ts double precision not null,
  data jsonb not null
);
create index if not exists chat_events_by_session on chat_events (session_id, ts);

-- Short facts the assistant was told to remember ("Tanshu is my flatmate").
create table if not exists ai_memories (
  id text primary key,
  fact text not null,
  source_session_id text references chat_sessions(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Service-role key bypasses RLS; RLS with no policies blocks the public anon key.
alter table chat_sessions enable row level security;
alter table chat_events enable row level security;
alter table ai_memories enable row level security;

-- ---------------------------------------------------------------------------
-- Monthly review on the 1st at 8 AM IST (02:30 UTC). Replace the two
-- placeholders, then run. To change it: select cron.unschedule('finwise-monthly-review');
-- ---------------------------------------------------------------------------
-- select cron.schedule(
--   'finwise-monthly-review',
--   '30 2 1 * *',
--   $$
--   select net.http_post(
--     url := 'https://YOUR-APP-DOMAIN/api/review/monthly',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer YOUR_CRON_SECRET',
--       'Content-Type', 'application/json'
--     ),
--     body := '{}'::jsonb,
--     timeout_milliseconds := 60000
--   );
--   $$
-- );
