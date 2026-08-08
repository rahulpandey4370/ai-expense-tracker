-- Run this once in the Supabase SQL Editor to create all tables for the
-- expense tracker. Mirrors the shapes in src/lib/types.ts. All primary keys
-- are the same cuid() text ids already used by the app (not new serial ids),
-- so existing references stay valid when data is migrated in from Azure.

create table if not exists categories (
  id text primary key,
  name text not null,
  type text not null check (type in ('income', 'expense'))
);

create table if not exists payment_methods (
  id text primary key,
  name text not null,
  type text not null
);

-- People you split expenses/reimbursables with. "Me" is never a row here --
-- it's represented by the absence of paid_by_id / a transaction's own
-- my_share on the transactions table below.
create table if not exists split_users (
  id text primary key,
  name text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists transactions (
  id text primary key,
  type text not null check (type in ('income', 'expense')),
  date date not null,
  amount numeric not null,
  description text not null,
  category_id text references categories(id),
  payment_method_id text references payment_methods(id),
  source text,
  expense_type text check (expense_type in ('need', 'want', 'investment', 'investment_expense')),
  is_split boolean,
  -- Splitting: my_share is what counts as "my" spend (defaults to the full
  -- amount via net_amount below when the transaction isn't split at all).
  -- paid_by_id is who actually paid (null = me); split_method records how
  -- the remainder was divided among transaction_splits rows.
  my_share numeric check (my_share >= 0),
  paid_by_id text references split_users(id),
  split_method text check (split_method in ('equally', 'shares', 'custom', 'not_mine')),
  -- Only meaningful when paid_by_id is set: has my own share (a debt I owe
  -- the payer) been settled? transaction_splits covers the opposite
  -- direction (what other split_users owe me).
  my_share_settled boolean not null default false,
  net_amount numeric generated always as (coalesce(my_share, amount)) stored,
  created_at timestamptz not null,
  updated_at timestamptz not null
);
create index if not exists transactions_date_idx on transactions (date desc);
create index if not exists transactions_net_amount_idx on transactions (date desc, net_amount);

create table if not exists budgets (
  id text primary key,
  name text not null,
  amount numeric not null,
  type text not null check (type in ('category', 'expenseType')),
  target_id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists goals (
  id text primary key,
  description text not null,
  target_amount numeric not null,
  target_duration_months integer not null,
  amount_saved_so_far numeric not null default 0,
  status text check (status in ('active', 'completed', 'on_hold')),
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists goal_allocations (
  id text primary key,
  goal_id text not null references goals(id) on delete cascade,
  name text not null,
  amount numeric not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);
create index if not exists goal_allocations_goal_id_idx on goal_allocations (goal_id);

create table if not exists recurring_rules (
  id text primary key,
  type text not null check (type in ('income', 'expense')),
  amount numeric not null,
  description text not null,
  category_id text references categories(id),
  payment_method_id text references payment_methods(id),
  source text,
  expense_type text check (expense_type in ('need', 'want', 'investment', 'investment_expense')),
  day_of_month integer not null,
  start_date date not null,
  end_date date,
  is_active boolean not null default true,
  last_generated_date date,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists savings_allocations (
  id text primary key,
  name text not null,
  location text not null,
  category text not null check (category in ('savings_account', 'liquid_fund', 'fd', 'rd', 'cash', 'other')),
  amount numeric not null,
  as_of_date date not null,
  notes text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

-- id format: 'monthly:YYYY-MM' or 'yearly:YYYY'
create table if not exists report_cache (
  id text primary key,
  period_type text not null check (period_type in ('monthly', 'yearly')),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

-- One row per other participant on a split transaction (and, when someone
-- else paid, what I owe them). share_amount excludes my own share, which
-- lives on transactions.my_share.
create table if not exists transaction_splits (
  id text primary key,
  transaction_id text not null references transactions(id) on delete cascade,
  user_id text not null references split_users(id) on delete restrict,
  share_amount numeric not null check (share_amount >= 0),
  is_settled boolean not null default false,
  settled_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (transaction_id, user_id)
);
create index if not exists transaction_splits_tx_idx on transaction_splits (transaction_id);
create index if not exists transaction_splits_open_idx on transaction_splits (user_id, is_settled);

create table if not exists portfolio_assets (
  id text primary key,
  user_id text not null,
  name text not null,
  asset_type text not null,
  symbol text,
  isin text,
  scheme_code text,
  currency text not null default 'INR',
  notes text,
  created_at timestamptz not null,
  updated_at timestamptz
);
create index if not exists portfolio_assets_user_id_idx on portfolio_assets (user_id);

create table if not exists portfolio_transactions (
  id text primary key,
  user_id text not null,
  asset_id text not null references portfolio_assets(id),
  asset_name text not null,
  asset_type text not null,
  type text not null check (type in ('buy', 'sell', 'dividend', 'interest', 'fee')),
  date date not null,
  amount numeric not null,
  quantity numeric,
  price_per_unit numeric,
  charges numeric,
  taxes numeric,
  currency text not null default 'INR',
  notes text,
  source text not null default 'manual' check (source in ('manual', 'ai_text', 'screenshot')),
  created_at timestamptz not null,
  updated_at timestamptz
);
create index if not exists portfolio_transactions_user_id_idx on portfolio_transactions (user_id);
create index if not exists portfolio_transactions_asset_id_idx on portfolio_transactions (asset_id);

create table if not exists portfolio_valuations (
  id text primary key,
  user_id text not null,
  asset_id text not null references portfolio_assets(id),
  asset_name text not null,
  asset_type text not null,
  date date not null,
  total_value numeric not null,
  quantity numeric,
  price_per_unit numeric,
  currency text not null default 'INR',
  notes text,
  source text not null default 'manual' check (source in ('manual', 'ai_text', 'screenshot')),
  created_at timestamptz not null,
  updated_at timestamptz
);
create index if not exists portfolio_valuations_user_id_idx on portfolio_valuations (user_id);
create index if not exists portfolio_valuations_asset_id_idx on portfolio_valuations (asset_id);

create table if not exists portfolio_ai_imports (
  id text primary key,
  user_id text not null,
  input_type text not null check (input_type in ('text', 'screenshot')),
  raw_text text,
  parsed_json jsonb,
  created_record_ids text[],
  created_at timestamptz not null
);
create index if not exists portfolio_ai_imports_user_id_idx on portfolio_ai_imports (user_id);
