-- ============================================================================
-- Multi-tenant RLS — Part 3: budgets, money_sources, usage_events
-- ============================================================================
-- Found these 3 by cross-checking every sb.from(...) call across the ENTIRE
-- codebase against what Part 1 + Part 2 covered — they were missed in the
-- first two passes. Run after Part 1 and Part 2.
-- ============================================================================

-- budgets, money_sources — standard books-owner pattern, full/entries can write
do $$
declare t text;
begin
  foreach t in array array['budgets','money_sources']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I_select on %I', t, t);
    execute format('create policy %I_select on %I for select using (rr_can_read(user_id))', t, t);
    execute format('drop policy if exists %I_write on %I', t, t);
    execute format('create policy %I_write on %I for all using (rr_can_write(user_id)) with check (rr_can_write(user_id))', t, t);
  end loop;
end $$;

-- usage_events — DIFFERENT shape from every other table. The app reads this
-- with no per-user filter (admin.jsx: sb.from("usage_events").select(...) —
-- an admin-only cross-account usage dashboard), and writes one row per user
-- per tab-change as a lightweight analytics ping. So: any logged-in user can
-- insert their OWN event, but only an admin can read the full table.
alter table usage_events enable row level security;

drop policy if exists usage_events_select on usage_events;
create policy usage_events_select on usage_events for select
  using (rr_is_admin());

drop policy if exists usage_events_insert on usage_events;
create policy usage_events_insert on usage_events for insert
  with check (user_id = auth.uid());

-- ============================================================================
-- This completes RLS coverage for every table the app currently writes to
-- (confirmed via grep across the full codebase, not just spot-checked).
-- If a future feature adds a new table, it needs the same treatment before
-- going live — check whether it's a books-owner table (use the standard
-- pattern above) or a cross-account admin table (use the usage_events
-- pattern) before assuming the default.
-- ============================================================================
