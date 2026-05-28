# Architecture Overview

## Purpose

This document describes the current architecture of Personal AI Finance OS v12.9. It is the anchor document — all other docs reference it for context. Read this first.

---

## System Architecture

```
┌────────────────────────────────────────────────────────┐
│                  GitHub Pages (Frontend)                │
│                                                        │
│   index.html          script.js          styles.css    │
│   Shell + markup      All JS logic       Tailwind ext  │
│   667 lines           1,994 lines        ~5 KB         │
│                                                        │
│   Served as static files. No SSR. No bundler.          │
│   Installable as PWA via Safari Add to Home Screen.    │
└───────────────────────────┬────────────────────────────┘
                            │  HTTPS fetch()
                            │  All requests carry ?key=<secret>
                            │  or { key } in POST body
                            ▼
┌────────────────────────────────────────────────────────┐
│              Google Apps Script Web App                 │
│                                                        │
│   Entry point: Code.js (doGet / doPost)                │
│   14 backend .gs files, all in one global scope        │
│   Deployed as Web App: /exec URL                       │
│   executeAs: USER_DEPLOYING                            │
│   access: ANYONE_ANONYMOUS                             │
└───────────────────────────┬────────────────────────────┘
                            │  SpreadsheetApp API
                            │  Google internal network
                            ▼
┌────────────────────────────────────────────────────────┐
│                    Google Sheets                        │
│                                                        │
│   16 sheets: Income, Expenses, Savings, Investments,   │
│   Plans, Pay_Cycles, Holidays, Pay_Cycle_Overrides,    │
│   Cycle_History, Plan_Change_Log, Settings, Goals,     │
│   Accounts, Recent_Index, Dashboard_Cache, ApiLogs     │
└────────────────────────────────────────────────────────┘
```

---

## Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend hosting | GitHub Pages | Static files on `main` branch |
| Frontend language | Vanilla JavaScript (ES2017+) | No framework, no bundler |
| Frontend CSS | Tailwind CSS (CDN) | `styles.css` extends it |
| Backend runtime | Google Apps Script V8 | ES2019-compatible |
| Backend data | Google Sheets | One spreadsheet, many sheets |
| Backend deploy | clasp CLI | `.clasp.json` links to scriptId |
| Authentication | Script Properties (server-side) | Secrets never in source |
| Package manager | None | No `node_modules`, no `package.json` |
| Build system | None | No transpile, no bundle step |
| CI/CD | None | All deployments are manual |

---

## Backend File Responsibilities

All `.gs` files share **one global scope**. There are no imports. Every function is visible to every other function.

| File | Primary Role | Risk Level |
|---|---|---|
| `Code.js` | Entry: `doGet`, `doPost`, `onOpen`. Routing only — no logic. | High — routing errors silently drop requests |
| `Config.js` | All constants: `APP_META`, `APP_CONFIG`, sheet names, header arrays, `API_SECURITY`, `DEFAULT_SETTINGS` | High — shared by every file; a typo here affects everything |
| `Security.js` | `requireApiSecret_()` — called before any sheet access. Logs to `ApiLogs`. | High — security boundary |
| `SheetService.js` | `ensureWorkbook_()` creates/repairs all sheets. `getSS_()` is the only `SpreadsheetApp` call. | Medium |
| `Utils.js` | Date parsing, number normalization, `cleanText_`, `sanitizeClientPayload_` | Medium |
| `TransactionService.js` | Write path for all 4 types. Acquires `LockService`. Updates `Recent_Index` after every write. | Medium |
| `RecentService.js` | `Recent_Index` maintenance. Auto-rebuilds on first empty read. | Low |
| `SummaryService.js` | `getFinancialSummary` + two-layer cache (CacheService → Dashboard_Cache sheet) | Medium |
| `CycleService.js` | Current pay cycle detection. `archiveCurrentCycle`. | Low |
| `PlanService.js` | `updateCurrentPlan` with before/after audit log to `Plan_Change_Log`. | Low |
| `BudgetGuardService.js` | Stateless alert generator. Reads summary + expense sheet. Returns ≤6 alerts. | Low |
| `MonthlyInsightService.js` | Stateless trend analysis. Requires ≥2 archived cycles to produce a real trend. | Low |
| `HolidayPayCycleService.js` | Fetches Thai holidays from `date.nager.at`. Computes pay dates (4th business day before month-end). | Low |
| `SystemCheckService.js` | Diagnostics: verifies all sheets, headers, cache layers, secret key presence. | Low |
| `VersionService.js` | Returns `APP_META` fields as JSON. One function. | Low |

