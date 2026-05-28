# Modularization Plan

## Current State

`script.js` is a 1,994-line single-file JavaScript application with no module system. All functions are global. The file is loaded with `<script src="script.js" defer>` — plain script tag, no `type="module"`.

**This document explains what exists today, the constraints that created it, and a safe path to split it — without breaking the running application.**

---

## Why It Is Structured This Way

Three constraints produced the monolith:

1. **GitHub Pages serves static files with no build step.** There is no bundler (Webpack, esbuild, Rollup) to combine module files into a single output. ES module resolution requires either a bundler or native browser `import`, and native `import` has complications explained below.

2. **`index.html` calls functions by name in inline event attributes.** `onclick="handleFormSubmit(event)"`, `onsubmit="handlePlanEditSubmit(event)"`, `onchange="toggleType('Expenses')"`, etc. Any function referenced this way must exist on `window`. ES modules do not export to `window` — they export to the module's local scope.

3. **Apps Script's global-scope model may have influenced the convention.** The backend uses no imports either, and the pattern carried into the frontend.

---

## Global State

The following variables are declared at the top level of `script.js` and read or written by multiple logical areas:

| Variable | Type | Writers | Readers |
|---|---|---|---|
| `systemCategories` | Object | `applyCategories_`, `loadCategories` (error branch) | `updateFormMode`, `updateCategories`, `populateEditTransactionOptions_`, `validateEditTransactionPayload_` |
| `IS_SUBMITTING` | Boolean | `handleFormSubmit` | `handleFormSubmit` |
| `ADD_DATE_LOCKED` | Boolean | `setupAddDateLock_`, `toggleDateLock` | `handleFormSubmit`, `setAddDateToday`, `updateDateLockHint_` |
| `ADD_QUICK_DATA_LOADED` | Boolean | `loadAddTransactionQuickData_`, `rebuildRecentIndex` | `loadAddTransactionQuickData_` |
| `TOAST_TIMER` | Timer ID | `showToast` | `showToast` |

`systemCategories` is the most dangerous — it is written asynchronously (after an API call resolves) and read synchronously (when the user opens a modal or form). In a module system it must be a mutable reference shared between modules, not a copied value.

---

## Functions That Must Remain on `window`

These are called by name from `index.html` attribute handlers. Any modularization that removes them from `window` breaks the corresponding UI element silently.

```
onclick:    refreshAll            showPage              archiveCurrentCycle
            loadRecentTransactions  closeEditTransactionModal

onsubmit:   handleFormSubmit      handlePlanEditSubmit  handleEditTransactionSubmit

onchange:   toggleType            toggleDateLock

other:      setAddDateToday       resetApiKey           logoutFinanceOS
            runSystemCheck        resetFinanceCache      rebuildRecentIndex
            refreshEverything
```

---

## Dependency Tier Map

Dependencies flow strictly top-to-bottom. No circular dependencies exist in the current code. Any module split must preserve this order.

