-- Run once, BEFORE turning on Supabase Auth. The app reads/writes only with the
-- service-role key (which bypasses RLS), so enabling RLS with no policies on every
-- public table means the anon/authenticated keys can read and write nothing.
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
-- The server's role keeps calling the RPCs (create_transaction_with_splits, split_save_expense, ...).
grant execute on all functions in schema public to service_role;
alter default privileges in schema public grant execute on functions to service_role;
