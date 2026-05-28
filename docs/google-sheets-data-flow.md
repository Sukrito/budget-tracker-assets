# Google Sheets Data Flow

## Overview

Google Sheets is the sole database. There is no separate database server — all reads and writes go through the Apps Script `SpreadsheetApp` service. The spreadsheet is accessed via `getSS_()` in `SheetService.js`, which is the single call site for `SpreadsheetApp.getActiveSpreadsheet()`.

---

## Sheet Inventory

| Sheet Name | Config Key | Purpose | Written By | Read By |
|---|---|---|---|---|
| `Income` | `SHEET_INCOME` | Income transactions | `recordTransaction`, `updateTransaction` | `getFinancialSummary`, `rebuildRecentIndex_` |
| `Expenses` | `SHEET_EXPENSES` | Expense transactions | `recordTransaction`, `updateTransaction` | `getFinancialSummary`, `buildBudgetGuard_`, `rebuildRecentIndex_` |
| `Savings` | `SHEET_SAVINGS` | Savings deposits/withdrawals | `recordTransaction`, `updateTransaction` | `getFinancialSummary`, `rebuildRecentIndex_` |
| `Investments` | `SHEET_INVESTMENTS` | Investment transactions | `recordTransaction`, `updateTransaction` | `getFinancialSummary`, `rebuildRecentIndex_` |
| `Goals` | `SHEET_GOALS` | Goal names (dropdown source) | Manual only | `getGoalNames_()` |
| `Accounts` | `SHEET_ACCOUNTS` | Account balances | Manual only | `getFinancialSummary` |
| `Plans` | `SHEET_PLANS` | Per-cycle budget plan | `updateCurrentPlan` | `getPlanForPayCycle_()` |
| `Settings` | `SHEET_SETTINGS` | Category/dropdown config | `seedSettingsIfEmpty_` (once), Manual | `getCategoriesFromSettings()` |
| `Pay_Cycles` | `SHEET_PAY_CYCLES` | Computed pay dates | `updatePayCycles` | `getCurrentPayCycle_()` |
| `Holidays` | `SHEET_HOLIDAYS` | Thai public holidays | `updateThailandHolidays` | `updatePayCycles` |
| `Pay_Cycle_Overrides` | `SHEET_PAY_OVERRIDES` | Manual pay date overrides | Manual | `getPayCycleOverrides_()` |
| `Cycle_History` | `SHEET_CYCLE_HISTORY` | Archived cycle snapshots | `archiveCurrentCycle` | `getCycleHistory`, `buildMonthlyPatternInsight_` |
| `Plan_Change_Log` | `SHEET_PLAN_CHANGE_LOG` | Before/after plan diffs | `updateCurrentPlan` | Audit only |
| `Recent_Index` | `SHEET_RECENT_INDEX` | Fast-read denormalized view | `prependRecentIndexFromSheetRow_`, `rebuildRecentIndex_` | `getRecentTransactions` |
| `Dashboard_Cache` | `SHEET_DASHBOARD_CACHE` | Serialized dashboard payload | `saveDashboardCachePayload_` | `getFinancialSummaryCached_()` |
| `ApiLogs` | `API_SECURITY.LOG_SHEET` | Per-request API access log | `logApiAccess_` | Audit only |

All sheet names and their header arrays are defined as constants in `Config.js`. `ensureWorkbook_()` in `SheetService.js` creates any missing sheet and rewrites its header row if it does not match the constant.

---

## Transaction Write Flow