```
Tier 0 — No dependencies (pure constants / pure functions)
┌──────────────────────────────────────────────────────────────┐
│  config     APPS_SCRIPT_API_URL, APP_FRONTEND_VERSION,       │
│             FINANCE_OS_API_KEY_STORAGE, PAGE_TITLES,         │
│             TYPE_STYLES, CLASS_INACTIVE                      │
├──────────────────────────────────────────────────────────────┤
│  utils      formatMoney, formatPercent, setText, setWidth,   │
│             firstNumber_, escapeHtml_, normalizeNumericInput_ │
│             sanitizeNumericInputsInForm_, getTodayLocal…     │
└──────────────────────────────────────────────────────────────┘

Tier 1 — Depends on config only
┌──────────────────────────────────────────────────────────────┐
│  api        apiGet_, apiPost_, getApiKey_, buildApiUrl_,      │
│             handleApiPayload_, resetApiKey, logoutFinanceOS  │
├──────────────────────────────────────────────────────────────┤
│  state      systemCategories, IS_SUBMITTING, ADD_DATE_LOCKED,│
│             ADD_QUICK_DATA_LOADED, TOAST_TIMER               │
└──────────────────────────────────────────────────────────────┘

Tier 2 — Depends on config + utils + state
┌──────────────────────────────────────────────────────────────┐
│  toast      showToast (needs TOAST_TIMER from state)         │
├──────────────────────────────────────────────────────────────┤
│  date-lock  setupAddDateLock_, toggleDateLock, setAddDateToday│
│             updateDateLockHint_                              │
└──────────────────────────────────────────────────────────────┘

Tier 3 — Depends on api + state + utils + toast
┌──────────────────────────────────────────────────────────────┐
│  categories  loadCategories, applyCategories_, toggleType,   │
│              updateFormMode, updateCategories, fillSelect    │
├──────────────────────────────────────────────────────────────┤
│  render-recent  renderRecentTransactions,                    │
│                 renderRecentMiniTransactions,                │
│                 renderRecentTransactionItem_,                │
│                 getTypeMeta, getRecentAmountMeta_            │
└──────────────────────────────────────────────────────────────┘

Tier 4 — Depends on everything in Tier 3 and below
┌──────────────────────────────────────────────────────────────┐
│  render-dashboard  renderFinancialSummary (orchestrator),    │
│                    renderDailyControlPanel,                  │
│                    renderBudgetGuard,                        │
│                    renderMonthlyPatternInsight,              │
│                    renderPlanProgress, renderCycleReview,    │
│                    renderPlanEditor, renderArchiveStatus,    │
│                    renderHistoryInsight, renderCycleHistory, │
│                    renderAICoachBadge_, all skeletons,       │
│                    loadFinancialStatus                       │
└──────────────────────────────────────────────────────────────┘

Tier 5 — Depend on render-dashboard + render-recent
┌──────────────────┐ ┌───────────────────┐ ┌───────────────┐
│  transactions    │ │  edit-transaction  │ │  plan-editor  │
│  handleFormSubmit│ │  openEditTx…      │ │  handlePlan…  │
│  validateTx      │ │  handleEditTxSubmit│ │  updateBuffer │
│  setSubmitState  │ │  deleteTransaction │ │  Preview      │
└──────────────────┘ └───────────────────┘ └───────────────┘
┌──────────────────────────────────────────────────────────────┐
│  system-check   ensureSettingsToolsPanel_, runSystemCheck,   │
│                 renderSystemCheckReport_, resetFinanceCache, │
│                 rebuildRecentIndex                           │
└──────────────────────────────────────────────────────────────┘

Tier 6 — App bootstrap (loads last)
┌──────────────────────────────────────────────────────────────┐
│  app    DOMContentLoaded handler, showPage,                  │
│         refreshAll, refreshEverything                        │
└──────────────────────────────────────────────────────────────┘
```

---

## Specific Risks Before Modularizing

### R1 — `validateTransaction` mutates its argument
`validateTransaction(data)` at line 1954 writes `data.amount = normalizeNumericInput_(data.amount)`. `handleFormSubmit` passes `data` directly and reads `data.amount` afterward. Any refactor that copies the object before calling `validateTransaction` silently produces a pre-normalized vs. post-normalized mismatch. **Document this before touching either function.**

### R2 — `renderFinancialSummary` calls 10 render functions
If those render functions are in separate files, `render-dashboard.js` must import all of them, giving it the highest import fan-in in the project. Do not split the render functions across more than two files — it will create a dependency tangle.

### R3 — `systemCategories` is a shared mutable reference
In a module system, if two modules each receive `systemCategories` by value at import time, mutations in `applyCategories_` will not be visible to the edit modal. The state module must export the **object reference**, not a copy.

### R4 — `escapeHtml_` is used inside `innerHTML`
`renderBudgetGuard` injects `alert.title` and `alert.message` through `escapeHtml_` into `innerHTML`. This is the XSS boundary. `escapeHtml_` must be in the lowest tier (utils), loaded first, and never shadowed by another function with the same name in another file.

### R5 — Load order is the only dependency enforcer in Phase 1
With multiple `<script>` tags and no module syntax, the order of script tags in `index.html` is the sole thing that enforces the dependency graph. A script tag in the wrong position produces silent `undefined is not a function` errors at runtime.

### R6 — No automated tests
There is no test suite. A refactor can only be validated by loading the page and manually exercising every feature. Plan for a full manual test pass after each file split.

### R7 — `ADD_QUICK_DATA_LOADED` is reset by `rebuildRecentIndex`
`rebuildRecentIndex` sets `ADD_QUICK_DATA_LOADED = false` to force a category reload next time the Add page is opened. If these are in different modules, this cross-module mutation must be handled via a setter function or a shared state reference.

---

## Recommended Module Structure

Eleven files, 1,994 lines reorganized:

