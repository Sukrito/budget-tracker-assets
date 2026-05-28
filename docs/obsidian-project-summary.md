---
title: Personal AI Finance OS
type: project
status: active
version: 12.9.0
release_date: 2026-05-27
tags:
  - project/finance
  - tech/google-apps-script
  - tech/javascript
  - tech/github-pages
  - status/active
created: 2026-05-28
---

# Personal AI Finance OS

> A self-hosted personal finance tracker. The backend runs inside Google Sheets. The frontend is a static PWA on GitHub Pages. No server, no subscription, no third-party SaaS.

---

## Project Overview

### Purpose

Track income, expenses, savings, and investments on a Thai salary cycle (monthly pay). Understand spending patterns, guard the budget, and make informed financial decisions — all from a phone, without sharing financial data with any third-party service.

### Goals

- Record every transaction quickly from mobile (under 10 seconds per entry)
- Compute a "safe daily spend" figure that accounts for the current pay cycle, savings plan, and debt obligations
- Alert before the budget breaks — not after
- Archive each pay cycle to build a long-term financial history
- Remain fully self-hosted: data stays in a Google Spreadsheet the owner controls

### Current Status

**v12.9.0 — Stable.** The application is feature-complete for its core use case. This version focused on project cleanup, versioning, and maintainability.

Recent sessions added full project documentation and a modularization analysis. The codebase is well-understood, risks are documented, and the next architectural step (safe frontend modularization) has a clear, phased plan.

### Why It Matters

Mainstream budgeting apps require subscriptions, store sensitive data on third-party servers, and rarely support Thai salary cycles or Thai baht formatting. This project fills that gap while keeping every transaction private and under direct control.

---

## System Architecture

```
GitHub Pages               Google Apps Script          Google Sheets
─────────────────          ────────────────────         ─────────────────
index.html                 Code.js (router)             16 sheets
script.js      ──fetch()──▶ Security.js (auth)   ──────▶ Income / Expenses
styles.css                 Service files…               Savings / Investments
                           Config.js (constants)        Plans / Pay_Cycles
Static PWA,                14 .gs files,                Recent_Index
installable via            one global scope             Dashboard_Cache
Safari                                                  + more
```

### Frontend — [[GitHub Pages]]

A single-page mobile-first PWA. Three files: `index.html` (markup), `script.js` (all logic, ~2,000 lines), `styles.css`. No framework, no bundler, no build step. Deployed by pushing to `main` on GitHub. Functions are called directly from HTML event attributes, so they must all be global.

### Backend — [[Google Apps Script]]

A Web App deployed to a `/exec` URL. Entry point is `doGet` / `doPost` in `Code.js`. All `.gs` files share one global namespace — there are no imports. The backend reads and writes to a Google Spreadsheet using the `SpreadsheetApp` API. Access is controlled by secret keys stored in Script Properties (never in source code).

### Google Sheets Role — [[Google Sheets]]

The sole database. 16 sheets covering transactions, plans, history, settings, pay cycles, and infrastructure (cache, index, logs). `Recent_Index` is a denormalized fast-read cache of recent transactions. `Dashboard_Cache` holds a serialized summary payload to avoid recomputing on every load.

### Apps Script Role — [[Google Apps Script]]

Serves as the API layer, computation engine, and scheduler. Computes financial summaries, runs budget guard alerts, generates pay cycle calendars (fetching Thai public holidays from an external API), and archives pay cycles. Has a 6-minute execution limit per call.

### GitHub Role — [[GitHub Pages]]

Hosts the frontend as a static site. No CI/CD — every push to `main` deploys automatically. Also version controls the Apps Script source files, pushed/pulled via [[Clasp Workflow]].

### Clasp Workflow — [[Clasp Workflow]]

`clasp` is the CLI that syncs local `.js` files to the Google Apps Script project. `clasp push` uploads; `clasp pull` downloads; `clasp open` opens the IDE. After pushing, a new deployment version must be activated in the Apps Script IDE to go live. The `/exec` URL is stable as long as you update an existing deployment rather than creating a new one.

### Deployment Flow — [[Apps Script Deployment]]

```
Edit local .js files
  → clasp push
  → Apps Script IDE: update existing deployment to new version
  → Verify via /exec?action=health

Edit script.js / styles.css
  → git push origin main
  → GitHub Pages deploys in ~60 seconds
```

Both targets are deployed independently. On a combined release, always deploy the backend first.

---

## Major Components

### Backend Services