```
POST recordTransaction
        │
        ▼
sanitizeClientPayload_(data)         ← normalize all fields
        │
        ▼
LockService.getDocumentLock()         ← 10 s timeout
waitLock(10000)                        prevents concurrent writes
        │
        ▼
ensureWorkbook_()                     ← create/repair sheets if needed
        │
        ▼
parseLocalDate_(data.date)            ← strict yyyy-MM-dd parsing
                                        no new Date(string) — TZ-safe
        │
        ▼
Route by data.type:
  "Income"      → write to Income sheet
  "Expenses"    → write to Expenses sheet
  "Savings"     → validate goalName against Goals sheet  ← added v12.9.1
                  throws if goalName not in getGoalNames_()
                  (guard skipped if Goals sheet has no rows)
                → write to Savings sheet
  "Investments" → write to Investments sheet
        │
        ▼
writeTransactionRow_(sheet, rowValues)
  → appendRow equivalent; returns written row number
  → row number is encoded into the transaction ID
        │
        ▼
prependRecentIndexFromSheetRow_(type, rowNumber)
  → reads the row just written from the source sheet
  → inserts a new row at position 2 of Recent_Index
    (shifts all existing rows down — newest-first order)
        │
        ▼
invalidateFinanceCache_()
  → CacheService.remove(SUMMARY_CACHE_KEY)
  → clears row 2 of Dashboard_Cache sheet
        │
        ▼
SpreadsheetApp.flush()               ← force write to Sheets
        │
        ▼
LockService.releaseLock()            ← in finally block
```

---

## Transaction ID Format

Every written row is assigned a unique ID:

```
<TYPE>-<yyyy-MM-dd>-<row-number>
```

Examples:
- `Expenses-2026-05-28-47` → row 47 in the Expenses sheet, expense on 2026-05-28
- `Income-2026-05-01-12` → row 12 in the Income sheet

**Critical constraint:** The row number is encoded literally. If rows are deleted from a source sheet directly (bypassing the API), the row numbers of all subsequent rows shift. Any `Recent_Index` entry whose row number now points to a different row will return wrong data on `getTransactionById` and corrupt `updateTransaction` / `deleteTransaction`.

After any direct sheet deletion: run `rebuildRecentIndex`.

---

## Recent_Index Sheet

`Recent_Index` is a denormalized, **prepend-ordered** cache across all four transaction sheets. It exists to avoid scanning all four sheets on every dashboard or recent-list load.

**Write behavior:** `prependRecentIndexFromSheetRow_` inserts at row 2 (below the header), pushing all older rows down. The sheet is sorted newest-first with no explicit sort needed.

**Read behavior:** `getRecentTransactionsFromIndex_` reads from row 2 downward, up to `limit` rows.

**Auto-rebuild:** If `Recent_Index` has no data rows on first read, `getRecentTransactions` calls `rebuildRecentIndex_(200)` automatically before returning.

**Manual rebuild trigger:** `POST { action: 'rebuildRecentIndex', data: { limit: 200 } }` — admin key required.

Headers (17 columns):
```
Created Time | Tx Time | Global Order | Transaction ID | Type | Row Number |
Date | Category | Item | Source | Action | Payment Method | Essential |
Amount | Quantity | Price | Note
```

---

## Dashboard_Cache Sheet

A single-row sheet used as a persistent cache for the full financial summary payload.

```
Row 1: Cache Key | Cached At | Expires At | Payload JSON    ← header
Row 2: <key>     | <date>     | <date>      | <JSON string>  ← data
```

Only row 2 is ever used for data. The cache is valid when `Expires At` is a future `Date`. `invalidateFinanceCache_()` clears row 2. `saveDashboardCachePayload_()` rewrites row 2.

The JSON payload in row 2 can be very large (~5–10 KB for a typical month). Apps Script's `CacheService` has a 100 KB value limit — the sheet cache serves as fallback when the payload is too large or the script cache has been flushed.

---

## Settings Sheet

The Settings sheet is the source of truth for all dropdown values in the frontend. It is seeded once by `seedSettingsIfEmpty_()` (only if the sheet has no data rows). After seeding, the source of truth is **the sheet itself**, not `DEFAULT_SETTINGS` in `Config.js`.

Column layout (1-indexed):

| Column | Contents |
|---|---|
| 1 | Income Categories |
| 2 | Expense Categories |
| 3 | Payment Methods |
| 4 | Debt Types |
| 5 | Goal Types (also used as Savings Buckets) |
| 6 | Priority |
| 7 | Investment Assets |
| 8 | Status |

Rows are parallel — row 2 column 1 is the first income category, row 2 column 2 is the first expense category, etc. Shorter lists leave trailing empty cells.

