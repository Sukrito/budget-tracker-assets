# Deployment Workflow

## Overview

There are two independent deployment targets. Neither depends on the other at build time, but they must be kept in sync at runtime — the frontend's `APPS_SCRIPT_API_URL` must point to a live Apps Script deployment.

```
Local working copy
        │
        ├─── clasp push ─────► Apps Script project
        │                              │
        │                     Deploy → Update existing
        │                              │
        │                         /exec URL (stable)
        │
        └─── git push ────────► GitHub repo (main branch)
                                       │
                                  GitHub Pages
                                       │
                               yourusername.github.io/repo
```

---

## Backend Deployment (Apps Script)

### Prerequisites (one-time)

```bash
npm install -g @google/clasp
clasp login          # opens browser OAuth flow
```

### Standard workflow

```bash
# 1. Sync from remote before editing (prevents overwriting IDE-only changes)
clasp pull

# 2. Make changes to .js files locally

# 3. Bump all five version fields in Config.js (see Version Bump section)

# 4. Push to Apps Script
clasp push

# 5. Update the existing deployment (keeps URL stable — see URL Stability below)
clasp open
# In browser: Deploy → Manage deployments → Edit (pencil icon) on existing deployment
# → Select "New version" → Deploy
```

### URL Stability — the most important deployment rule

There are two ways to publish a new version in Apps Script:

| Action | Result |
|---|---|
| **Deploy → Manage deployments → Edit → New version** | Same `/exec` URL. **Use this.** |
| **Deploy → New deployment** | **New `/exec` URL.** Old URL stops working immediately. |

**Always use "Edit existing deployment."** If a new deployment is accidentally created:
1. Copy the new `/exec` URL from Manage deployments.
2. Update `APPS_SCRIPT_API_URL` at the top of `script.js`.
3. Commit and push to GitHub Pages.
4. Re-enter the new URL on any device where it is stored in `sessionStorage`.

### clasp reference

```bash
clasp push          # upload local files to Apps Script (does not deploy)
clasp pull          # download current Apps Script state to local files
clasp open          # open Apps Script IDE in browser
clasp deployments   # list all deployments and their IDs/URLs
clasp deploy        # CLI deploy (prefer IDE Manage deployments for URL control)
```

---

## Version Bump

**Required on every backend change, before `clasp push`.** All five values in `Config.js` must be updated together. Skipping `SUMMARY_CACHE_KEY` is the most common mistake — it causes users to receive stale dashboard data from the old cache after an upgrade.

```js
// Config.js
const APP_META = {
  BACKEND_VERSION: 'X.Y.Z',                  // semver: X = major, Y = minor, Z = patch
  BACKEND_LABEL: 'vX.Y Short description',   // one line, used in health endpoint
  RELEASE_DATE: 'yyyy-MM-dd',                // today's date
  FRONTEND_EXPECTED_VERSION: 'X.Y.Z',        // match backend if frontend also changed
};

const API_SECURITY = {
  SUMMARY_CACHE_KEY: 'finance_summary_vX_Y', // must change — invalidates both cache layers
};
```

Also update in `script.js` for frontend-only or combined releases:

```js
const APP_FRONTEND_VERSION = 'X.Y.Z';
const APP_RELEASE_LABEL = 'vX.Y Short description';
const FINANCE_OS_API_KEY_STORAGE = 'finance_os_session_secret_vX_Y'; // only change for key rotation
```

---

## Backend Verification

After deploying, confirm the new version is live before touching the frontend.

**Health check** (no key required):
```
GET <WEB_APP_URL>?action=health
```
Expected:
```json
{
  "status": "success",
  "app": "Personal AI Finance OS API",
  "version": { "backendVersion": "X.Y.Z", ... }
}
```

**Full diagnostics** (read key required):
```
GET <WEB_APP_URL>?action=systemCheck&key=<your_key>
```
Check for:
- `"status": "success"` (not `"error"` or `"warning"`)
- `errors: []` — empty array
- All sheets listed as `exists: true`, `headerOk: true`
- Both cache layers accessible