| Service | What it does |
|---|---|
| `SummaryService` | Computes the full financial dashboard payload; two-layer cache |
| `TransactionService` | Write path for all 4 transaction types; maintains `Recent_Index` |
| `CycleService` | Determines current pay cycle; archives cycles to history |
| `BudgetGuardService` | Stateless: analyses summary + expenses; returns up to 6 prioritised alerts |
| `PlanService` | Updates per-cycle budget plan with full before/after audit log |
| `HolidayPayCycleService` | Fetches Thai holidays, computes pay dates; runs on a monthly trigger |
| `SystemCheckService` | Diagnostic endpoint — verifies all sheets, cache layers, and secret keys |

### Frontend Structure

`script.js` contains everything in one file: API client, state, all rendering, all form handling. The file is organised into logical groups but has no module system. Key logical areas:

- **API layer** — `apiGet_` / `apiPost_` with auth and error handling
- **Category management** — fetches and applies dropdown options from backend settings
- **Dashboard rendering** — `renderFinancialSummary` orchestrates 10 sub-render functions
- **Transaction forms** — add, edit, and delete flows
- **Plan editor** — inline budget plan editing with live buffer preview
- **System check** — diagnostics panel in the Settings page

### Critical Files

| File | Why critical |
|---|---|
| `Config.js` | Shared by every backend file; a typo here affects everything |
| `Code.js` | All routing; a wrong branch silently drops requests |
| `Security.js` | The authentication boundary |
| `script.js` | Entire frontend; a syntax error produces a blank page |

---

## Development Workflow

### Local Development

There is no local server or hot-reload. Development cycle:

1. Edit `.js` files locally in any editor
2. Test backend changes: `clasp push` → run functions in the Apps Script IDE
3. Test frontend changes: open `index.html` via file URL or a local static server
4. Deploy when ready (see below)

No `npm install`, no `node_modules`, no build step required.

### Git Workflow

```
main branch → production
All changes committed directly to main
No staging branch currently
```

Commit conventions:
- `feat:` new capability
- `fix:` bug correction
- `chore:` version bump, config, deploy wiring
- `docs:` documentation only
- `refactor:` restructure, no behaviour change

### Clasp Pull/Push Workflow — [[Clasp Workflow]]

```bash
clasp pull    # before editing — sync IDE state to local
clasp push    # after editing — upload to Apps Script
clasp open    # open IDE in browser for deployment step
```

Always `clasp pull` before editing locally if the Apps Script IDE may have been edited directly. Always `clasp push` before creating a new deployment.

### Deployment / Versioning Workflow — [[Apps Script Deployment]]

Before every `clasp push`, five fields in `Config.js` must be updated:

- `APP_META.BACKEND_VERSION`
- `APP_META.BACKEND_LABEL`
- `APP_META.RELEASE_DATE`
- `APP_META.FRONTEND_EXPECTED_VERSION`
- `API_SECURITY.SUMMARY_CACHE_KEY` ← most critical; busts stale cache

Full step-by-step: `docs/deployment-workflow.md`
Release checklist: `docs/release-checklist.md`

### Claude Code Workflow

`CLAUDE.md` at the repository root provides context to Claude Code at the start of every session. It covers architecture, conventions, safety rules, and quick-reference commands. The `docs/` folder provides deeper context for specific topics.

Effective prompting pattern for this project:
1. Ask Claude to read `CLAUDE.md` and the relevant `docs/` file before any change
2. Request analysis before implementation ("analyse before editing")
3. Use the release checklist to guide Claude through deployment steps
4. Reference specific doc filenames when asking questions about architecture

---

## Known Technical Debt

### Monolithic Frontend — [[Frontend Modularization]]

`script.js` is ~2,000 lines with no module system. All functions are global. Splitting it requires care because `index.html` calls functions by name in inline event attributes — any function referenced there must remain on `window`. A full analysis and phased plan exists in `docs/modularization-plan.md`.

**Phase 1** (safe): split into multiple `<script>` files in dependency order — no module syntax, no behaviour change.
**Phase 2** (more work): convert to ES modules after replacing inline event handlers with `addEventListener`.

### Performance Bottlenecks

- `getFinancialSummary` reads from all 4 transaction sheets, Plans, Cycle_History, and Accounts in a single call. As data grows, this will approach the 6-minute limit.
- `rebuildRecentIndex` scans all 4 sheets in one pass. `RECENT_SCAN_LIMIT` is currently set to 0 (unlimited).
- No pagination on any API endpoint.

### Deployment Risks