**`DEFAULT_SETTINGS` in `Config.js` is only the seed value**, used when the sheet is empty. Editing `DEFAULT_SETTINGS` does not update an already-seeded sheet. To change live dropdown values, edit the sheet directly.

---

## Pay Cycle Computation

```
updateThailandHolidays()
  ├─► GET https://date.nager.at/api/v3/PublicHolidays/{year}/TH
  │     for current year through current year + 5
  │     (6 HTTP requests total)
  ├─► On HTTP failure for a year: use hard-coded fallback holidays
  │     Fallback is accurate for fixed-date holidays.
  │     Variable holidays (Makha Bucha, Visakha Bucha) may be missing.
  └─► Writes all rows to Holidays sheet (replaces entire content)

updatePayCycles()
  ├─► Read Holidays sheet → Set<'yyyy-MM-dd'>
  ├─► Read Pay_Cycle_Overrides sheet → Map<'yyyy-MM', Date>
  ├─► For each month (current year through current year + 5):
  │     if override exists → use override pay date
  │     else → getFourthBusinessDayBeforeMonthEnd_()
  │               counts back from last day of month
  │               skips weekends and holidays
  │               returns the 4th business day found
  └─► Writes all rows to Pay_Cycles sheet (replaces entire content)
      Columns: Month | Pay Date | Cycle End | Source
```

`getCurrentPayCycle_()` reads `Pay_Cycles` to find the most recent pay date ≤ today. If the sheet is empty or has no matching row, it falls back to `getCurrentPayCycleFallback_()` which uses the last-Tuesday-of-month heuristic.

---

## Cycle Archive Flow

```
POST archiveCurrentCycle
        │
        ▼
getCurrentPayCycle_()         → determine start/end dates
        │
        ▼
isCycleArchived_(start)       → check if already archived (read Cycle_History)
        │
        ▼
getFinancialSummary()         → compute full summary for the cycle
        │
        ▼
Write one row to Cycle_History
  Fields: Archived At, Pay Cycle Start, Pay Cycle End,
          Income, Expense, Savings, Investments, Actual FCF,
          Expected Buffer, Plan Flex, Available Cash After Plan,
          Safe Daily Spend, Emergency Fund Current,
          Emergency Fund Progress, Result, Status, Recommendation, Note
        │
        ▼
invalidateFinanceCache_()
```

`MonthlyInsightService` reads the last 2 rows of `Cycle_History` to compute trend. A minimum of 2 archived cycles is needed before trend analysis is meaningful. At 0–1 cycles, it returns `trend: 'Need 2 Cycles'`.

---

## Important Constraints

**Direct sheet edits bypass all cache invalidation.** Manually adding, editing, or deleting rows in `Income`, `Expenses`, `Savings`, or `Investments` directly in Google Sheets does not call `invalidateFinanceCache_()`. The dashboard will show stale data until the cache expires or is manually cleared.

**`ensureWorkbook_()` is authoritative for headers.** On the next write operation after a `Config.js` header array change, `ensureWorkbook_()` will overwrite the header row in the actual sheet. This is intentional for repairs, but dangerous if the Config change is wrong.

**`Settings` sheet is seeded only once.** After seeding, it is not automatically updated by code changes to `DEFAULT_SETTINGS`.

**`Pay_Cycles` sheet is replaced entirely on each update.** `updatePayCycles()` calls `sheet.clearContents()` before writing. There is no incremental update.

---

## Future Recommendations

> The following are not part of the current implementation.

- **Row-level audit log for direct edits.** A Google Sheets `onEdit` trigger could detect manual edits to transaction sheets and automatically call `invalidateFinanceCache_()`. This would eliminate the largest source of stale dashboard data.
- **Increase `RECENT_SCAN_LIMIT` from 0 to 500** once any single transaction sheet exceeds ~1,000 rows, to keep `rebuildRecentIndex_` within the 6-minute limit.
- **Consider storing the Settings sheet as a JSON column** rather than parallel columns, to support arbitrary numbers of categories without a fixed column schema.
