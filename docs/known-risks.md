# Known Risks

## Risk Summary

| ID | Severity | Category | Status | Title |
|---|---|---|---|---|
| R01 | High | Operational | Open | Apps Script 6-minute execution limit |
| R02 | High | Development | Open | Global namespace collisions in Apps Script |
| R03 | High | Development | Open | `script.js` syntax error disables the entire frontend |
| R04 | Medium | Deployment | Open | New deployment creates a new URL, breaking the frontend |
| R05 | Medium | Operational | Open | Direct sheet edits bypass cache invalidation |
| R06 | Medium | Operational | Open | `Recent_Index` desyncs when rows are deleted from source sheets |
| R07 | Medium | Deployment | Open | Version/cache key not bumped after backend deploy |
| R08 | Medium | Development | Open | No automated tests — regressions are invisible |
| R09 | Medium | Development | Open | `validateTransaction` mutates its argument silently |
| R10 | Low | Operational | Open | Holiday fetch has no retry; variable holidays may be missing |
| R11 | Low | Security | Open | API secret stored in `sessionStorage` |
| R12 | Low | Development | Open | `cleanText_` passed to `Array.map` receives index as second argument |
| R13 | Medium | Operational | Open | `Recent_Index` silently drops the oldest entry on every new transaction once at capacity |
| R14 | Low | Operational | Open | Zero-net Savings entries are invisible in Recent Transactions |
| R15 | Medium | Operational | Open | Race condition between `getRecentTransactions` rebuild and a concurrent `recordTransaction` |
| R16 | Low | Operational | Open | Backdated Savings entries write an incorrect Balance column value |

---

## Operational Risks

### R01 — Apps Script 6-minute execution limit
**Severity: High**

Apps Script kills any function that runs longer than 6 minutes. `rebuildRecentIndex_` in `RecentService.js` scans all four transaction sheets in one synchronous pass. If any sheet grows to thousands of rows, this operation may time out and leave `Recent_Index` in a partially rebuilt state (some rows written, others not).

`getFinancialSummary` in `SummaryService.js` is also at risk if the spreadsheet grows very large — it reads from all four transaction sheets plus Plans, Cycle_History, and Accounts in a single execution.

**Current state:** `API_SECURITY.RECENT_SCAN_LIMIT` is set to `0` (no limit). No mitigation is in place yet.

**Mitigation:** Set `RECENT_SCAN_LIMIT` to `500` or `1000` in `Config.js` once any single transaction sheet exceeds ~1,000 rows. This caps the rebuild scan at the cost of the index not containing older history.

---

### R05 — Direct sheet edits bypass cache invalidation
**Severity: Medium**

`invalidateFinanceCache_()` is called by every API write path. However, it is not called when someone edits the spreadsheet directly in Google Sheets. After a direct edit to `Income`, `Expenses`, `Savings`, or `Investments`:

- `Dashboard_Cache` continues serving the pre-edit summary until it expires (~5 minutes for CacheService, longer for the sheet cache).
- `Recent_Index` shows the pre-edit transaction list.

**Recovery:** Run `resetFinanceCache` (admin action) and `rebuildRecentIndex` (admin action) after any direct sheet edit.

---

### R06 — `Recent_Index` desyncs when rows are deleted from source sheets
**Severity: Medium**

Transaction IDs encode row numbers (`Expenses-2026-05-28-47` = row 47 of the Expenses sheet). If a row is deleted directly from a source sheet, all rows below it shift up by one. The `Recent_Index` entries for those rows now point to the wrong row.

Consequences:
- `getTransactionById` returns the wrong transaction.
- `updateTransaction` edits the wrong row.
- `deleteTransaction` deletes the wrong row.

**Recovery:** Run `rebuildRecentIndex` after any direct row deletion from a transaction sheet.

---

### R10 — Holiday fetch has no retry; variable holidays may be missing
**Severity: Low**

`updateThailandHolidays` calls `date.nager.at/api/v3/PublicHolidays/{year}/TH` once per year with no retry. A transient network error causes that year to use the hard-coded fallback. The fallback covers fixed-date holidays accurately but may omit lunar-calendar holidays (Makha Bucha, Visakha Bucha, Asalha Bucha) which change date each year.

