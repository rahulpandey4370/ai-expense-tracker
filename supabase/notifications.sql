-- Push notifications + SMS-to-transaction inbox.
-- Run once in the Supabase SQL Editor (after schema.sql), then run the
-- cron block at the bottom with your app URL and CRON_SECRET filled in.

-- One row per device that enabled notifications (Web Push subscription).
create table if not exists push_subscriptions (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

-- Bank SMS forwarded by the iPhone Shortcut, parsed by AI, waiting for you to
-- confirm or dismiss. Confirming creates a real row in transactions.
create table if not exists pending_transactions (
  id text primary key,
  raw_text text not null,
  sender text,
  text_hash text not null unique,          -- same SMS sent twice is ignored
  account_hint text,                       -- last digits of card/account seen in the SMS
  date date not null,
  amount numeric not null check (amount > 0),
  description text not null,
  category_id text references categories(id) on delete set null,
  payment_method_id text references payment_methods(id) on delete set null,
  expense_type text check (expense_type in ('need', 'want', 'investment', 'investment_expense')),
  confidence numeric,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'dismissed')),
  transaction_id text references transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists pending_transactions_status_idx on pending_transactions (status, created_at desc);

-- Learned from your confirmations: card/account digits -> payment method,
-- so the next SMS from the same card gets the right payment method without AI guessing.
create table if not exists sms_account_hints (
  account_hint text primary key,
  payment_method_id text not null references payment_methods(id) on delete cascade,
  updated_at timestamptz not null default now()
);

-- Keys of one-off notifications already sent (e.g. budget:<id>:2026-11:80),
-- so a budget alert fires once per threshold per month.
create table if not exists notification_log (
  key text primary key,
  sent_at timestamptz not null default now()
);

-- The app talks to Supabase with the service-role key, which bypasses RLS.
-- Turning RLS on (with no policies) blocks the public anon key from these tables.
alter table push_subscriptions enable row level security;
alter table pending_transactions enable row level security;
alter table sms_account_hints enable row level security;
alter table notification_log enable row level security;

-- ---------------------------------------------------------------------------
-- 9 PM IST daily job (15:30 UTC). Replace the two placeholders, then run.
-- To change it later: select cron.unschedule('finwise-daily-9pm'); and re-run.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'finwise-daily-9pm',
  '30 15 * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-APP-DOMAIN/api/notify/daily',
    headers := jsonb_build_object(
      'Authorization', 'Bearer YOUR_CRON_SECRET',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