- No automated tests — regressions are only caught by manual inspection.
- No CI/CD pipeline — a syntax error in `script.js` reaches GitHub Pages users immediately.
- Backend URL changes if a "New deployment" is accidentally created instead of updating an existing one.
- Version and cache key must be bumped manually; forgetting causes stale dashboard data.

### Maintainability Concerns

- All Apps Script files share one global namespace. Duplicate function names overwrite silently.
- `index.html` contains inline event handlers that create an invisible contract with `script.js` function names.
- `Settings` sheet categories can only be changed by editing the sheet directly — `DEFAULT_SETTINGS` in `Config.js` is the seed value only.
- No staging environment — all testing is done against the live spreadsheet.

---

## Current Priorities

### Active
- [ ] Review `docs/modularization-plan.md` and decide on Phase 1 start date
- [ ] Add `node --check script.js` as a pre-push hook to catch syntax errors

### Safe Next Steps
- [ ] Phase 1 modularization: split `script.js` into 11 files, keep global scope
- [ ] Add git tags for each release (`git tag v12.9.0`) to enable cleaner rollbacks
- [ ] Set `RECENT_SCAN_LIMIT = 500` in `Config.js` as a proactive performance guard

### Not Urgent
- [ ] Phase 2 modularization: ES modules (requires converting `index.html` event handlers)
- [ ] Add QUnit tests for backend computation logic
- [ ] Consider a staging Apps Script deployment for pre-production validation

---

## Future Roadmap

### Modularization — [[Frontend Modularization]]

Split `script.js` into 11 focused modules in two phases. Phase 1 is a safe refactor (no behaviour change, no module syntax). Phase 2 introduces ES modules. Full plan: `docs/modularization-plan.md`.

### Mobile UX

- Replace `window.prompt()` for API key entry with a proper in-app login screen
- Add swipe gestures for page navigation
- Improve the transaction entry form for one-thumb use

### Backend Improvements

- Add an `onEdit` trigger to auto-invalidate the dashboard cache on direct sheet edits
- Add retry logic to the holiday fetch in `HolidayPayCycleService`
- Add structured error codes to the API response envelope (instead of string-matching Thai messages)
- Add a staging deployment for pre-production testing

### Database Migration Possibilities

Google Sheets works well at current scale. If data exceeds ~5,000 rows per sheet or multi-user access is needed, options include:

- **Firebase Realtime Database** — retains the Apps Script layer, adds real-time sync
- **Supabase + Next.js** — full migration away from Apps Script; enables proper auth, pagination, and testing
- **Google Cloud Firestore** — GCP-native, accessible from Apps Script via REST API

No migration is planned. Sheets remains the correct choice for a single-user, low-volume personal tool.

### Long-Term Scalability

The current architecture handles one user and ~1,000 transactions/year comfortably. The limiting factors at scale are:
1. Apps Script 6-minute execution limit
2. Google Sheets read/write quotas (20,000 cells/day for personal accounts)
3. Monolithic `script.js` making changes risky

All three are addressable without abandoning the core architecture, as long as the codebase remains well-organised.

---

## Related Concepts

- [[Google Apps Script]] — serverless runtime inside Google Workspace; powers the backend
- [[Clasp Workflow]] — CLI tool for syncing Apps Script projects to local files
- [[Apps Script Deployment]] — the process of publishing a new version to a live /exec URL
- [[Google Sheets]] — the database; also the IDE for running manual backend operations
- [[GitHub Pages]] — static site hosting; serves the frontend PWA
- [[Frontend Modularization]] — the planned refactor to split script.js into modules
- [[Budget Tracker Architecture]] — the full system design for this project
- [[Progressive Web App]] — installable via Safari Add to Home Screen; offline shell
- [[Personal Finance OS]] — the project concept; self-hosted finance management

---

## Documentation Index

All technical documentation lives in `docs/`:

| Document | Purpose |
|---|---|
| `architecture-overview.md` | System diagram, file responsibilities, runtime constraints |
| `frontend-backend-flow.md` | API reference, request lifecycle, data shapes |
| `google-sheets-data-flow.md` | Sheet inventory, write flows, cache and index behaviour |
| `deployment-workflow.md` | Clasp, versioning, rollback, secret key setup |
| `modularization-plan.md` | Risk analysis and phased plan for splitting script.js |
| `known-risks.md` | All identified risks with severity and mitigations |
| `safe-development-workflow.md` | Pre-change checklist, change categories, recovery |
| `release-checklist.md` | Step-by-step checklist for every release type |
