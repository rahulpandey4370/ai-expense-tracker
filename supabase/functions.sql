-- View that flattens the category/payment-method names onto each transaction so
-- the app can filter, sort (including by category/payment name), and paginate
-- entirely in Postgres in a single query. Reads only — writes still target the
-- base `transactions` table.
create or replace view transactions_expanded as
select tx.*,
       c.name  as category_name,
       c.type  as category_type,
       pm.name as payment_method_name,
       pm.type as payment_method_type
from transactions tx
left join categories c on c.id = tx.category_id
left join payment_methods pm on pm.id = tx.payment_method_id;

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
    select tx.amount, tx.type, tx.expense_type,
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
         coalesce(sum(tx.amount), 0) as total,
         count(*) as transaction_count
  from transactions tx
  left join categories c on c.id = tx.category_id
  where tx.date >= p_start and tx.date <= p_end
    and (p_type is null or tx.type = p_type)
  group by c.name
  order by total desc;
$$;
