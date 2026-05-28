# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Personal AI Finance OS v12.9** — a personal finance tracker with a Google Apps Script backend and a GitHub Pages frontend. No build step, no package manager, no CI pipeline. All deployment is manual.

- **Backend:** Google Apps Script Web App, bound to a Google Spreadsheet. Entry point is `doGet`/`doPost` in `Code.js`.
- **Frontend:** Static PWA (`index.html` + `script.js` + `styles.css`) served from GitHub Pages. Communicates with the backend via `fetch()`.

Deeper reference: `docs/architecture-overview.md`, `docs/frontend-backend-flow.md`.

---

## Apps Script + clasp Workflow

### The critical distinction: saved vs. deployed

Apps Script serves the **deployed snapshot**, not the current editor state. Pushing code and saving in the IDE does nothing to live traffic. A new deployment must be created (or an existing one updated) after every `clasp push`.

```bash
clasp pull          # sync IDE state to local before editing — avoids overwriting IDE-only changes
clasp push          # upload local .js files to Apps Script
clasp open          # open the IDE in browser
clasp deployments   # list deployment IDs and URLs
```

`clasp push` targets the project in `.clasp.json` (`scriptId`). All `.js` files in the root are treated as `.gs` files in Apps Script.

### All .gs files share one global scope

There are no imports. Every function in every file is visible to every other function. **Duplicate function names silently overwrite each other — Apps Script gives no warning.** Before adding a new function, confirm the name does not exist in any other file.

### 6-minute execution limit

Apps Script kills any function that runs longer than 6 minutes. `rebuildRecentIndex_` is the most at-risk operation as sheets grow. If it times out, `Recent_Index` is left partially rebuilt — run it again or use a lower `limit`.

---

## Versioning Rules

**Every backend change requires bumping all five values in `Config.js` before `clasp push`.** Skipping `SUMMARY_CACHE_KEY` is the most common mistake — it causes users to be served a stale dashboard payload from an old cache after an upgrade.

```js
// Config.js — bump all five on every backend release
const APP_META = {
  BACKEND_VERSION: 'X.Y.Z',                  // semver
  BACKEND_LABEL: 'vX.Y Short description',   // one line
  RELEASE_DATE: 'yyyy-MM-dd',                // today
  FRONTEND_EXPECTED_VERSION: 'X.Y.Z',        // match if frontend also changed
};

const API_SECURITY = {
  SUMMARY_CACHE_KEY: 'finance_summary_vX_Y', // must change — busts dashboard cache
};
```

Changing `SUMMARY_CACHE_KEY` invalidates both the Apps Script `CacheService` layer and the `Dashboard_Cache` sheet layer simultaneously.

---

## Safe Release Process

Follow this order for every backend change. Do not skip steps.

**Before editing:**
1. `clasp pull` — ensure local files match the IDE state.
2. Run System Check to confirm the baseline is healthy before you touch anything:
   ```
   GET <WEB_APP_URL>?action=systemCheck&key=<your_key>
   ```
   All entries in `errors[]` must be empty before proceeding.

**Making the change:**

3. Edit the targeted service file. Prefer isolated service files over `Code.js` or `Config.js`.
4. Update all five version fields in `Config.js` (see Versioning Rules above).
5. `clasp push`

**Deploying:**

6. In the Apps Script IDE: **Deploy → Manage deployments → Edit (pencil) → select "New version" → Deploy.**
   This updates the existing deployment in-place and **keeps the same `/exec` URL**. Do not click "New deployment" unless you intentionally want a new URL (which requires updating `APPS_SCRIPT_API_URL` in `script.js` and redeploying the frontend).

**Verifying:**

7. Run health check — confirm new `version.backendVersion` appears in the response:
   ```
   GET <WEB_APP_URL>?action=health
   ```
8. Run System Check again — confirm `status: "success"`, no errors.
9. Exercise the affected flow through the frontend. Hard-refresh first (`Shift+Reload`).

**Committing:**

10. `git add` only the changed files. Commit with a scoped message:
    ```
    feat: describe change
    chore: version bump vX.Y.Z
    ```
    Keep version bump and logic change in the same commit so the git history stays in sync with the deployed state.

---

## Frontend Editing Rules

