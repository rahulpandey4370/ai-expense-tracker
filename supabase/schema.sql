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
  created_at timestamptz not null,
  updated_at timestamptz not null
);
create index if not exists transactions_date_idx on transactions (date desc);

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

create table if not exists split_users (
  id text primary key,
  name text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists split_expenses (
  id text primary key,
  title text not null,
  date timestamptz not null,
  total_amount numeric not null,
  paid_by_id text not null,
  split_method text not null check (split_method in ('equally', 'custom')),
  is_fully_settled boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists split_expense_participants (
  id bigserial primary key,
  split_expense_id text not null references split_expenses(id) on delete cascade,
  user_id text not null,
  share_amount numeric not null,
  is_settled boolean not null default false
);
create index if not exists split_expense_participants_expense_id_idx on split_expense_participants (split_expense_id);

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
