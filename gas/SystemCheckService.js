/*******************************************************
 * Personal AI Finance OS v12.9 Split Backend
 * File: SystemCheckService.gs
 * Google Apps Script shares global scope across .gs files.
 *******************************************************/

function getSystemCheck_() {
  const startedAt = Date.now();
  const legacyConfigured = !!getScriptSecret_(API_SECURITY.SECRET_PROPERTY);
  const readConfigured = !!getScriptSecret_(API_SECURITY.READ_SECRET_PROPERTY);
  const writeConfigured = !!getScriptSecret_(API_SECURITY.WRITE_SECRET_PROPERTY);
  const adminConfigured = !!getScriptSecret_(API_SECURITY.ADMIN_SECRET_PROPERTY);

  const report = {
    status: 'success',
    version: getVersionInfo_(),
    checkedAt: Utilities.formatDate(new Date(), APP_CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss'),
    elapsedMs: 0,
    api: {
      security: API_SECURITY.ENABLED ? 'enabled' : 'disabled',
      legacyKeyConfigured: legacyConfigured,
      readKeyConfigured: readConfigured,
      writeKeyConfigured: writeConfigured,
      adminKeyConfigured: adminConfigured,
      readKeyEffective: readConfigured || legacyConfigured,
      writeKeyEffective: writeConfigured || legacyConfigured,
      adminKeyEffective: adminConfigured || legacyConfigured,
      splitMode: readConfigured && writeConfigured && adminConfigured,
      fallbackMode: legacyConfigured && (!readConfigured || !writeConfigured || !adminConfigured),
      cacheSeconds: API_SECURITY.SUMMARY_CACHE_SECONDS
    },
    cache: {
      scriptCache: 'unknown',
      dashboardCacheSheet: 'unknown',
      dashboardCacheRows: 0,
      dashboardCachedAt: '',
      dashboardExpiresAt: ''
    },
    recent: {
      sheet: APP_CONFIG.SHEET_RECENT_INDEX,
      count: 0,
      status: 'unknown',
      lastTxDate: '',
      lastCreatedTime: ''
    },
    sheets: [],
    warnings: [],
    errors: []
  };

  try {
    const ss = getSS_();

    const requiredSheets = [
      { name: APP_CONFIG.SHEET_INCOME, headers: INCOME_HEADERS },
      { name: APP_CONFIG.SHEET_EXPENSES, headers: EXPENSE_HEADERS },
      { name: APP_CONFIG.SHEET_SAVINGS, headers: SAVINGS_HEADERS },
      { name: APP_CONFIG.SHEET_INVESTMENTS, headers: INVESTMENT_HEADERS },
      { name: APP_CONFIG.SHEET_ACCOUNTS, headers: ACCOUNT_HEADERS },
      { name: APP_CONFIG.SHEET_PLANS, headers: PLAN_HEADERS },
      { name: APP_CONFIG.SHEET_SETTINGS, headers: SETTINGS_HEADERS },
      { name: APP_CONFIG.SHEET_PAY_CYCLES, headers: null },
      { name: APP_CONFIG.SHEET_CYCLE_HISTORY, headers: CYCLE_HISTORY_HEADERS },
      { name: APP_CONFIG.SHEET_PLAN_CHANGE_LOG, headers: PLAN_CHANGE_LOG_HEADERS },
      { name: APP_CONFIG.SHEET_RECENT_INDEX, headers: RECENT_INDEX_HEADERS },
      { name: APP_CONFIG.SHEET_DASHBOARD_CACHE, headers: DASHBOARD_CACHE_HEADERS }
    ];

    requiredSheets.forEach(item => {
      const sh = ss.getSheetByName(item.name);
      const info = {
        name: item.name,
        exists: !!sh,
        rows: sh ? sh.getLastRow() : 0,
        headerOk: true,
        headersOk: true,
        checkedHeaders: !!(item.headers && item.headers.length),
        missingHeaders: [],
        message: 'OK'
      };

      if (!sh) {
        info.headerOk = false;
        info.headersOk = false;
        info.message = 'missing sheet';
        report.errors.push('Missing sheet: ' + item.name);
      } else if (item.headers && item.headers.length) {
        const current = sh.getRange(1, 1, 1, item.headers.length).getValues()[0].map(v => String(v || '').trim());
        const mismatch = item.headers.filter((h, i) => current[i] !== h);
        if (mismatch.length) {
          info.headerOk = false;
          info.headersOk = false;
          info.missingHeaders = mismatch.slice(0, 10);
          info.message = 'header mismatch';
          report.errors.push(item.name + ' header mismatch');
        }
      } else {
        info.message = 'exists; header not checked';
      }

      report.sheets.push(info);
    });

    const recentSheet = ss.getSheetByName(APP_CONFIG.SHEET_RECENT_INDEX);
    if (recentSheet && recentSheet.getLastRow() >= 2) {
      report.recent.count = recentSheet.getLastRow() - 1;
      report.recent.status = 'OK';
      try {
        const last = recentSheet.getRange(2, 1, 1, Math.min(recentSheet.getLastColumn(), RECENT_INDEX_HEADERS.length)).getValues()[0];
        report.recent.lastCreatedTime = formatDateTimeForSystemCheck_(last[0]);
        report.recent.lastTxDate = formatDateForClient_(last[6]);
      } catch (err) {}
    } else {
      report.recent.count = 0;
      report.recent.status = 'empty';
      report.warnings.push('Recent_Index ยังว่าง ให้กด Rebuild Recent หนึ่งครั้ง');
    }

    try {
      const cached = CacheService.getScriptCache().get(API_SECURITY.SUMMARY_CACHE_KEY);
      report.cache.scriptCache = cached ? 'HIT' : 'MISS';
    } catch (err) {
      report.cache.scriptCache = 'error: ' + (err.message || String(err));
      report.warnings.push('Script cache check failed');
    }

    const cacheSheet = ss.getSheetByName(APP_CONFIG.SHEET_DASHBOARD_CACHE);
    if (cacheSheet) {
      report.cache.dashboardCacheRows = Math.max(0, cacheSheet.getLastRow() - 1);
      if (cacheSheet.getLastRow() >= 2) {
        const row = cacheSheet.getRange(2, 1, 1, DASHBOARD_CACHE_HEADERS.length).getValues()[0];
        const cachedAt = row[1];
        const expiresAt = row[2];
        report.cache.dashboardCachedAt = formatDateTimeForSystemCheck_(cachedAt);
        report.cache.dashboardExpiresAt = formatDateTimeForSystemCheck_(expiresAt);
        report.cache.dashboardCacheSheet = (expiresAt instanceof Date && expiresAt.getTime() >= Date.now()) ? 'VALID' : 'EXPIRED';
      } else {
        report.cache.dashboardCacheSheet = 'EMPTY';
      }
    } else {
      report.cache.dashboardCacheSheet = 'MISSING';
      report.warnings.push('Dashboard_Cache sheet missing');
    }

    if (!report.api.readKeyEffective) report.errors.push('Read key is not configured');
    if (!report.api.writeKeyEffective) report.errors.push('Write key is not configured');
    if (!report.api.adminKeyEffective) report.errors.push('Admin key is not configured');

    if (report.errors.length) report.status = 'error';
    else if (report.warnings.length) report.status = 'warning';
    else report.status = 'success';

  } catch (err) {
    report.status = 'error';
    report.errors.push(err.message || String(err));
  }

  report.elapsedMs = Date.now() - startedAt;
  return report;
}

function formatDateTimeForSystemCheck_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, APP_CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
  }
  return cleanText_(value);
}
