/*******************************************************
 * Personal AI Finance OS v12.9 Split Backend
 * File: SheetService.gs
 * Google Apps Script shares global scope across .gs files.
 *******************************************************/

function getSS_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('ไม่พบ Active Spreadsheet กรุณาเปิด Apps Script จาก Google Sheets หรือผูก Project กับ Spreadsheet ก่อน');
  }
  return ss;
}

function ensureWorkbook_() {
  const ss = getSS_();

  const incomeSheet = ensureSheet_(ss, APP_CONFIG.SHEET_INCOME, INCOME_HEADERS);
  const expenseSheet = ensureSheet_(ss, APP_CONFIG.SHEET_EXPENSES, EXPENSE_HEADERS);
  const savingsSheet = ensureSheet_(ss, APP_CONFIG.SHEET_SAVINGS, SAVINGS_HEADERS);
  const investmentSheet = ensureSheet_(ss, APP_CONFIG.SHEET_INVESTMENTS, INVESTMENT_HEADERS);
  const accountSheet = ensureSheet_(ss, APP_CONFIG.SHEET_ACCOUNTS, ACCOUNT_HEADERS);
  const planSheet = ensureSheet_(ss, APP_CONFIG.SHEET_PLANS, PLAN_HEADERS);
  const historySheet = ensureSheet_(ss, APP_CONFIG.SHEET_CYCLE_HISTORY, CYCLE_HISTORY_HEADERS);
  const planLogSheet = ensureSheet_(ss, APP_CONFIG.SHEET_PLAN_CHANGE_LOG, PLAN_CHANGE_LOG_HEADERS);
  const settingsSheet = ensureSheet_(ss, APP_CONFIG.SHEET_SETTINGS, SETTINGS_HEADERS);
  const recentIndexSheet = ensureSheet_(ss, APP_CONFIG.SHEET_RECENT_INDEX, RECENT_INDEX_HEADERS);
  const dashboardCacheSheet = ensureSheet_(ss, APP_CONFIG.SHEET_DASHBOARD_CACHE, DASHBOARD_CACHE_HEADERS);

  seedSettingsIfEmpty_(settingsSheet);
  formatSheet_(incomeSheet, INCOME_HEADERS.length);
  formatSheet_(expenseSheet, EXPENSE_HEADERS.length);
  formatSheet_(savingsSheet, SAVINGS_HEADERS.length);
  formatSheet_(investmentSheet, INVESTMENT_HEADERS.length);
  formatSheet_(accountSheet, ACCOUNT_HEADERS.length);
  formatSheet_(planSheet, PLAN_HEADERS.length);
  formatSheet_(historySheet, CYCLE_HISTORY_HEADERS.length);
  formatSheet_(planLogSheet, PLAN_CHANGE_LOG_HEADERS.length);
  formatSheet_(settingsSheet, SETTINGS_HEADERS.length);
  formatSheet_(recentIndexSheet, RECENT_INDEX_HEADERS.length);
  formatSheet_(dashboardCacheSheet, DASHBOARD_CACHE_HEADERS.length);
}

function ensureSheet_(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);

  const currentHeader = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const normalizedCurrent = currentHeader.map(v => String(v || '').trim());
  const isHeaderMissing = normalizedCurrent.every(v => v === '');
  const needsRewrite = headers.some((h, i) => normalizedCurrent[i] !== h);

  if (isHeaderMissing || needsRewrite) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  return sheet;
}

function seedSettingsIfEmpty_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) return;

  const lists = [
    DEFAULT_SETTINGS.income,
    DEFAULT_SETTINGS.expense,
    DEFAULT_SETTINGS.paymentMethods,
    DEFAULT_SETTINGS.debtTypes,
    DEFAULT_SETTINGS.goalTypes,
    DEFAULT_SETTINGS.priority,
    DEFAULT_SETTINGS.investmentAssets,
    DEFAULT_SETTINGS.status,
  ];

  const maxLen = Math.max.apply(null, lists.map(arr => arr.length));
  const rows = [];

  for (let i = 0; i < maxLen; i++) {
    rows.push(lists.map(arr => arr[i] || ''));
  }

  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}

function formatSheet_(sheet, headerCount) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headerCount)
    .setFontWeight('bold')
    .setBackground('#dbeafe');

  try { sheet.autoResizeColumns(1, headerCount); } catch (e) {}
}

function getHeaderMap_(sheet) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const map = {};
  headers.forEach((header, index) => {
    const key = cleanText_(header);
    if (key) map[key] = index;
  });
  return map;
}

function getByHeader_(row, headerMap, headerName) {
  if (!headerMap || headerMap[headerName] === undefined) return '';
  return row[headerMap[headerName]];
}

function getOrCreateSheet_(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

function getRequiredSheet_(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('ไม่พบชีต: ' + sheetName);
  }
  return sheet;
}
