# Personal AI Finance OS v12.9

This release focuses on project cleanup, versioning, and maintainability.

## Files

- `backend/` — split Google Apps Script backend files.
- `frontend/script.js` — single frontend JS file for GitHub Pages.
- `CHANGELOG.md` — release history.
- `docs/` — deployment and backup documentation.

## Install

1. Copy all files inside `backend/` to Apps Script as separate `.gs` files.
2. Replace GitHub root `script.js` with `frontend/script.js`.
3. Deploy Apps Script as New version.
4. Commit GitHub changes.
5. Run System Check.

# Changelog

## v12.9.0 — Project Cleanup + Versioning + Changelog

### Added
- Added `APP_META` in `Config.gs` for backend version tracking.
- Added `VersionService.gs` with `getVersionInfo_()`.
- Added `version` API action.
- Added backend version output to `health` and `systemCheck`.
- Added frontend constants `APP_FRONTEND_VERSION` and `APP_RELEASE_LABEL`.
- Added project documentation files.

### Changed
- Updated backend header comments from v12.8 to v12.9.
- Updated summary cache key to `finance_summary_v12_9` to avoid stale cache from older builds.
- Updated session key storage name to `finance_os_session_secret_v12_9`.

### Notes
- No major business logic change.
- This release focuses on maintainability, deploy tracking, and safer future debugging.
