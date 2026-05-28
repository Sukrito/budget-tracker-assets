# Release Checklist

Use this file as a working checklist during every release. Copy the relevant section, check off items as you complete them.

---

## Release Types

| Type | Files changed | Backend deploy | Frontend deploy |
|---|---|---|---|
| **Backend only** | One or more `.js` service files, `Config.js` | Yes | No |
| **Frontend only** | `script.js`, `styles.css`, or `index.html` | No | Yes |
| **Combined** | Both backend and frontend files | Yes | Yes |
| **Config/hotfix** | `Config.js` only (e.g. threshold values) | Yes | No |

---

## Pre-Release Health Check

Run before touching any code.

```
□ clasp pull
  → confirms local files match Apps Script IDE state

□ GET <WEB_APP_URL>?action=systemCheck&key=<read_key>
  → status: "success"
  → errors: []
  → all 12 sheets listed as exists: true
  → recent.status: "OK" (not "empty")
  → cache.scriptCache: "HIT" or "MISS" (not "error")

□ git status
  → working tree clean before starting
```

If `systemCheck` returns errors — stop. Fix the baseline before making a release.

---

## Backend Release (Apps Script)

```
□ Edit the target service file(s) — not Code.js unless adding/removing an action

□ Update Config.js — all five version fields:
    APP_META.BACKEND_VERSION         'X.Y.Z'
    APP_META.BACKEND_LABEL           'vX.Y Short description'
    APP_META.RELEASE_DATE            'yyyy-MM-dd'  ← today
    APP_META.FRONTEND_EXPECTED_VERSION  'X.Y.Z'
    API_SECURITY.SUMMARY_CACHE_KEY   'finance_summary_vX_Y'

□ clasp push
  → confirm "Pushed X files." with no errors

□ In Apps Script IDE:
  Deploy → Manage deployments → Edit (pencil) on existing deployment
  → Version: New version
  → Description: vX.Y.Z — short description
  → Deploy
  → confirm URL has NOT changed

□ GET <WEB_APP_URL>?action=health
  → version.backendVersion: "X.Y.Z"  ← matches what you set

□ GET <WEB_APP_URL>?action=systemCheck&key=<read_key>
  → status: "success"
  → errors: []

□ Test the affected feature end-to-end through the frontend
  → hard-refresh browser first (Shift+Reload)
  → confirm behavior matches expectation

□ git add Config.js <changed-service-files>
  git commit -m "feat/fix/chore: description  [vX.Y.Z]"
```

---

## Frontend Release (GitHub Pages)

```
□ Edit script.js and/or styles.css / index.html

□ If API shape changed or combined release:
    Update APP_FRONTEND_VERSION in script.js  →  'X.Y.Z'
    Update APP_RELEASE_LABEL in script.js     →  'vX.Y Short description'

□ git add script.js                           # or styles.css, index.html
  git commit -m "feat/fix: description"
  git push origin main

□ Wait ~60 seconds for GitHub Pages to deploy

□ Open the live URL in browser
  hard-refresh (Shift+Reload or Cmd+Shift+R)

□ Open DevTools → Console
  → no JavaScript errors

□ Navigate all five pages:
    □ Dashboard loads, shows financial summary
    □ Add page opens, category dropdowns populated
    □ Plan page shows current cycle
    □ History page shows cycle history
    □ Settings page opens, System Check panel present

□ Submit one test transaction
  → appears in Recent list immediately
  → dashboard totals update

□ Run System Check from Settings page
  → status: OK or Warning (not Error)
  → Frontend version matches Backend expected version
```

---

## Combined Release (Backend + Frontend)

Follow Backend Release steps first, then Frontend Release steps.

**Order matters:** Deploy the backend first and verify it is healthy before pushing the frontend. If the backend deploy fails, you do not want to push a frontend that calls a broken endpoint.

---

## Post-Release Verification

Run within 5 minutes of releasing.

