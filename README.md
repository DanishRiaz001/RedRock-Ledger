# RedRock Ledger

Accountant-portal-style bookkeeping app for Redrock Danria Accountants.
Migrated from a single-file React/Babel app to a Vite + React project (Aug 2026).

## Project structure

```
src/
  main.jsx              # React entry point
  App.jsx                # top-level shell: nav, routing between tabs, shared state
  lib/
    theme.js              # design tokens (T colors) + shared style objects (inp, btnRed, ...)
    constants.js           # SERIES, seed data (INIT_ACCOUNTS/CONTACTS/TXN), nav menus
    utils.js               # getSK, fmt, fmtB, sign — pure formatting helpers
  components/
    common/                # small reusable primitives (SL, Card, Pill, BackHeader, AccDrop, Menu3)
    modals/                # EditModal, DetailModal
    TxnCard.jsx
    MiniBarChart.jsx
  screens/
    LedgerScreen.jsx        # per-account ledger w/ matching
    BankModule.jsx
    ReskontroScreen.jsx      # AR/AP subledger
    AccountPlanScreen.jsx
    SettingsMenu.jsx
    DashboardTab.jsx
    EntriesTab.jsx
    TransactionsTab.jsx
    AccountsTab.jsx
    ReportsTab.jsx
```

## Local development

```bash
npm install
npm run dev       # starts local dev server with hot reload
npm run build      # production build to /dist
npm run preview    # preview the production build locally
```

## Deploying (Cloudflare Pages)

Push to GitHub `main` — Cloudflare Pages is configured to auto-build on push:
- Build command: `npm run build`
- Output directory: `dist`
- Framework preset: Vite

No manual upload needed once connected.

## Adding a new screen/module

1. Create `src/screens/NewScreen.jsx`
2. Import shared tokens from `lib/theme.js`, helpers from `lib/utils.js`, and any
   reusable pieces from `components/common/`
3. Wire it into `App.jsx` — add to `SIDEBAR`/`MENU` in `lib/constants.js` if it needs
   nav entries, and add a route branch in `App.jsx`

## Roadmap context

See `redrock_roadmap.md` (tracked separately) for the 10-phase master roadmap.
This Vite migration is the architectural prerequisite for the multi-tenant
accountant-portal (employee-to-client assignment with granular permissions) —
the core product differentiator, matching Tripletex's accountant-portal model.
