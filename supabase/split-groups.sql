-- Settl-style split groups. Run once in the Supabase SQL editor (take a backup first).
-- Safe to re-run: tables use IF NOT EXISTS and the legacy import is guarded.

create table if not exists split_groups (
  id text primary key,
  name text not null,
  emoji text,
  kind text not null default 'other' check (kind in ('trip', 'home', 'couple', 'other', 'direct')),
  currency text not null default 'INR',
  share_token text unique,             -- private link secret; null = no link. Kept (not hashed) so it can be copied again; the DB is service-role only.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists split_members (
  id text primary key,
  group_id text not null references split_groups(id) on delete cascade,
  name text not null,
  email text,                           -- lets a friend's Google login claim this member
  user_id text,                         -- auth.users id once claimed
  upi_id text,                          -- for "pay via UPI" handoff
  is_owner boolean not null default false,
  created_at timestamptz not null default now(),
  removed_at timestamptz
);
create index if not exists split_members_group_idx on split_members (group_id);
create index if not exists split_members_user_idx on split_members (user_id);
create index if not exists split_members_email_idx on split_members (lower(email));

create table if not exists split_expenses (
  id text primary key,
  group_id text not null references split_groups(id) on delete cascade,
  description text not null,
  amount numeric not null check (amount > 0),
  date date not null,
  emoji text,
  method text not null check (method in ('equal', 'exact', 'percent', 'shares', 'items', 'cover')),
  paid_by text not null references split_members(id),
  created_by text references split_members(id),
  meta jsonb not null default '{}'::jsonb,   -- raw inputs: values, items, coveredBy, participants
  transaction_id text references transactions(id) on delete set null,  -- owner's personal ledger row
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists split_expenses_group_idx on split_expenses (group_id, date desc);

create table if not exists split_expense_shares (
  expense_id text not null references split_expenses(id) on delete cascade,
  member_id text not null references split_members(id),
  amount numeric not null check (amount >= 0),
  primary key (expense_id, member_id)
);
create index if not exists split_expense_shares_member_idx on split_expense_shares (member_id);

create table if not exists split_settlements (
  id text primary key,
  group_id text not null references split_groups(id) on delete cascade,
  from_member text not null references split_members(id),
  to_member text not null references split_members(id),
  amount numeric not null check (amount > 0),
  date date not null,
  note text,
  created_by text references split_members(id),
  created_at timestamptz not null default now()
);
create index if not exists split_settlements_group_idx on split_settlements (group_id);

-- Writes an expense and replaces its shares atomically.
create or replace function split_save_expense(p_expense jsonb, p_shares jsonb)
returns void language plpgsql as $$
declare
  v_id text := p_expense->>'id';
begin
  insert into split_expenses (id, group_id, description, amount, date, emoji, method, paid_by, created_by, meta, transaction_id, created_at, updated_at)
  values (
    v_id, p_expense->>'group_id', p_expense->>'description', (p_expense->>'amount')::numeric,
    (p_expense->>'date')::date, p_expense->>'emoji', p_expense->>'method', p_expense->>'paid_by',
    p_expense->>'created_by', coalesce(p_expense->'meta', '{}'::jsonb), p_expense->>'transaction_id', now(), now()
  )
  on conflict (id) do update set
    description = excluded.description, amount = excluded.amount, date = excluded.date,
    emoji = excluded.emoji, method = excluded.method, paid_by = excluded.paid_by,
    meta = excluded.meta, transaction_id = excluded.transaction_id, updated_at = now();

  delete from split_expense_shares where expense_id = v_id;
  insert into split_expense_shares (expense_id, member_id, amount)
  select v_id, s->>'member_id', (s->>'amount')::numeric from jsonb_array_elements(p_shares) s;

  update split_groups set updated_at = now() where id = p_expense->>'group_id';
end $$;

-- One-time import of the old per-transaction splits into an "Earlier splits" group.
-- Shares the old model didn't record (when someone else paid) are given to the payer,
-- so every expense's shares sum to its amount. Settled shares become settlements.
do $$
begin
  if exists (select 1 from split_groups where id = 'legacy') then return; end if;
  if not exists (select 1 from split_users) then return; end if;

  insert into split_groups (id, name, emoji, kind) values ('legacy', 'Earlier splits', '🗂️', 'other');
  insert into split_members (id, group_id, name, is_owner) values ('legacy_me', 'legacy', 'You', true);
  insert into split_members (id, group_id, name)
    select 'legacy_' || id, 'legacy', name from split_users;

  insert into split_expenses (id, group_id, description, amount, date, method, paid_by, meta, transaction_id, created_at, updated_at)
    select 'legacy_' || t.id, 'legacy', t.description, t.amount, t.date, 'exact',
           coalesce('legacy_' || t.paid_by_id, 'legacy_me'), '{"imported":true}'::jsonb, t.id, t.created_at, t.updated_at
    from transactions t
    where t.paid_by_id is not null or exists (select 1 from transaction_splits s where s.transaction_id = t.id);

  -- others' shares
  insert into split_expense_shares (expense_id, member_id, amount)
    select 'legacy_' || s.transaction_id, 'legacy_' || s.user_id, s.share_amount
    from transaction_splits s join split_expenses e on e.id = 'legacy_' || s.transaction_id
    where s.share_amount > 0;
  -- my share
  insert into split_expense_shares (expense_id, member_id, amount)
    select 'legacy_' || t.id, 'legacy_me', t.my_share
    from transactions t join split_expenses e on e.id = 'legacy_' || t.id
    where coalesce(t.my_share, 0) > 0
    on conflict do nothing;
  -- unrecorded remainder → payer
  insert into split_expense_shares (expense_id, member_id, amount)
    select e.id, e.paid_by, e.amount - coalesce(sum(sh.amount), 0)
    from split_expenses e left join split_expense_shares sh on sh.expense_id = e.id
    where e.group_id = 'legacy'
    group by e.id, e.paid_by, e.amount
    having e.amount - coalesce(sum(sh.amount), 0) > 0
    on conflict (expense_id, member_id) do update set amount = split_expense_shares.amount + excluded.amount;

  -- settled shares: they paid me back
  insert into split_settlements (id, group_id, from_member, to_member, amount, date, note)
    select 'legacy_s_' || s.id, 'legacy', 'legacy_' || s.user_id, 'legacy_me', s.share_amount,
           coalesce(s.settled_at, s.updated_at)::date, 'Imported: ' || t.description
    from transaction_splits s join transactions t on t.id = s.transaction_id
    where s.is_settled and s.share_amount > 0 and t.paid_by_id is null;
  -- my share settled: I paid them back
  insert into split_settlements (id, group_id, from_member, to_member, amount, date, note)
    select 'legacy_m_' || t.id, 'legacy', 'legacy_me', 'legacy_' || t.paid_by_id, t.my_share,
           t.updated_at::date, 'Imported: ' || t.description
    from transactions t
    where t.paid_by_id is not null and t.my_share_settled and coalesce(t.my_share, 0) > 0;
end $$;

-- Only the server (service role, which bypasses RLS) touches these tables.
-- RLS with no policies denies the anon/authenticated roles entirely.
alter table split_groups enable row level security;
alter table split_members enable row level security;
alter table split_expenses enable row level security;
alter table split_expense_shares enable row level security;
alter table split_settlements enable row level security;
revoke execute on function split_save_expense(jsonb, jsonb) from public, anon, authenticated;
