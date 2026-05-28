# Frontend / Backend Flow

## Overview

The frontend (`script.js`) communicates with the backend (Apps Script Web App) exclusively through `fetch()` over HTTPS. There is no WebSocket, no server-side rendering, and no shared session. Every request is stateless except for the API secret, which is stored in `sessionStorage` on the client.

---

## Request Lifecycle

```
User action (tap / form submit)
        │
        ▼
script.js builds the request
  GET:  buildApiUrl_(action, params)
        → APPS_SCRIPT_API_URL + ?action=X&key=SECRET[&param=val]
  POST: APPS_SCRIPT_API_URL
        body: JSON.stringify({ action, data, key: SECRET })
        │
        ▼
fetch() with redirect: 'follow', cache: 'no-store'
        │
        ▼
Apps Script /exec endpoint receives request
        │
        ▼
doGet(e) or doPost(e)
        │
        ├─► parseApiPostBody_(e)         (POST: parse JSON body)
        ├─► Security.requireApiSecret_() (all actions except health)
        │     throws Error on bad key → caught, returned as { status: 'error' }
        │
        ├─► Dispatch to service function
        │
        └─► apiJsonOutput_({ status, ...payload })
                │
                ▼
        ContentService JSON response
        │
        ▼
script.js: handleApiPayload_(payload, action)
  → throws on status: 'error'
  → clears stored key if error message matches /unauthorized/
  → returns payload on success
        │
        ▼
Caller renders result or shows toast on error
```

---

## Authentication Flow

```
First request of session
        │
        ▼
getApiKey_()
  → reads sessionStorage[FINANCE_OS_API_KEY_STORAGE]
  → if empty: window.prompt() for key
  → stores in sessionStorage on success

Subsequent requests
  → reads from sessionStorage (no prompt)

On 401 / unauthorized error
  → clears sessionStorage key
  → next request triggers prompt again

logoutFinanceOS() / resetApiKey()
  → removes both sessionStorage and legacy localStorage key
  → reloads page
```

The key is stored in `sessionStorage`, not `localStorage` — it is cleared automatically when the browser tab is closed. The legacy key name (`finance_os_api_secret_v1`) in `localStorage` is also cleared on logout for backwards compatibility.

---

## GET Endpoints

| Action | Auth Tier | Query Parameters | Handler Function |
|---|---|---|---|
| `health` | **Public** (no key) | — | Inline in `Code.js` |
| `version` | Read | — | `getVersionInfo_()` |
| `systemCheck` | Read | — | `getSystemCheck_()` |
| `getFinancialSummary` | Read | — | `getFinancialSummaryCached_()` |
| `getCategoriesFromSettings` | Read | — | `getCategoriesFromSettings()` |
| `getAddTransactionQuickData` | Read | — | `getAddTransactionQuickData()` |
| `getRecentTransactions` | Read | `limit` (default: 10) | `getRecentTransactions()` |
| `getTransactionById` | Read | `transactionId` (required) | `getTransactionById()` |
| `getCycleHistory` | Read | `limit` (default: 6) | `getCycleHistory()` |

---

## POST Endpoints

| Action | Auth Tier | `data` Payload Fields | Handler Function |
|---|---|---|---|
| `recordTransaction` | Write | See transaction shapes below | `recordTransaction()` |
| `updateCurrentPlan` | Write | `expectedIncome`, `payMother`, `debtBills`, `savingsPlan`, `livingBudget`, `mainGoal`, `note` | `updateCurrentPlan()` |
| `updateTransaction` | **Admin** | `transactionId`, `data` (same shape as recordTransaction) | `updateTransaction()` |
| `deleteTransaction` | **Admin** | `transactionId` | `deleteTransaction()` |
| `archiveCurrentCycle` | **Admin** | note string (optional) | `archiveCurrentCycle()` |
| `resetFinanceCache` | **Admin** | — | `invalidateFinanceCache_()` |
| `rebuildRecentIndex` | **Admin** | `limit` (default: 200) | `rebuildRecentIndex_()` |

---

## Transaction Data Shapes

All fields pass through `sanitizeClientPayload_()` on the backend before reaching any service function.

### Income
```json
{
  "type": "Income",
  "date": "yyyy-MM-dd",
  "category": "Salary",
  "source": "Company Name",
  "amount": 50000,
  "note": ""
}
```

