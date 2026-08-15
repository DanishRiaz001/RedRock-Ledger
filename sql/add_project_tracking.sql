-- ============================================================================
-- Project/department tracking — same pattern as money_sources
-- ============================================================================
create table if not exists projects (
  id text primary key,
  user_id uuid not null,
  name text not null,
  inactive boolean default false,
  created_at timestamptz default now()
);

alter table transactions add column if not exists project_id text;

-- RLS — same books-owner pattern as everything else. Run AFTER the main
-- multi_tenant_rls.sql files so rr_can_read/rr_can_write already exist.
alter table projects enable row level security;
drop policy if exists projects_select on projects;
create policy projects_select on projects for select using (rr_can_read(user_id));
drop policy if exists projects_write on projects;
create policy projects_write on projects for all
  using (rr_can_write(user_id)) with check (rr_can_write(user_id));

-- Also add the tracking toggle to company_profile, alongside country.
alter table company_profile add column if not exists track_projects boolean default false;