- **`APPS_SCRIPT_API_URL`** is declared near the top of `script.js`. It is the only place the backend URL lives. If it points to a stale deployment, all API calls fail silently with no error in the console (Apps Script returns a redirect, not an error).
- The API secret lives in `localStorage` on the user's device, not in `script.js`. Do not add it to the source.
- `script.js` is large (~90 KB) and entirely self-contained. There is no module system — all frontend state and logic is in one file.
- Frontend-only changes (UI, styles, logic that does not touch the API shape) require only a `git push`. No `clasp push` or backend redeploy needed.
- After pushing, the PWA may serve a cached version to installed users. Verify changes by hard-refreshing.

```bash
git add script.js styles.css   # or index.html if changed
git commit -m "feat: describe change"
git push origin main
```

---

## Google Sheets Risks

These are the sheet-level behaviors that cause silent bugs if ignored:

**Direct sheet edits bypass the API.** If you manually add, edit, or delete rows in `Income`, `Expenses`, `Savings`, or `Investments` directly in Google Sheets, two things break:
1. `Recent_Index` goes out of sync — transaction IDs encode row numbers, and deleted rows shift all subsequent row numbers.
2. `Dashboard_Cache` is not invalidated — the dashboard continues serving the pre-edit summary until the cache expires.

After any direct sheet edit, run `rebuildRecentIndex` (admin action) and `resetFinanceCache` (admin action).

**`Config.js` header arrays are authoritative.** `ensureWorkbook_()` rewrites a sheet's header row if it differs from the constant array. Changing a header array in `Config.js` and deploying will silently overwrite the actual header on the next write operation. Only change header arrays if you intend to change the real sheet schema.

**`Recent_Index` is prepend-ordered.** New rows are inserted at row 2, not appended. Code that assumes append order will read data incorrectly.

**The `Dashboard_Cache` sheet holds one row.** Row 2 is the entire cache. Row 1 is the header. Never write additional rows here.

**`Settings` sheet is seeded once.** `seedSettingsIfEmpty_()` only runs if the sheet has fewer than 2 rows. Editing `DEFAULT_SETTINGS` in `Config.js` does not update an already-seeded sheet. Edit the sheet directly if you need to change dropdown options for an existing installation.

---

## Deployment Safety

**Never use "New deployment" when "Update existing deployment" works.** Creating a new deployment generates a new `/exec` URL. The old URL immediately returns a "Script function not found" error. Updating the existing deployment in-place keeps the URL stable and is reversible by selecting an older version.

**If the URL does change:**
1. Copy the new URL from Apps Script: Deploy → Manage deployments.
2. Update `APPS_SCRIPT_API_URL` at the top of `script.js`.
3. Commit and push to GitHub Pages.
4. Re-enter the new URL on any device that has it saved in `localStorage`.

**API secrets are never in code.** They live in Apps Script Project Settings → Script Properties. Never commit a secret to the repository, even in a comment.

| Script Property | Tier |
|---|---|
| `FINANCE_OS_API_SECRET` | Legacy fallback — covers all tiers if scoped keys are absent |
| `FINANCE_OS_READ_SECRET` | Dashboard, recent, summary |
| `FINANCE_OS_WRITE_SECRET` | recordTransaction, updateCurrentPlan |
| `FINANCE_OS_ADMIN_SECRET` | delete, archive, cache reset, rebuild |

---

## Architecture

### File responsibilities

| File | Role |
|---|---|
| `Code.js` | Entry points: `doGet()`, `doPost()`, `onOpen()`. Do not add logic here — only routing. |
| `Config.js` | All constants. High blast radius — a typo here affects every file. |
| `Security.js` | `requireApiSecret_()` — called before any sheet access. Logs to `ApiLogs`. |
| `SheetService.js` | `ensureWorkbook_()` bootstraps/repairs sheets. `getSS_()` is the sole `SpreadsheetApp` call. |
| `Utils.js` | `parseLocalDate_`, `normalizeNumberInput_`, `cleanText_`, `sanitizeClientPayload_`. |
| `TransactionService.js` | Write path for all four types. Acquires `LockService`. Updates `Recent_Index` after each write. |
| `RecentService.js` | `Recent_Index` management. Auto-rebuilds if index is empty. |
| `SummaryService.js` | `getFinancialSummary` + two-layer cache (CacheService → Dashboard_Cache sheet). |
| `CycleService.js` | Current pay cycle detection; `archiveCurrentCycle`. |
| `PlanService.js` | `updateCurrentPlan` with before/after logging to `Plan_Change_Log`. |
| `BudgetGuardService.js` | Stateless. Takes summary + expense sheet, returns ≤6 deduplicated alerts. |
| `MonthlyInsightService.js` | Stateless trend analysis. Requires ≥2 archived cycles. |
| `HolidayPayCycleService.js` | Fetches Thai holidays from `date.nager.at`; computes pay dates (4th business day before month-end). |
| `SystemCheckService.js` | Diagnostic endpoint — verifies all sheets, headers, cache layers, secret keys. |
| `VersionService.js` | Returns `APP_META` fields as JSON. |