---

## Frontend Deployment (GitHub Pages)

### Workflow

```bash
# 1. Edit script.js and/or styles.css (and index.html if structure changes)
# 2. For combined releases, ensure APP_FRONTEND_VERSION is bumped in script.js

git add script.js          # or: styles.css, index.html
git commit -m "feat: describe change"
git push origin main
```

GitHub Pages deploys automatically on every push to `main`. No build step. Changes are live within ~1 minute.

### After deployment

- **Browser:** hard-refresh with `Shift+Reload` (bypasses cache)
- **Installed PWA (iOS Safari):** delete and re-add to Home Screen if a service worker is caching the old version
- **Verify:** open browser DevTools → Network tab → confirm `script.js` response timestamp matches the push

### First-time GitHub Pages setup (one-time)

Repository Settings → Pages → Source: Deploy from a branch → Branch: `main` / directory: `/` (root)

---

## Secret Key Configuration (one-time)

Secrets are set directly in the Apps Script project, never in source code.

1. `clasp open` → Project Settings (gear icon) → Script Properties
2. Add the following properties:

| Property Name | Description |
|---|---|
| `FINANCE_OS_API_SECRET` | Legacy key — covers all tiers if scoped keys are not set. Sufficient for personal use. |
| `FINANCE_OS_READ_SECRET` | Scoped read key: dashboard, recent, system check |
| `FINANCE_OS_WRITE_SECRET` | Scoped write key: recordTransaction, updateCurrentPlan |
| `FINANCE_OS_ADMIN_SECRET` | Scoped admin key: delete, archive, cache reset, rebuild |

Using only `FINANCE_OS_API_SECRET` is sufficient for personal single-user deployment. The scoped keys allow more granular control if needed.

---

## Auto-Update Trigger

The spreadsheet menu (Finance OS → Create Auto Update Trigger) registers a monthly time-based trigger that runs `updateHolidaysAndPayCycles` on the 1st of each month at 06:00 Bangkok time. This keeps `Holidays` and `Pay_Cycles` sheets current for the next 5 years without manual action.

To install: open the spreadsheet → Finance OS menu → Create Auto Update Trigger.
To verify: Apps Script IDE → Triggers (clock icon) → confirm trigger exists for `updateHolidaysAndPayCycles`.

---

## Rollback Procedures

### Backend rollback

Apps Script maintains a version history for each deployment.

```
clasp open
→ Deploy → Manage deployments → Edit (pencil) on the deployment
→ Select an older version from the "Version" dropdown
→ Deploy
```

This is instant and keeps the same URL. The previous code version is served immediately.

If `Config.js` was changed (new cache key, header arrays, sheet names), also check whether the rollback requires any sheet repair. Run `systemCheck` after rollback to confirm.

### Frontend rollback

```bash
# Find the commit to roll back to
git log --oneline script.js

# Revert to a specific commit
git checkout <commit-sha> -- script.js
git commit -m "revert: roll back script.js to <commit-sha>"
git push origin main
```

This creates a new commit — it does not rewrite history. GitHub Pages redeploys within ~1 minute.

### Full rollback (both layers)

Roll back the backend first (Apps Script version), then roll back the frontend (`script.js`) to the version that matches. Run `systemCheck` and verify the `backendVersion` in the health response matches what `script.js` expects (`APP_FRONTEND_VERSION`).

---

## Future Recommendations

> The following are not part of the current implementation.

- **Add a GitHub Actions workflow** that lints `script.js` on every push to `main` to catch syntax errors before they reach GitHub Pages users.
- **Tag every release** with `git tag vX.Y.Z` so frontend rollbacks can use `git checkout vX.Y.Z -- script.js` instead of commit hashes.
- **Document the `/exec` URL** in a secure location outside the repository (e.g., a password manager) so it can be recovered if the `.clasp.json` is lost.
- **Consider a staging deployment** — a second Apps Script deployment (different URL, test key) that can be validated before updating the production deployment.
