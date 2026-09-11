-- ============================================================================
-- Mva-melding filed/paid/reconciled status — was tracked in a single flat
-- localStorage key (rr_vat_termin_status, keyed only by "year-termin"), which
-- meant two real problems: a granted employee's browser never saw a status
-- change the books' owner made (or vice versa) since it never left that one
-- browser, and — since the key wasn't scoped by company at all — switching
-- between two companies you have access to showed the exact same filed/paid/
-- reconciled flags for both. A real row per (user, company, year, termin)
-- fixes both, same rr_can_read_company/rr_can_write_company pattern as
-- voucher_drafts (see sql/add_voucher_drafts.sql — run that first if you
-- haven't, this depends on the same helper functions from
-- sql/company_scoped_rls.sql).
--
-- controlled_ids folds in the "Controlled" per-transaction checkbox mark on
-- the termin detail screen — same original bug (flat localStorage key,
-- rr_vat_controlled), same fix, same table instead of a second one.
-- ============================================================================
create table if not exists vat_termin_status (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  company_id uuid references companies(id) on delete cascade,
  year int not null,
  termin_n int not null, -- 1-6 (bi-monthly Norwegian VAT terminer)
  filed boolean not null default false,
  filed_date date,
  paid boolean not null default false,
  paid_date date,
  reconciled boolean not null default false,
  controlled_ids jsonb not null default '[]'::jsonb, -- transaction ids marked "Controlled" for this termin
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per (user, company, year, termin) — company_id can be null (no
-- company-scoping migration run yet), same nullable-FK-in-a-unique-index
-- pattern already used elsewhere in this schema.
create unique index if not exists vat_termin_status_user_company_year_termin_idx
  on vat_termin_status(user_id, company_id, year, termin_n);

alter table vat_termin_status enable row level security;

drop policy if exists vat_termin_status_select on vat_termin_status;
create policy vat_termin_status_select on vat_termin_status for select
  using (rr_can_read_company(user_id, company_id));

drop policy if exists vat_termin_status_write on vat_termin_status;
create policy vat_termin_status_write on vat_termin_status for all
  using (rr_can_write_company(user_id, company_id))
  with check (rr_can_write_company(user_id, company_id));

create index if not exists vat_termin_status_company_idx on vat_termin_status(company_id);
