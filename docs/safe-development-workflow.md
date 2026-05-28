# Safe Development Workflow

## Session Start Checklist

Run these before making any change, every time.

```
□ clasp pull                          ensure local files match IDE state
□ GET <URL>?action=systemCheck&key=X  confirm baseline is healthy
  → status: "success"
  → errors: []
  → all sheets: exists: true, headerOk: true
□ git status                          confirm no uncommitted changes
```

If `systemCheck` returns any errors, fix them before proceeding. Do not change application code on top of a broken baseline.

---

## Change Risk Classification

| Change Type | Risk | Requires Backend Deploy | Requires Frontend Deploy |
|---|---|---|---|
| Edit `styles.css` only | Low | No | Yes (git push) |
| Edit `script.js` UI/rendering only | Low | No | Yes (git push) |
| Edit `script.js` API call or payload shape | Medium | Depends | Yes |
| Edit any `.js` service file (backend logic) | Medium | Yes | No |
| Edit `Code.js` (routing) | High | Yes | No |
| Edit `Config.js` (any constant) | High | Yes | Maybe |
| Edit a header array in `Config.js` | Very High | Yes | No |
| Edit `Security.js` | Very High | Yes | No |

---

## Frontend-Only Changes

**Risk: Low.** No `clasp push` or backend redeploy needed.

```bash
# 1. Edit script.js or styles.css
# 2. For UI/logic only changes, no version bump needed
#    For changes that affect the API shape or expected response, bump APP_FRONTEND_VERSION

git add script.js         # or styles.css, index.html
git commit -m "feat: describe change"
git push origin main
```

After pushing: hard-refresh the browser (`Shift+Reload`). Test the affected feature manually. Check the browser console for errors.

---

## Backend Logic Changes

**Risk: Medium.** Requires full release sequence.

1. `clasp pull` to sync local state.
2. Edit the targeted service file. Prefer isolated service files over `Code.js` or `Config.js`.
3. Update all five version fields in `Config.js` (see Version Bump Template).
4. `clasp push`.
5. In Apps Script IDE: Deploy → Manage deployments → Edit → New version → Deploy.
6. `GET <URL>?action=health` — confirm new `backendVersion` in response.
7. `GET <URL>?action=systemCheck&key=X` — confirm no errors.
8. Exercise the affected feature through the frontend.
9. Commit with `git add *.js && git commit -m "feat/fix: describe change"`.

**Do not** edit `Code.js` unless you are adding or removing a top-level API action. Routing errors silently swallow all requests to that action with no useful error message.

---

## `Config.js` Changes

**Risk: Very High.** `Config.js` is a shared dependency for every other file.

| What changed | Post-deploy verification |
|---|---|
| `APP_META` or `APP_CONFIG` fields | Run health check; check version fields |
| `API_SECURITY.SUMMARY_CACHE_KEY` | Run dashboard load; confirm fresh data (not old cache) |
| `API_SECURITY.*_ACTIONS` lists | Test that affected actions accept the right keys; test that wrong keys are rejected |
| Sheet name constant | Run systemCheck; confirm sheet is found by new name |
| Header array | Run systemCheck; confirm header row is correct in actual sheet; run `setupFinanceOS()` to repair if needed |

Change only what is necessary. Never edit multiple constants in a single unreviewed commit.

---

## Adding a New API Action

```
□ Write the handler function in the appropriate service file (NOT in Code.js)
□ Add dispatch branch in doGet or doPost in Code.js
□ Register action name in Config.js in the correct tier:
    PUBLIC_ACTIONS  → no key required
    WRITE_ACTIONS   → requires FINANCE_OS_WRITE_SECRET (or fallback)
    ADMIN_ACTIONS   → requires FINANCE_OS_ADMIN_SECRET (or fallback)
    (omitting = defaults to READ tier)
□ Bump backend version (all five fields)
□ clasp push → deploy
□ Test with correct key: confirm success
□ Test with wrong key: confirm 'Unauthorized' error
□ Test with missing key: confirm 'Unauthorized' error
□ Test public endpoint without key (if PUBLIC): confirm no key required
```

---

## Adding a New Sheet

```
□ Add SHEET_<NAME> constant to APP_CONFIG in Config.js
□ Define <NAME>_HEADERS constant array in Config.js
□ Add ensureSheet_(ss, APP_CONFIG.SHEET_<NAME>, <NAME>_HEADERS) in ensureWorkbook_() in SheetService.js
□ Add formatSheet_(sheet, <NAME>_HEADERS.length) in ensureWorkbook_() in SheetService.js
□ Add sheet to requiredSheets array in SystemCheckService.js
□ Run setupFinanceOS() from Apps Script IDE to create the sheet in the Spreadsheet
□ Run systemCheck to confirm sheet appears with correct headers
```