### Expenses
```json
{
  "type": "Expenses",
  "date": "yyyy-MM-dd",
  "category": "Food",
  "item": "Lunch",
  "amount": 120,
  "paymentMethod": "Bank transfer",
  "essential": true,
  "note": ""
}
```

### Savings
```json
{
  "type": "Savings",
  "date": "yyyy-MM-dd",
  "category": "Emergency Fund 100k",
  "goalName": "Emergency Fund 100k",
  "action": "Deposit",
  "amount": 5000,
  "note": ""
}
```

### Investments
```json
{
  "type": "Investments",
  "date": "yyyy-MM-dd",
  "category": "Money Market",
  "action": "Buy",
  "item": "KSFUND",
  "amount": 10000,
  "quantity": 1,
  "price": 10000,
  "note": ""
}
```

---

## Response Envelope

All responses use the same wrapper:

```json
{ "status": "success" | "error", "message": "...", ...payload }
```

Write operations that succeed return the updated summary in-band to avoid a second round-trip:

```json
{
  "status": "success",
  "message": "บันทึกรายการเรียบร้อยแล้ว",
  "summary": { ...full dashboard payload },
  "recent": [ ...updated recent transactions ]
}
```

The dashboard payload includes a `_cache` field from `SummaryService`:

```json
{
  "_cache": {
    "hit": true,
    "layer": "script_cache" | "dashboard_cache_sheet" | "computed",
    "seconds": 300
  }
}
```

---

## Input Sanitization Pipeline

All POST payloads go through `sanitizeClientPayload_()` in `Utils.js` before any service function sees them:

```
Raw POST body
      │
      ▼
JSON.parse (parseApiPostBody_)
      │
      ▼
sanitizeClientPayload_()
  ├─► Numeric fields (amount, quantity, price, plan values)
  │     → normalizeNumberInput_()
  │     → strips ฿, บาท, commas, whitespace
  │     → handles Thai numerals (๐-๙)
  │
  ├─► Boolean fields (essential, isEssential)
  │     → toBooleanSafe_()
  │
  └─► All string fields
        → cleanText_()
        → strips control characters (U+0000–U+001F)
        → collapses whitespace
        → trims
        → max 300 chars (notes: 1000 chars)
```

Frontend also runs `sanitizeNumericInputsInForm_()` before building the payload, normalizing the same numeric fields at the input level.

---

## Frontend Validation

`validateTransaction()` runs client-side before any API call for new transactions:

1. Type must be in `['Income', 'Expenses', 'Savings', 'Investments']`
2. Date must be non-empty
3. Category must be non-empty
4. Amount must be a finite number > 0 (normalized via `normalizeNumericInput_`)
5. Savings type: `goalName` must be non-empty

**Side-effect:** `validateTransaction(data)` mutates `data.amount` in-place, replacing the string input with the normalized number. Callers that pass an object and read `data.amount` afterwards receive the normalized value.

`validateEditTransactionPayload_()` adds type-specific validation for the edit modal:
- Savings: action must be in `systemCategories.savingsActions`
- Investments: action must be in `systemCategories.investmentActions`

---

## Error Handling

| Error source | How it surfaces |
|---|---|
| Bad API key | Backend throws; frontend catches, shows toast, clears key from sessionStorage |
| Unknown action | Backend returns `{ status: 'error', message: 'Unknown GET/POST action: X' }` |
| Sheet missing | `ensureWorkbook_()` creates it; most errors are self-healing |
| Network failure | `fetch()` rejects; caught in `.catch()`, shows error toast |
| Apps Script timeout | Returns an HTML error page (not JSON); `res.json()` throws a parse error, shown as toast |
| Lock timeout | `LockService.waitLock(10000)` throws after 10 s; returned as `{ status: 'error' }` |

---

## Future Recommendations

> The following are not part of the current implementation.

- **Replace `window.prompt()` for key entry** with a proper login screen rendered in the app. The native `prompt()` dialog cannot be styled and is blocked by some mobile browsers.
- **Add a request timeout** to `apiGet_` and `apiPost_`. Currently a hung Apps Script execution will leave the UI spinner running indefinitely.
- **Consider structured error codes** in the response envelope (`errorCode: 'UNAUTHORIZED' | 'NOT_FOUND' | ...`) to allow the frontend to handle specific error cases without string-matching Thai/English messages.
- **Replace inline `onclick` handlers** with `addEventListener` calls wired up in `DOMContentLoaded`. This is a prerequisite for ES module adoption. See `modularization-plan.md`.
