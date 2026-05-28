/*******************************************************
 * Personal AI Finance OS v12.9 Split Backend
 * File: Code.gs
 * Google Apps Script shares global scope across .gs files.
 *******************************************************/

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = cleanText_(params.action || 'health');
  try {
    // Security first: validate the secret before touching Spreadsheet data.
    // The public health check is exempted by requireApiSecret_().
    requireApiSecret_(params.key || params.token || params.apiKey, action);

    if (action === 'health') {
      return apiJsonOutput_({
        status: 'success',
        app: APP_META.NAME + ' API',
        version: getVersionInfo_(),
        message: 'API is ready. Use GitHub Pages as frontend.',
        security: API_SECURITY.ENABLED ? 'enabled' : 'disabled',
        timestamp: Utilities.formatDate(new Date(), APP_CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss')
      });
    }

    if (action === 'systemCheck') {
      return apiJsonOutput_(getSystemCheck_());
    }

    if (action === 'version') {
      return apiJsonOutput_({ status: 'success', version: getVersionInfo_() });
    }

    if (action === 'getFinancialSummary') {
      return apiJsonOutput_(getFinancialSummaryCached_());
    }

    if (action === 'getCategoriesFromSettings') {
      return apiJsonOutput_(getCategoriesFromSettings());
    }

    if (action === 'getAddTransactionQuickData') {
      return apiJsonOutput_(getAddTransactionQuickData());
    }

    if (action === 'getRecentTransactions') {
      return apiJsonOutput_(getRecentTransactions(Number(params.limit) || 10));
    }

    if (action === 'getTransactionById') {
      return apiJsonOutput_(getTransactionById(params.transactionId));
    }

    if (action === 'getCycleHistory') {
      return apiJsonOutput_(getCycleHistory(Number(params.limit) || 6));
    }

    logApiAccess_(action, 'GET', 'blocked', 'Unknown GET action', e);
    return apiJsonOutput_({ status: 'error', message: 'Unknown GET action: ' + action });
  } catch (error) {
    logApiAccess_(action, 'GET', 'error', error.message || String(error), e);
    return apiJsonOutput_({ status: 'error', message: error.message || String(error) });
  }
}

function doPost(e) {
  let action = '';
  try {
    const body = parseApiPostBody_(e);
    action = cleanText_(body.action);

    // Security first: validate the secret before touching Spreadsheet data.
    requireApiSecret_(body.key || body.token || body.apiKey, action);

    const data = body.data;

    if (action === 'resetFinanceCache') {
      invalidateFinanceCache_();
      logApiAccess_(action, 'POST', 'success', 'resetFinanceCache', e);
      return apiJsonOutput_({ status: 'success', message: 'ล้าง cache เรียบร้อยแล้ว' });
    }

    if (action === 'rebuildRecentIndex') {
      const result = rebuildRecentIndex_(Number(data && data.limit) || 200);
      logApiAccess_(action, 'POST', 'success', 'rebuildRecentIndex', e);
      return apiJsonOutput_(result);
    }

    if (action === 'recordTransaction') {
      const result = recordTransaction(data);
      logApiAccess_(action, 'POST', 'success', 'recordTransaction', e);
      return apiJsonOutput_(result);
    }

    if (action === 'updateCurrentPlan') {
      const result = updateCurrentPlan(data);
      logApiAccess_(action, 'POST', 'success', 'updateCurrentPlan', e);
      return apiJsonOutput_(result);
    }

    if (action === 'archiveCurrentCycle') {
      const result = archiveCurrentCycle(typeof data === 'string' ? data : 'Archived from GitHub Pages');
      logApiAccess_(action, 'POST', 'success', 'archiveCurrentCycle', e);
      return apiJsonOutput_(result);
    }

    if (action === 'updateTransaction') {
      const result = updateTransaction(data && data.transactionId, data && data.data);
      logApiAccess_(action, 'POST', 'success', 'updateTransaction', e);
      return apiJsonOutput_(result);
    }

    if (action === 'deleteTransaction') {
      const result = deleteTransaction(data && data.transactionId);
      logApiAccess_(action, 'POST', 'success', 'deleteTransaction', e);
      return apiJsonOutput_(result);
    }

    logApiAccess_(action, 'POST', 'blocked', 'Unknown POST action', e);
    return apiJsonOutput_({ status: 'error', message: 'Unknown POST action: ' + action });
  } catch (error) {
    logApiAccess_(action, 'POST', 'error', error.message || String(error), e);
    return apiJsonOutput_({ status: 'error', message: error.message || String(error) });
  }
}

function parseApiPostBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  try {
    return JSON.parse(e.postData.contents);
  } catch (error) {
    return {};
  }
}

function apiJsonOutput_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data || {}))
    .setMimeType(ContentService.MimeType.JSON);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function setupFinanceOS() {
  ensureWorkbook_();
  return {
    status: 'success',
    message: 'สร้าง/ตรวจสอบชีตหลักและ Phase 4 App Upgrade เรียบร้อยแล้ว',
    categories: getCategoriesFromSettings(),
    summary: getFinancialSummary(),
  };
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Finance OS')
    .addItem('Update Thailand Holidays', 'updateThailandHolidays')
    .addItem('Update Pay Cycles', 'updatePayCycles')
    .addItem('Update Holidays + Pay Cycles', 'updateHolidaysAndPayCycles')
    .addSeparator()
    .addItem('Create Auto Update Trigger', 'createFinanceOSTriggers')
    .addItem('Delete Auto Update Trigger', 'deleteFinanceOSTriggers')
    .addToUi();
}
