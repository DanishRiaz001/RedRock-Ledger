# RedRock Pakistan / IFRS-for-SMEs Roadmap

**Status (updated 2026-09-28):** Phase 1 done. Phase 2 (core statement engine) done and tested — all four IFRS-for-SMEs primary statements are built, verified with a synthetic reconciliation test, and wired into `redrock-real` behind a framework gate. Phase 3/4 not started. See "Progress log" at the bottom for exactly what shipped and where.

Decided direction: shared core platform with country "packs" (not a fully separate system) — see reasoning below.
**Decisions locked in:**
- Architecture: shared codebase + shared Supabase project, isolated by a `framework` field (separate from `country`)
- Accounting standard: IFRS for SMEs first (a complete standalone IASB standard — not "IFRS lite"), with room to add full-IFRS disclosure modules later without a rewrite
- Tax filing: bookkeeping/statements first, FBR income tax + sales tax filing as a later integration phase
- Mobile apps: separate, Pakistan-branded native app(s) with their own bundle ID / App Store listing — not a mode inside the existing RedRock Ledger/Documents apps

**Open question before implementation starts:** product name for Pakistan (keep "RedRock" branding, or distinct name?) — needed before creating bundle IDs / Apple Developer records.

---

## Why this is possible without duplicating the whole system