**Recovery:** Re-run `updateThailandHolidays` from the spreadsheet menu (Finance OS → Update Thailand Holidays). The function can be run any number of times safely.

---

## Development Risks

### R02 — Global namespace collisions in Apps Script
**Severity: High**

All 14 `.gs` files share one global scope. If two files define a function with the same name, one silently overwrites the other — Apps Script gives no warning, no error, no duplicate detection. The overwriting function is the one in the file that loads last (load order is alphabetical by file name unless `filePushOrder` is set in `.clasp.json`).

**Prevention:** Before adding any new function to any `.gs` file, search the entire repository for that function name:
```bash
grep -rn "function functionName" *.js
```

---

### R03 — `script.js` syntax error disables the entire frontend
**Severity: High**

`script.js` is one file with no error boundary. A single syntax error anywhere in the file (unclosed bracket, stray character) prevents the entire file from parsing. The result: a blank page with a console error, no UI visible to the user.

There is no linting step, no build step, no CI. Syntax errors can reach GitHub Pages.

**Prevention:** Run the file through a JS validator or linter (e.g. `node --check script.js`) before committing. This is a manual step currently.

---

### R07 — Version/cache key not bumped after backend deploy
**Severity: Medium**

If `APP_META.BACKEND_VERSION` or `API_SECURITY.SUMMARY_CACHE_KEY` is not updated before `clasp push`, users receive stale dashboard data from the old cache. The old summary is served until the cache expires (~5 minutes for CacheService, longer for Dashboard_Cache sheet).

This is the most frequent deployment mistake. The symptom is: new backend logic deployed, but the dashboard shows values from before the change.

**Prevention:** Always update all five version fields in `Config.js` before `clasp push`. See `deployment-workflow.md` — Version Bump section.

---

### R08 — No automated tests — regressions are invisible
**Severity: Medium**

There is no test suite for the backend (Apps Script) or the frontend (`script.js`). Changes to computation logic in `SummaryService.js` (FCF calculation, budget guard thresholds, cycle detection) can break silently and only be caught by manual inspection of the dashboard.

**Current practice:** Manual testing via System Check endpoint + visual dashboard inspection after every backend change.

**Mitigation path:** Apps Script supports unit tests via the `QUnit` library. Frontend utils (number normalization, date formatting) could be tested with a simple Node.js test runner since they have no DOM dependencies.

---

### R09 — `validateTransaction` mutates its argument
**Severity: Medium**

`validateTransaction(data)` in `script.js` (line 1954) writes `data.amount = normalizeNumericInput_(data.amount)`. The caller `handleFormSubmit` passes its `data` object directly and relies on this mutation — it reads `data.amount` as a normalized number after the call. This is an undocumented side-effect.

**Impact on refactoring:** Any future change that copies the object before calling `validateTransaction`, or that expects `validateTransaction` to be pure, will silently use the wrong amount value. This must be documented before the modularization refactor.

---

### R12 — `cleanText_` receives index as second argument when passed to `Array.map`
**Severity: Low (guard is in place)**

`cleanText_(value, maxLength)` clips strings to `maxLength` characters. When called via `.map(cleanText_)`, the second argument is the array index (a small integer like 0, 1, 2...). Without a guard, this would silently truncate strings to 0 or 1 characters.

The guard is present: `const limit = (typeof maxLength === 'number' && maxLength >= 20) ? maxLength : 500`. Indices below 20 are ignored.

**Risk:** If this guard is ever removed during a refactor, `.map(cleanText_)` call sites will silently corrupt data. The comment explaining the guard must not be removed.

---

## Security Risks

### R11 — API secret stored in `sessionStorage`
**Severity: Low (personal use)**

The API secret is stored in `sessionStorage` under `FINANCE_OS_API_KEY_STORAGE`. On a shared or compromised device, the key is accessible to any JavaScript running on the same origin.

For personal use on a private device, `sessionStorage` is reasonable — it is cleared on tab close and is not persistent. For shared use, the secret should be rotated regularly and the split-key model (separate READ/WRITE/ADMIN keys) used to limit blast radius.

---

### R04 — New deployment creates a new URL, breaking the frontend
**Severity: Medium (Deployment)**

