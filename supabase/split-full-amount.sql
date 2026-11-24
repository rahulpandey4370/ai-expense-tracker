-- "Count the full amount of splits I paid" (Settings switch).
-- net_amount — what every total sums — was a generated column (coalesce(my_share, amount)). It becomes a normal column
-- kept by a trigger: with the switch on, a transaction I paid (paid_by_id is null) counts at its full amount; when a
-- friend paid, or with the switch off, it's my share as before. Nothing is deleted; switching off restores today's
-- numbers exactly. Safe to run more than once.

create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table app_settings enable row level security;          -- no policies: only the service role can touch it
revoke all on app_settings from anon, authenticated;
insert into app_settings (key, value) values ('split_full_amount', 'true') on conflict (key) do nothing;

-- Keep the column (and the view/index on it), drop only its formula.
do $$ begin
  if exists (select 1 from pg_attribute where attrelid = 'transactions'::regclass and attname = 'net_amount' and attgenerated <> '') then
    alter table transactions alter column net_amount drop expression;
  end if;
end $$;

create or replace function my_spend(p_amount numeric, p_my_share numeric, p_paid_by_id text) returns numeric
language sql stable as $$
  select case
    when p_paid_by_id is null and coalesce((select (value #>> '{}')::boolean from app_settings where key = 'split_full_amount'), false)
      then p_amount
    else coalesce(p_my_share, p_amount)
  end
$$;

create or replace function transactions_set_net_amount() returns trigger language plpgsql as $$
begin
  new.net_amount := my_spend(new.amount, new.my_share, new.paid_by_id);
  return new;
end $$;
drop trigger if exists transactions_net_amount on transactions;
create trigger transactions_net_amount before insert or update of amount, my_share, paid_by_id on transactions
  for each row execute function transactions_set_net_amount();

-- Flip the switch and recalculate every transaction in one go.
create or replace function set_split_full_amount(p_on boolean) returns void language plpgsql as $$
begin
  insert into app_settings (key, value, updated_at) values ('split_full_amount', to_jsonb(p_on), now())
    on conflict (key) do update set value = excluded.value, updated_at = now();
  update transactions set net_amount = my_spend(amount, my_share, paid_by_id)
    where net_amount is distinct from my_spend(amount, my_share, paid_by_id);
end $$;

update transactions set net_amount = my_spend(amount, my_share, paid_by_id)
  where net_amount is distinct from my_spend(amount, my_share, paid_by_id);

-- Same lockdown as rls-lockdown.sql: only the server (service role) may call these.
revoke execute on function my_spend(numeric, numeric, text), transactions_set_net_amount(), set_split_full_amount(boolean) from public, anon, authenticated;
grant execute on function my_spend(numeric, numeric, text), set_split_full_amount(boolean) to service_role;