```
□ GET <URL>?action=health
  → status: "success"
  → version.backendVersion matches the release

□ Load the dashboard on mobile (not desktop) — confirm layout is correct

□ Check ApiLogs sheet in the Spreadsheet
  → recent entries show 200 ms response times (not timeouts or errors)
  → no "error" status entries from the release actions

□ If systemCheck showed cache as MISS: reload dashboard once more
  → cache should now show HIT on next systemCheck
```

### v12.9.1 — Additional post-release checks

These verify the three bug fixes shipped in v12.9.1. Run once after the first deploy.

```
□ Zero-balance account display (Fix 1)
  → Set a Cash account row's Current Balance to 0 in Accounts sheet
  → POST resetFinanceCache, reload dashboard
  → availableCash must show 0, not openingCashBalance + fcf
  → Restore the original balance afterward

□ Goal validation consistency (Fix 2)
  → Record a Savings transaction with a goalName not in the Goals sheet
  → Must return { status: 'error' } — no row written
  → Record the same transaction with a valid goalName — must succeed

□ API log status accuracy (Fix 3)
  → Call updateTransaction with a made-up transaction ID
  → Open ApiLogs sheet — the entry must show status 'error', not 'success'
```

---

## Rollback: Backend

Use this if the new backend is broken and the frontend cannot recover.

```
□ In Apps Script IDE:
  Deploy → Manage deployments → Edit (pencil)
  → Version: select the previous version number
  → Deploy
  → URL remains the same — no frontend change needed

□ GET <URL>?action=health
  → backendVersion shows the rolled-back version number

□ GET <URL>?action=systemCheck&key=<read_key>
  → status: "success"

□ If Config.js was changed (header arrays, sheet names):
    Run setupFinanceOS() from Apps Script IDE
    → repairs any sheets affected by the rolled-back config
    Run systemCheck again to confirm

□ git revert <commit-sha>       ← creates a new revert commit
  git push origin main          ← keeps git history clean
```

---

## Rollback: Frontend

Use this if `script.js` has a bug visible to the user.

```
□ Find the last good commit:
  git log --oneline script.js
  → identify the SHA of the last known-good version

□ git checkout <good-sha> -- script.js
  git commit -m "revert: roll back script.js to <good-sha>"
  git push origin main

□ Wait ~60 seconds for GitHub Pages to redeploy

□ Hard-refresh on desktop and mobile to confirm rollback is live
```

---

## Emergency: All API Calls Failing

```
1. GET <URL>?action=health  (no key needed)
   → If this fails: the Apps Script deployment itself is broken
     → Roll back to previous Apps Script version immediately (see Rollback: Backend)

   → If this succeeds: the deployment is live but something else is wrong

2. GET <URL>?action=systemCheck&key=<read_key>
   → Check errors[] array for specific failures
   → Common causes:
       - Key not configured in Script Properties
       - Sheet missing or header mismatch
       - Dashboard_Cache sheet missing

3. Check Apps Script execution log:
   clasp open → Executions → look for red errors

4. Check browser DevTools → Network tab
   → Look for non-200 responses or HTML responses where JSON is expected
   → A 302 redirect usually means the /exec URL has changed
```

---

## Version Reference

| Field | Location | Current value (v12.9.1) |
|---|---|---|
| Backend version | `Config.js` → `APP_META.BACKEND_VERSION` | `12.9.1` |
| Backend label | `Config.js` → `APP_META.BACKEND_LABEL` | `v12.9.1 Bug fixes: zero-balance display, goal validation, API log status` |
| Release date | `Config.js` → `APP_META.RELEASE_DATE` | `2026-05-28` |
| Cache key | `Config.js` → `API_SECURITY.SUMMARY_CACHE_KEY` | `finance_summary_v12_9_1` |
| Frontend version | `script.js` → `APP_FRONTEND_VERSION` | `12.9.0` (frontend unchanged) |

All five backend fields must be updated together on every backend release.
