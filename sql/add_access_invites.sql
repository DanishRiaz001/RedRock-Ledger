-- ============================================================================
-- Access invites — lets a company owner (or anyone with 'full' access to a
-- company) grant access to ANY user by email, from that company's own
-- Settings, instead of every grant having to go through the platform admin.
--
-- Two cases, one table:
--   - Invitee already has a RedRock account: the grant is created
--     immediately (status='accepted') and shows up in their company
--     switcher right away — no waiting.
--   - Invitee has never signed up: the row sits as status='pending'. The
--     app sends them Supabase's own built-in magic-link signup email (no
--     custom mailer needed — supabase.auth.signInWithOtp already does
--     this using the project's default mailer). The moment they sign up
--     and their profile loads for the first time, the app checks this
--     table for their email and self-accepts any pending invite, creating
--     the matching client_access row. No separate subscription of their
--     own is required — they're accessing books the INVITING company
--     already pays for, not their own new company.
--
-- Run once in the Supabase SQL editor, after multi_tenant_rls.sql,
-- company_scoped_rls.sql and add_multi_company.sql. Safe to re-run.
-- ============================================================================

create table if not exists access_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text,
  company_id uuid not null references companies(id) on delete cascade,
  client_user_id uuid not null, -- whose books (the inviting company's owner)
  access_level text not null default 'full',
  invited_by uuid not null,
  status text not null default 'pending', -- pending | accepted | revoked
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique(company_id, email)
);

alter table access_invites enable row level security;

-- Whoever can already manage Settings for this company (the owner, or
-- someone previously granted 'full' access) can create/revoke invites for
-- it — same rule as who can flip the VAT-split toggle or rename accounts.
drop policy if exists access_invites_manage on access_invites;
create policy access_invites_manage on access_invites for all
  using (rr_can_write_settings_company(client_user_id, company_id) or rr_is_admin())
  with check (rr_can_write_settings_company(client_user_id, company_id) or rr_is_admin());

-- An invited person (by email match on their own JWT) can see their own
-- pending invite even before any grant exists — needed so the app can show
-- "you have N pending invites" and self-accept them right after signup.
drop policy if exists access_invites_self_read on access_invites;
create policy access_invites_self_read on access_invites for select
  using (lower(email) = lower(coalesce(auth.jwt()->>'email','')));

-- Self-accept: the invited person marks their own pending invite accepted.
-- Only the exact same row they can already see, and only pending -> stays
-- theirs to touch, never lets them edit who invited them or which company.
drop policy if exists access_invites_self_accept on access_invites;
create policy access_invites_self_accept on access_invites for update
  using (lower(email) = lower(coalesce(auth.jwt()->>'email','')) and status='pending')
  with check (lower(email) = lower(coalesce(auth.jwt()->>'email','')));

-- ----------------------------------------------------------------------------
-- client_access needs a matching hole: today ONLY rr_is_admin() can write a
-- grant (see multi_tenant_rls.sql's client_access_admin_write). This adds
-- the two legitimate self-service paths without loosening anything else:
--   1. The company owner (or a full-access grantee) managing grants for
--      their own company — the actual "each company can give access"
--      feature this file exists for.
--   2. An invited person accepting their OWN pending invite by inserting
--      the row for themselves (employee_user_id = auth.uid()) that
--      exactly matches what they were invited to.
-- ----------------------------------------------------------------------------
drop policy if exists client_access_owner_manage on client_access;
create policy client_access_owner_manage on client_access for all
  using (rr_can_write_settings_company(client_user_id, company_id) or rr_is_admin())
  with check (rr_can_write_settings_company(client_user_id, company_id) or rr_is_admin());

drop policy if exists client_access_self_accept on client_access;
create policy client_access_self_accept on client_access for insert
  with check (
    employee_user_id = auth.uid()
    and exists (
      select 1 from access_invites i
      where i.status in ('pending','accepted')
        and lower(i.email) = lower(coalesce(auth.jwt()->>'email',''))
        and i.client_user_id = client_access.client_user_id
        and i.company_id = client_access.company_id
        and i.access_level = client_access.access_level
    )
  );

-- ----------------------------------------------------------------------------
-- Look up a user's id by email without exposing the rest of the profiles
-- table to non-admins (needed so an owner can tell, before sending an
-- invite, whether this person already has an account). Returns only the
-- id, or null — never name/email/anything else about accounts that don't
-- match exactly what the caller already typed in themselves.
-- ----------------------------------------------------------------------------
create or replace function rr_lookup_user_id_by_email(p_email text)
returns uuid
language sql
security definer
stable
as $$
  select id from profiles where lower(email) = lower(trim(p_email)) limit 1;
$$;