---

## Version Bump Template

Required on every backend release. Edit `Config.js`:

```js
const APP_META = {
  BACKEND_VERSION: 'X.Y.Z',
  BACKEND_LABEL: 'vX.Y Short one-line description',
  RELEASE_DATE: 'yyyy-MM-dd',
  FRONTEND_EXPECTED_VERSION: 'X.Y.Z',  // match if frontend changed too
};

const API_SECURITY = {
  SUMMARY_CACHE_KEY: 'finance_summary_vX_Y',  // ← most important field
};
```

Also update in `script.js` if frontend changed:

```js
const APP_FRONTEND_VERSION = 'X.Y.Z';
const APP_RELEASE_LABEL = 'vX.Y Short one-line description';
```

---

## Testing Without an Automated Test Suite

There is no test runner. Use this manual sequence before every production deploy.

**Backend:**
1. `clasp push` to Apps Script.
2. Test pure logic functions (no Sheets I/O) via the "Run" button in the IDE with a mock object.
3. Run `getSystemCheck_()` from the IDE — confirm no sheet or key regressions.
4. Deploy the new version.
5. Run `GET <URL>?action=health` — confirm new version number.
6. Run `GET <URL>?action=systemCheck&key=X` — confirm status: success.

**Frontend:**
7. Hard-refresh the browser.
8. Navigate all five pages (dashboard, add, plan, history, settings).
9. Submit a test transaction (Income) and confirm it appears in Recent list.
10. Open the edit modal, change the note, save — confirm the change persists.
11. Run System Check from the Settings page.
12. Check the browser console for any JavaScript errors.

**Additional checks introduced in v12.9.1 (run after any change to SummaryService, TransactionService, or Code.js):**

13. **Zero-balance account display** — if the Accounts sheet has a Cash or Investment row, set its Current Balance to `0`, reset the cache, reload the dashboard. The displayed value must be `0`, not a fallback computation. Restore afterward.
14. **Goal validation** — record a Savings transaction with a goalName that is not in the Goals sheet. The API must return `status: 'error'` and write no row. Record the same transaction with a valid goalName — it must succeed.
15. **API log accuracy** — call `updateTransaction` or `deleteTransaction` with an invalid transaction ID. Open `ApiLogs` and confirm the entry shows status `error`, not `success`.

---

## Recovery Procedures

### Dashboard shows stale data
```
POST { "action": "resetFinanceCache", "key": "<admin_key>" }
```
Then reload the dashboard. If still stale, confirm the backend was deployed with a new `SUMMARY_CACHE_KEY`.

### Recent transactions list is wrong, missing, or stale after a direct sheet edit
```
POST { "action": "rebuildRecentIndex", "key": "<admin_key>", "data": { "limit": 200 } }
```
Rescans all four transaction sheets and rewrites `Recent_Index` from scratch.

### Sheet headers are wrong after a `Config.js` header array change
Run `setupFinanceOS()` from the Apps Script IDE. This calls `ensureWorkbook_()` which rewrites headers for any sheet where they don't match the constants.

### `/exec` URL changed after a "New deployment" was created accidentally
1. Copy the new URL: Apps Script IDE → Deploy → Manage deployments.
2. Update `APPS_SCRIPT_API_URL` at the top of `script.js`.
3. `git add script.js && git commit -m "chore: update Apps Script exec URL" && git push`.

### All API calls failing after a backend change
1. Run health check (`?action=health`) — no key required.
2. If health fails: check the Apps Script execution log for errors.
3. If health succeeds but other actions fail: check systemCheck for key configuration issues.
4. Roll back via Apps Script: Deploy → Manage deployments → Edit → select previous version.

---

## Git Commit Conventions

```
feat: short description      ← new capability
fix: short description       ← bug corrected
chore: short description     ← version bump, deploy wiring, config update
docs: short description      ← documentation only
refactor: short description  ← restructure, no behavior change
revert: short description    ← rolling back a previous commit
```

One concern per commit. Keep logic changes, version bumps, and URL updates in separate commits when possible — it makes rollback (`git checkout <sha> -- file`) precise.

---

## Future Recommendations

> The following are not part of the current implementation.

- **Add `node --check script.js`** as a pre-push git hook to catch syntax errors before they reach GitHub Pages. This is a one-line `.git/hooks/pre-push` addition.
- **Add git tags for every release** (`git tag v12.9.0`) so rollbacks use `git checkout v12.8.0 -- script.js` instead of commit SHA lookups.
- **Document the Apps Script `/exec` URL** in a password manager or secure note, separate from the repository. It is not committed to git (correctly) but needs to be recoverable if `.clasp.json` is lost.
