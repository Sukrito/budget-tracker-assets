# Personal AI Finance OS

Budget Tracker web app built with Google Apps Script, Google Sheets, and a lightweight frontend.

This project is used as a personal finance operating system for tracking income, expenses, savings, plans, goals, cycle summaries, monthly insights, and safe daily spending.

## Current Repository Structure

budget-tracker-assets/
- gas/        Apps Script runtime source pushed by clasp
- docs/       Project documentation and deployment notes
- assets/     Icons and static assets not pushed to Apps Script
- CLAUDE.md   Claude Code project guidance
- README.md
- .gitignore
- .claspignore

## Important Folders

### gas/

This folder contains the actual Apps Script project source.

Only files inside gas/ should be pushed to Apps Script.

Main files include:

- Code.js — API routing and web app entry points
- Config.js — app metadata, version, and configuration
- Security.js — API key and request validation
- SheetService.js — Google Sheets access helpers
- TransactionService.js — transaction create/update/delete logic
- SummaryService.js — dashboard and financial summary logic
- RecentService.js — recent transaction data
- SystemCheckService.js — health/system check logic
- index.html — web app shell
- script.js — frontend application logic
- appsscript.json — Apps Script manifest

### docs/

Project documentation, architecture notes, deployment workflow, known risks, and development notes.

### assets/

Static project assets such as icons.

These are not pushed to Apps Script.

## Development Workflow

Recommended workflow:

1. cd into the project folder
2. run git status
3. run clasp pull before editing if the Apps Script editor may have changed
4. edit files inside gas/
5. review changes with git diff
6. commit changes to Git
7. push to GitHub
8. run clasp push
9. create a new Apps Script deployment version
10. run health check

## Deployment Workflow

Important:

clasp push only uploads code to the Apps Script editor.

It does not update the live /exec web app.

To make changes live:

1. Open Apps Script
2. Go to Deploy
3. Choose Manage deployments
4. Edit the existing web app deployment
5. Select New version
6. Add a version description
7. Click Deploy
8. Run the health check
9. Confirm the expected backendVersion

## Health Check

After deployment, run the project health check and confirm:

- backend version is correct
- spreadsheet connection works
- required sheets exist
- required headers exist
- API security works
- recent transactions load correctly
- dashboard summary loads correctly

## Current Deployment Notes

Recent important versions:

- v12.9.1 — bug fixes for zero available cash, goal validation consistency, and API logging status
- v13.0.0 — frontend loading and refresh consistency improvements

## Apps Script Source Isolation

The repository is structured so that Apps Script source lives inside gas/.

The local .clasp.json should use rootDir: gas.

This prevents documentation, assets, Git files, and Claude files from being pushed into Apps Script.

## Files That Should Not Be Pushed to Apps Script

These should stay outside Apps Script runtime:

- docs/
- assets/
- CLAUDE.md
- README.md
- .git/
- .gitignore
- .claspignore
- .clasp.json

## Safety Rules

Before changing app logic:

1. Pull latest Apps Script state with clasp pull
2. Check git status
3. Make the smallest safe change
4. Commit to Git
5. Push to GitHub
6. Run clasp push
7. Create a new Apps Script deployment version
8. Run health check
9. Verify in browser

Do not mix unrelated fixes in one commit.

## Claude Code Usage

Use Claude Code for:

- architecture review
- safe debugging plans
- small bug fixes
- deployment checklist
- documentation updates
- refactor planning

Do not let Claude perform large refactors without first producing a plan.