### Google Sheets layout

Transaction sheets: `Income`, `Expenses`, `Savings`, `Investments`.
Supporting sheets: `Plans`, `Pay_Cycles`, `Holidays`, `Pay_Cycle_Overrides`, `Cycle_History`, `Plan_Change_Log`, `Settings`, `Goals`, `Accounts`.
Infrastructure sheets: `Recent_Index`, `Dashboard_Cache`, `ApiLogs`.

All sheets are defined in `APP_CONFIG` (sheet names) and their header arrays are constants in `Config.js`.

### Caching

```
getFinancialSummary request
  └─► CacheService (in-memory, 5 min)          MISS
  └─► Dashboard_Cache sheet (longer TTL)        MISS
  └─► Full recompute → write both cache layers
```

`invalidateFinanceCache_()` clears both layers. Called by every write path. Not called by direct sheet edits.

### Security model

`requireApiSecret_()` runs before any sheet is touched. Scoped keys fall back to the legacy key. The `health` action is the only public endpoint. All other actions require at minimum the READ key.

---

## Key Conventions

- **Naming:** Internal/private functions use a trailing `_` (`getSS_()`, `cleanText_()`). Public API-callable and menu-triggered functions have no underscore.
- **Dates:** Always use `parseLocalDate_()` for input (expects `yyyy-MM-dd`) and `Utilities.formatDate(..., APP_CONFIG.TIMEZONE, ...)` for output. Never use `new Date(string)` directly — timezone shifts will corrupt date values.
- **Numbers:** All client-supplied numbers go through `normalizeNumberInput_()` (handles Thai baht symbol `฿`, `บาท`, commas). Never parse with `Number()` directly on untrusted input.
- **Writes:** All write operations acquire `LockService.getDocumentLock()` and release it in a `finally` block.
- **New actions:** Register in the correct tier in `Config.js` (`PUBLIC_ACTIONS`, `WRITE_ACTIONS`, `ADMIN_ACTIONS`). Omitting registration defaults the action to READ tier — wrong tier means wrong secret is required.
- **`cleanText_` and `Array.map`:** `cleanText_(value, maxLength)` guards against being called as a map callback (where the second arg is the index). Do not remove that guard.

---

## Recovery

| Symptom | Action |
|---|---|
| Dashboard shows stale numbers | `POST { action: "resetFinanceCache", key: "<admin_key>" }` |
| Recent transactions wrong or missing | `POST { action: "rebuildRecentIndex", key: "<admin_key>", data: { limit: 200 } }` |
| Sheet has wrong headers after a Config change | Run `setupFinanceOS()` from the Apps Script IDE — calls `ensureWorkbook_()` |
| `/exec` URL changed after new deployment | Update `APPS_SCRIPT_API_URL` in `script.js`, commit, push |
| Installed PWA not picking up frontend changes | Hard-refresh (`Shift+Reload`) or clear browser cache; reinstall the PWA if needed |

---

## Further Reference

| Topic | File |
|---|---|
| System architecture diagram, file responsibilities, runtime constraints | `docs/architecture-overview.md` |
| All API actions, request/response shapes, sanitization pipeline | `docs/frontend-backend-flow.md` |
| Sheet inventory, write flows, Recent_Index, pay cycle computation | `docs/google-sheets-data-flow.md` |
| clasp workflow, URL stability, version bump, rollback | `docs/deployment-workflow.md` |
| All known risks with severities and mitigations | `docs/known-risks.md` |
| Pre-change checklist, change categories, recovery procedures | `docs/safe-development-workflow.md` |
| Step-by-step release and rollback checklists | `docs/release-checklist.md` |
| Modularization risks, dependency tiers, phase-by-phase plan | `docs/modularization-plan.md` |