---

## Frontend File Responsibilities

| File | Role |
|---|---|
| `index.html` | HTML shell + all markup. Loads Tailwind CDN and `script.js`. Contains inline event attributes (`onclick`, `onsubmit`, etc.) that call global functions from `script.js`. |
| `script.js` | All frontend logic: API client, rendering, form handling, state management. 1,994 lines. All functions are global. |
| `styles.css` | Tailwind extensions and custom animation classes. |

---

## Runtime Constraints

These constraints shape every architectural decision:

**6-minute execution limit.** Apps Script kills any function that runs longer than 6 minutes. This limits how much data can be processed in a single request. `rebuildRecentIndex_` is the most at-risk function as sheets grow.

**No imports in Apps Script.** All 14 `.gs` files share a single global namespace. Duplicate function names silently overwrite each other with no warning.

**Apps Script serves deployed snapshots, not editor state.** Pushing code with `clasp push` and saving in the IDE changes nothing in production. A new deployment (or an in-place update of an existing one) is required after every change.

**No bundler or build step.** `script.js` is served exactly as written. No transpilation, no tree-shaking, no minification.

**Inline HTML event handlers require global functions.** `index.html` calls functions by name in `onclick`/`onsubmit` attributes. Any function referenced there must exist on `window` — i.e., be declared in global scope in `script.js`.

---

## Security Model

API secret validation runs in `Security.js` before any sheet is touched. Three permission tiers fall back to a single legacy key:

```
Request arrives at doGet / doPost
         │
         ▼
requireApiSecret_(providedKey, action)
         │
         ├─► Is action in PUBLIC_ACTIONS?  → pass through (health only)
         │
         ├─► Is action in ADMIN_ACTIONS?   → check FINANCE_OS_ADMIN_SECRET
         │                                    (falls back to legacy key)
         ├─► Is action in WRITE_ACTIONS?   → check FINANCE_OS_WRITE_SECRET
         │                                    (falls back to legacy key)
         │
         └─► All other actions             → check FINANCE_OS_READ_SECRET
                                             (falls back to legacy key)
```

Secrets are stored in Apps Script **Script Properties**, never in source code or the repository.

---

## Caching Model

The financial summary uses two sequential cache layers:

```
getFinancialSummary request
        │
        ▼
CacheService.getScriptCache()          ← in-memory, max 5 min TTL
        │ MISS
        ▼
Dashboard_Cache sheet                  ← persists across cache flushes
  row 2: key | cached_at | expires_at | payload_json
        │ MISS or EXPIRED
        ▼
Full recompute from Sheets
        │
        ├─► write to Dashboard_Cache sheet
        └─► write to CacheService
```

`invalidateFinanceCache_()` clears both layers. It is called by every write path. **Manual edits to the spreadsheet bypass this.**

---

## Naming Convention

| Pattern | Meaning |
|---|---|
| `functionName_()` | Internal/private — not called from `doGet`/`doPost` or HTML |
| `functionName()` | Public — called by `doGet`, `doPost`, spreadsheet menu, or `index.html` |

This convention is enforced only by discipline, not by the language or tooling.

---

## High-Risk Files

Changes to these files have the highest blast radius:

| File | Why High Risk |
|---|---|
| `Config.js` | Shared by every other file. A typo in a sheet name or header array can corrupt sheets on next `ensureWorkbook_()` call. |
| `Code.js` | Routing errors silently drop all requests for an action. Wrong action name in dispatch means the endpoint 404s with no clear error. |
| `Security.js` | Logic errors here can expose all data (if validation is skipped) or lock all users out (if it throws unconditionally). |
| `script.js` | Single file, 1,994 lines, no module system. Any syntax error disables the entire frontend. |

---

## Future Recommendations

> The following are not current implementation — they are improvements to consider in future versions.

- **Add `type="module"` to `script.js`** after converting `index.html` inline event handlers to `addEventListener`. This enables proper module splitting. See `modularization-plan.md`.
- **Add a simple CI step** (GitHub Actions) that lints `script.js` on push and catches syntax errors before they reach GitHub Pages users.
- **Introduce a `CHANGELOG.md`** at repo root and update it with every version bump. Currently version history is only in `README.md`.
- **Consider splitting `Config.js`** into `Config.js` (runtime constants) and `Headers.js` (sheet header arrays) to reduce blast radius of a typo.
