-- View that flattens the category/payment-method names onto each transaction so
-- the app can filter, sort (including by category/payment name), and paginate
-- entirely in Postgres in a single query. Reads only — writes still target the
-- base `transactions` table.
--
-- `splits` aggregates the transaction_splits children (who else owes what) as
-- jsonb so the app hydrates a transaction's split in the same query instead of
-- an N+1. `paid_by_name` resolves paid_by_id for display.
--
-- Dropped and recreated (not `create or replace`) because the underlying
-- transactions.* column order changed and Postgres only allows
-- create-or-replace to append columns, not reorder/insert them.
-- create_transaction_with_splits() returns `setof transactions_expanded`, so
-- it must be dropped first or the view drop fails with a dependency error.
drop function if exists create_transaction_with_splits(jsonb, jsonb);
drop view if exists transactions_expanded;
create view transactions_expanded as
select tx.*,
       c.name  as category_name,
       c.type  as category_type,
       pm.name as payment_method_name,
       pm.type as payment_method_type,
       pb.name as paid_by_name,
       coalesce(
         (select jsonb_agg(jsonb_build_object(
                    'userId', ts.user_id,
                    'userName', su.name,
                    'shareAmount', ts.share_amount,
                    'isSettled', ts.is_settled
                  ) order by su.name)
          from transaction_splits ts
          join split_users su on su.id = ts.user_id
          where ts.transaction_id = tx.id),
         '[]'::jsonb
       ) as splits
from transactions tx
left join categories c on c.id = tx.category_id
left join payment_methods pm on pm.id = tx.payment_method_id
left join split_users pb on pb.id = tx.paid_by_id;

-- Aggregation RPCs. Run once in the Supabase SQL Editor (after schema.sql).
-- These do the SUM/GROUP BY inside Postgres so the app transfers a handful of
-- summary rows instead of thousands of transactions. The category-name
-- classification lists are passed in as parameters (from
-- src/lib/finance-constants.ts) so SQL and the app never drift.

-- Per-month rollups for an entire year (12 rows max). Powers the yearly overview
-- and the monthly/yearly report inputs without pulling a year of rows client-side.
create or replace function monthly_rollups(
  p_year int,
  p_investment_categories text[] default '{}',
  p_cashback_categories text[] default '{}'
) returns table (
  month_index int,               -- 0-11
  total_income numeric,
  total_expenses numeric,
  needs numeric,
  wants numeric,
  investments numeric,
  cashback_interest_dividends numeric,
  transaction_count bigint
) language sql stable as $$
  with t as (
    select tx.net_amount as amount, tx.type, tx.expense_type,
           (extract(month from tx.date)::int - 1) as m,
           c.name as category_name
    from transactions tx
    left join categories c on c.id = tx.category_id
    where extract(year from tx.date)::int = p_year
  )
  select
    g.m as month_index,
    coalesce(sum(amount) filter (where type = 'income'), 0),
    coalesce(sum(amount) filter (where type = 'expense'), 0),
    coalesce(sum(amount) filter (where type = 'expense' and expense_type = 'need'), 0),
    coalesce(sum(amount) filter (where type = 'expense' and expense_type = 'want'), 0),
    coalesce(sum(amount) filter (where type = 'expense' and (expense_type = 'investment' or category_name = any(p_investment_categories))), 0),
    coalesce(sum(amount) filter (where type = 'income' and category_name = any(p_cashback_categories)), 0),
    count(t.m)  -- count real transactions only (NULL for months with none)
  from generate_series(0, 11) as g(m)
  left join t on t.m = g.m
  group by g.m
  order by g.m;
$$;

-- Distinct years that have transactions (newest first). Powers the yearly
-- overview year picker without scanning rows client-side.
create or replace function transaction_years()
returns table (year int) language sql stable as $$
  select distinct extract(year from date)::int as year
  from transactions
  order by year desc;
$$;

-- Category-level breakdown for a month or year window. Powers per-category
-- rollups (yearly overview top categories) without transferring rows.
create or replace function category_breakdown(
  p_start date,
  p_end date,
  p_type text default 'expense'
) returns table (
  category_name text,
  total numeric,
  transaction_count bigint
) language sql stable as $$
  select coalesce(c.name, 'Uncategorized') as category_name,
         coalesce(sum(tx.net_amount), 0) as total,
         count(*) as transaction_count
  from transactions tx
  left join categories c on c.id = tx.category_id
  where tx.date >= p_start and tx.date <= p_end
    and (p_type is null or tx.type = p_type)
  group by c.name
  order by total desc;