When "New deployment" is selected instead of updating an existing deployment, Apps Script generates a new `/exec` URL. The old URL returns a generic error page (not JSON), causing `res.json()` to throw in the frontend. All API calls fail silently from the user's perspective (an error toast appears for each failed action).

**Prevention:** Always use Deploy → Manage deployments → Edit (pencil icon) → New version. See `deployment-workflow.md` — URL Stability section.

---

---

### R13 — `Recent_Index` silently drops the oldest entry on every new transaction once at capacity
**Severity: Medium**

`prependRecentIndexFromSheetRow_` in `RecentService.js` reads at most 199 existing index rows, prepends the new row, and writes 200 rows back. If the index already holds 200 rows (the maximum written by `rebuildRecentIndex_`), the row at position 200 is never read and is silently overwritten on every subsequent `recordTransaction`.

Over time, the oldest visible entry in the index is perpetually evicted. A full `rebuildRecentIndex` restores the missing entries.

**Mitigation:** Run `rebuildRecentIndex` periodically (e.g. monthly) to ensure the index reflects the full transaction history up to the configured limit. The 200-row cap in `prependRecentIndexFromSheetRow_` could be raised to 200 (matching `rebuildRecentIndex_`) in a future patch.

---

### R14 — Zero-net Savings entries are invisible in Recent Transactions
**Severity: Low**

A Savings row where `Deposit` equals `Withdrawal` (net amount = 0) is filtered out by the `Number(amount) === 0` guard in both `collectRecentFromSheet_` and `collectRecentRowFromValues_` in `RecentService.js`. The transaction is recorded correctly in the Savings sheet but never appears in the recent list and disappears from the index after any rebuild.

This affects correction entries (equal deposit and withdrawal used to zero out a previous entry).

**Mitigation:** No workaround. Verify a correction entry was written by checking the Savings sheet directly.

---

### R15 — Race condition between `getRecentTransactions` rebuild and a concurrent `recordTransaction`
**Severity: Medium**

`getRecentTransactions` (called by the standalone `getRecentTransactions` GET action) may trigger `rebuildRecentIndex_` if the index is found empty. This rebuild calls `writeRecentIndexRows_`, which runs `clearContents()` on `Recent_Index`. A concurrent `recordTransaction` holds the document lock and is mid-way through `prependRecentIndexFromSheetRow_`, which also calls `writeRecentIndexRows_`. Because the GET call does not acquire the document lock, the two writes can interleave: the rebuild's `clearContents` may wipe an entry just written by the `recordTransaction`, causing the newly recorded transaction to vanish from the index until the next rebuild.

**Mitigation:** This race is unlikely in personal single-user use. If it occurs, run `rebuildRecentIndex` (admin action) to restore the correct index state.

---

### R16 — Backdated Savings entries write an incorrect Balance column value
**Severity: Low**

`recordTransaction` for Savings type uses `getSavingsBalanceBefore_`, which sums all existing deposits and withdrawals for the goal without any date filter. If a transaction is recorded with a date earlier than existing rows (a backfill), the Balance stored in the new row equals the grand total including future-dated rows — not the running balance at the backfilled date.

The Balance column is denormalized and is used only by `getSavingsBalanceBefore_` for the next `recordTransaction`. Financial summary calculations (`getGoalStatus_`, FCF) derive balance from the raw `Deposit`/`Withdrawal` columns and are not affected.

**Recovery:** Run `updateTransaction` on any Savings row for the affected goal to trigger `recalculateSavingsBalancesForGoal_`, which repairs all Balance values for that goal in sheet order.

---

## Future Risk Mitigations

> The following are not part of the current implementation.

- **Add `node --check script.js` to a GitHub Actions pre-deploy lint step** to catch syntax errors before they reach GitHub Pages (addresses R03).
- **Add a `QUnit` test file** for Apps Script backend computation logic (addresses R08).
- **Add a Google Sheets `onEdit` trigger** that calls `invalidateFinanceCache_()` when transaction sheets are edited directly (addresses R05).
- **Add `RECENT_SCAN_LIMIT = 500`** in `Config.js` as a proactive guard before sheets grow large (addresses R01).
- **Tag git releases** so rollback uses `git checkout vX.Y.Z -- script.js` instead of commit hashes (helps with R03 and R07 recovery).