| File | Est. Lines | Key Contents |
|---|---|---|
| `js/config.js` | 20 | All top-level `const` declarations |
| `js/utils.js` | 90 | Pure formatting and DOM helpers; `escapeHtml_` |
| `js/api.js` | 80 | `apiGet_`, `apiPost_`, `getApiKey_`, auth functions |
| `js/state.js` | 25 | All shared mutable variables; setters if using ES modules |
| `js/toast.js` | 30 | `showToast` |
| `js/date-lock.js` | 55 | Date lock toggle, hint update |
| `js/categories.js` | 120 | `loadCategories`, `applyCategories_`, `toggleType`, `fillSelect` |
| `js/render-recent.js` | 180 | All recent transaction rendering functions |
| `js/render-dashboard.js` | 520 | `renderFinancialSummary` + all sub-renders + skeletons + `loadFinancialStatus` |
| `js/transactions.js` | 300 | Form submit, validation, edit modal, delete |
| `js/system-check.js` | 160 | System check panel, cache reset, rebuild |
| `js/app.js` | 45 | Bootstrap: `DOMContentLoaded`, `showPage`, `refreshAll` |

**Total: ~1,625 lines** (reduction from 1,994 due to elimination of blank lines and structural comments when reorganized).

---

## Phase 1: File Split Without Module Syntax (Recommended First Step)

All functions remain global. No `import` or `export`. `index.html` event attributes are unchanged.

**What changes in `index.html`:** The single `<script src="script.js" defer>` is replaced with multiple tags in tier order:

```html
<!-- Tier 0 -->
<script src="js/config.js" defer></script>
<script src="js/utils.js" defer></script>
<!-- Tier 1 -->
<script src="js/api.js" defer></script>
<script src="js/state.js" defer></script>
<!-- Tier 2 -->
<script src="js/toast.js" defer></script>
<script src="js/date-lock.js" defer></script>
<!-- Tier 3 -->
<script src="js/categories.js" defer></script>
<script src="js/render-recent.js" defer></script>
<!-- Tier 4 -->
<script src="js/render-dashboard.js" defer></script>
<!-- Tier 5 -->
<script src="js/transactions.js" defer></script>
<script src="js/system-check.js" defer></script>
<!-- Tier 6 — must be last -->
<script src="js/app.js" defer></script>
```

**Validation:** Load the page, open DevTools Console, confirm no errors. Then test every button, form, and page navigation manually.

This is a pure refactor — zero behavior change. It also produces working modular files that can be migrated to Phase 2 at any pace.

---

## Phase 2: ES Modules (Optional — Higher Effort)

Enables `import`/`export`, removes global pollution, allows tooling like linters and bundlers to check dependencies.

**Prerequisites:**
1. Convert all `onclick="fn()"` and `onsubmit="fn(event)"` attributes in `index.html` to `addEventListener` calls inside `app.js`.
2. Add `export` to every public function.
3. Add `import` to every consumer file.
4. Change `<script src="js/app.js" defer>` to `<script type="module" src="js/app.js">`.
5. Remove all other `<script>` tags — the module graph resolves them.

**Risk:** Any missed inline handler in `index.html` silently does nothing when the user interacts with it. The conversion of all event handlers must be done in one commit and requires a full manual test pass.

---

## What Must Not Be Split Across Files

These function groups are tightly coupled and must stay together regardless of phase:

| Group | Why |
|---|---|
| `renderFinancialSummary` + all 10 sub-render functions | All called from one orchestrator; separating them creates a high-fan-in import burden |
| `toggleType` + `updateFormMode` + `updateCategories` + `fillSelect` | Tight call chain; all read `systemCategories`; separating would require passing state between functions in the same call stack |
| `handleFormSubmit` + `validateTransaction` | `validateTransaction` mutates its argument and both functions are in the same call flow |

---

## Prerequisites Before Starting

Before splitting any code:

- [ ] Document the `validateTransaction` mutation side-effect in a comment at the function definition.
- [ ] Confirm `escapeHtml_` will be in `utils.js` (Tier 0), loaded before any render file.
- [ ] Map every function referenced in `index.html` event attributes to ensure none are missed in the split.
- [ ] Read the current `script.js` line count and function list as a baseline to verify nothing is lost.
- [ ] Plan the manual test pass: list every UI action that must be tested (all 5 pages, all form submissions, edit/delete, archive, system check, cache reset, lock app).