$$;

-- Per-person open balances across all unsettled split_transactions rows,
-- netted against the reverse direction (I owe them / they owe me on
-- different transactions cancel out). Powers the Split Expenses balances view.
create or replace function open_split_balances()
returns table (
  user_id text,
  user_name text,
  they_owe_me numeric,
  i_owe_them numeric,
  net numeric
) language sql stable as $$
  with owed_to_me as (
    -- Splits on transactions I paid for (paid_by_id is null = me).
    select ts.user_id, sum(ts.share_amount) as amount
    from transaction_splits ts
    join transactions tx on tx.id = ts.transaction_id
    where ts.is_settled = false and tx.paid_by_id is null
    group by ts.user_id
  ),
  owed_by_me as (
    -- Transactions someone else paid where I still owe my_share.
    select tx.paid_by_id as user_id, sum(tx.my_share) as amount
    from transactions tx
    where tx.paid_by_id is not null
      and tx.my_share is not null and tx.my_share > 0
      and tx.my_share_settled = false
    group by tx.paid_by_id
  )
  select su.id as user_id,
         su.name as user_name,
         coalesce(m.amount, 0) as they_owe_me,
         coalesce(b.amount, 0) as i_owe_them,
         coalesce(m.amount, 0) - coalesce(b.amount, 0) as net
  from split_users su
  left join owed_to_me m on m.user_id = su.id
  left join owed_by_me b on b.user_id = su.id
  where coalesce(m.amount, 0) <> 0 or coalesce(b.amount, 0) <> 0
  order by su.name;
$$;

-- Atomically writes a transaction and its split rows so a mid-write failure
-- never leaves an amount whose shares don't sum to it. Supabase-js has no
-- client-side transaction, so both writes happen inside this function.
create or replace function create_transaction_with_splits(
  p_transaction jsonb,
  p_splits jsonb default '[]'::jsonb
) returns setof transactions_expanded language plpgsql as $$
declare
  v_id text := p_transaction->>'id';
begin
  insert into transactions (
    id, type, date, amount, description, category_id, payment_method_id,
    source, expense_type, is_split, my_share, paid_by_id, split_method,
    my_share_settled, created_at, updated_at
  ) values (
    v_id,
    p_transaction->>'type',
    (p_transaction->>'date')::date,
    (p_transaction->>'amount')::numeric,
    p_transaction->>'description',
    p_transaction->>'category_id',
    p_transaction->>'payment_method_id',
    p_transaction->>'source',
    p_transaction->>'expense_type',
    jsonb_array_length(p_splits) > 0,
    (p_transaction->>'my_share')::numeric,
    p_transaction->>'paid_by_id',
    p_transaction->>'split_method',
    -- Only used on insert (defaults false for a new transaction). The
    -- ON CONFLICT branch below omits my_share_settled from its SET list on
    -- purpose, so editing an already-settled transaction doesn't un-settle it.
    false,
    (p_transaction->>'created_at')::timestamptz,
    (p_transaction->>'updated_at')::timestamptz
  )
  on conflict (id) do update set
    type = excluded.type,
    date = excluded.date,
    amount = excluded.amount,
    description = excluded.description,
    category_id = excluded.category_id,
    payment_method_id = excluded.payment_method_id,
    source = excluded.source,
    expense_type = excluded.expense_type,
    is_split = excluded.is_split,
    my_share = excluded.my_share,
    paid_by_id = excluded.paid_by_id,
    split_method = excluded.split_method,
    updated_at = excluded.updated_at;

  delete from transaction_splits where transaction_id = v_id;

  insert into transaction_splits (id, transaction_id, user_id, share_amount, is_settled, created_at, updated_at)
  select
    coalesce(s->>'id', v_id || ':' || (s->>'userId')),
    v_id,
    s->>'userId',
    (s->>'shareAmount')::numeric,
    coalesce((s->>'isSettled')::boolean, false),
    now(),
    now()
  from jsonb_array_elements(p_splits) as s;

  return query select * from transactions_expanded where id = v_id;
end;
$$;