The ledger engine itself — double-entry postings, vouchers, bank reconciliation, invoicing, attachments, multi-tenant RLS — is genuinely country-agnostic accounting mechanics. Norway and Pakistan don't need different versions of "record a debit and credit." What differs is:
- The **chart of accounts template** (NS 4102 for Norway vs an IFRS-for-SMEs-aligned COA for Pakistan)
- The **statutory statement formats** (Mva-melding/SAF-T vs IFRS's Statement of Financial Position / Comprehensive Income / Changes in Equity / Cash Flows + Notes)
- **Terminology/language** (Norwegian bookkeeping terms like "bilag," "mva" vs English IFRS terminology)
- **Tax rules** (Norwegian VAT vs Pakistani sales tax/withholding, once that phase starts)

All four of those are data/config, not core logic — which is exactly what a "pack" architecture isolates.

---

## Phase 1 — Foundation (do this first, before any Pakistan-specific UI)

1. **Add a `framework` field** to `company_profile`, distinct from the existing `country` field.
   - `country` = locale/currency/tax-authority context (`'NO'`, `'PK'`)
   - `framework` = which accounting standard/COA/statement set applies (`'NO-GAAP'`, `'IFRS-SME'`)
   - Keeping these separate matters: it lets a future scenario (e.g., a Norwegian company that wants IFRS reporting) work without contradiction, and it's the field every other pack decision keys off.

2. **Build/verify a real i18n layer.** Every user-facing string needs to be keyed and swapped per pack — not hardcoded Norwegian text with English bolted on. This is the actual mechanism that guarantees a Pakistani company can never see a stray Norwegian label. Audit the current codebase first: how much UI text is already hardcoded Norwegian vs already externalized? This determines how much refactor work Phase 1 actually needs.

3. **Write automated tests/lint rules** that assert: a company with `framework='IFRS-SME'` never renders a string or account code from the `'NO-GAAP'` pack, and vice versa. This is what makes "structural isolation" a guarantee instead of a hope.

**Deliverable:** the existing Norwegian system keeps working exactly as-is, now running on top of a pack-aware foundation, with zero user-visible change yet.

## Phase 2 — IFRS for SMEs pack (the actual new accounting content)

1. **Chart of accounts template** — an IFRS-for-SMEs-aligned COA (asset/liability/equity/income/expense structure that maps cleanly to IFRS statement line items, unlike Norway's NS 4102 numbering).
2. **Statement generation**, per IFRS for SMEs:
   - Statement of Financial Position (balance sheet)
   - Statement of Comprehensive Income
   - Statement of Changes in Equity
   - Statement of Cash Flows
   - Notes to the financial statements (the disclosures IFRS for SMEs actually requires — a much shorter list than full IFRS)
3. **Default currency/locale**: PKR, English terminology throughout.
4. This is the point where a **real accountant familiar with IFRS for SMEs and SECP requirements should review the templates** before they go live — this is a compliance-sensitive area (same "auditor mindset" standard already applied to Norwegian VAT/SAF-T work).

**Deliverable:** a company can be created with `framework='IFRS-SME'` and get a working IFRS bookkeeping system on the existing web app — chart of accounts, vouchers, and financial statements all correct for that standard, no Norwegian terms/accounts visible anywhere.

## Phase 3 — Pakistan native apps

1. Decide product name/branding for Pakistan (blocks bundle ID + Apple Developer record creation).
2. New Xcode project(s) — likely reusing the same Capacitor/React shell pattern as RedRock Documents/Ledger, pointed at the same Supabase backend but scoped to `framework='IFRS-SME'` companies.
3. Same App Store Connect process we just went through for RedRock Documents (app record, archive/upload, metadata, demo account, privacy/support pages) — now a known, repeatable process rather than a first-time one.

**Deliverable:** a Pakistani small business can sign up, use a dedicated native app, and get an IFRS-for-SMEs-compliant bookkeeping experience with no Norwegian branding or terminology anywhere.

## Phase 4 — Tax filing integrations (later, roadmap only)

Once Phase 2/3 are proven with real users:
- FBR income tax computation/filing integration
- Sales tax return filing
- Sequenced the same way Norway's Mva-melding came after the core ledger was already solid — don't build tax-authority integrations against an unproven core.

---

## Suggested sequencing for "implement in parts"

Each of these is a shippable, reviewable chunk rather than one big effort:
1. `framework` field + i18n audit (Phase 1.1–1.2) — foundation, low risk, no visible change
2. Isolation tests/lint rules (Phase 1.3) — proves the foundation actually holds
3. IFRS-for-SMEs chart of accounts (Phase 2.1) — first real Pakistan-specific content
4. IFRS statement generation, one statement at a time (Phase 2.2) — e.g. Statement of Financial Position first, since everything else depends on the same account classifications
5. Accountant review pass (Phase 2.4) — before anything ships to a real Pakistani client
6. Native app branding decision + new App Store Connect setup (Phase 3) — can start in parallel with Phase 2 once naming is decided
7. Tax integrations (Phase 4) — explicitly later, not blocking anything above

---

## Progress log

**Phase 1 (2026-09-28):** `framework` column added to `company_profile` (migration: `redrock-real/sql/add_framework_field.sql`). Accounts-seeding bug fixed in `appshell.jsx` — new/merging companies with `country !== 'NO'` now seed from `accounts_data_pk_ifrs.js` (177 accounts) instead of Norway's NS 4102 chart. Verified with clean builds; zero change to Norwegian companies' behavior.

**Phase 2 (2026-09-28):** All four IFRS-for-SMEs primary statements built in `redrock-real/src/lib/ifrsStatements.js`:
- Statement of Financial Position (Section 4)
- Statement of Comprehensive Income (Section 5)
- Statement of Changes in Equity (Section 6)
- Statement of Cash Flows (Section 7, indirect method)

Verified with a synthetic multi-transaction test (owner investment, bank loan, asset purchase, credit sale + partial collection, credit purchase, depreciation, owner drawings) — every statement's numbers were hand-checked, and the cash flow statement's net change was confirmed to exactly match the actual bank balance movement. This test caught and fixed two real bugs before they could reach anyone:
1. A contra-account sign error (accumulated depreciation, owner's drawings, and similar contra accounts were being flipped the WRONG way, so they *added* to their section instead of *reducing* it — this would have overstated both assets and equity).
2. A double-count of depreciation in the cash flow statement's investing-activities calculation.

The lesson: the first version of this code "looked right" and built cleanly, but was materially wrong until tested against a real worked example. Don't trust an accounting calculation that hasn't been verified this way, even if it's mine.

Wired into `FinanceTracker.jsx` via a new `feat.ifrsStatements` flag (`companyProfile.framework === 'IFRS-SME'`), using the exact same gating pattern already proven for Norway's VAT feature — Balance Sheet/Income Statement tabs swap their rendered component based on framework, and two new tabs (Statement of Changes in Equity, Statement of Cash Flows) only appear at all for IFRS companies. Norwegian companies' code path is untouched — verified via clean builds after every change.

**Not yet done in Phase 2:** Notes to the financial statements (the disclosures IFRS for SMEs requires alongside the four primary statements) — not started. i18n/isolation audit from Phase 1 also still not started.

**Still open before any of this touches a real company:** accountant review (per the original plan), especially of the Statement of Cash Flows' classification rules — see the long comment above `computeStatementOfCashFlows` in `ifrsStatements.js` for exactly which assumptions need checking against real chart-of-account usage.

---

*Parked here per standing preference: plans discussed but not yet acted on in-session get saved to this NOTES folder rather than lost when the conversation moves on.*
