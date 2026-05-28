/*******************************************************
 * Personal AI Finance OS v12.9 Split Backend
 * File: Utils.gs
 * Google Apps Script shares global scope across .gs files.
 *******************************************************/

function parseLocalDate_(dateText) {
  if (!dateText) throw new Error('กรุณาระบุวันที่');

  if (Object.prototype.toString.call(dateText) === '[object Date]') {
    return new Date(dateText.getFullYear(), dateText.getMonth(), dateText.getDate());
  }

  const text = String(dateText).trim();
  const parts = text.split('-');
  if (parts.length !== 3) throw new Error('รูปแบบวันที่ไม่ถูกต้อง ต้องเป็น yyyy-mm-dd');

  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!year || !month || !day) throw new Error('วันที่ไม่ถูกต้อง');

  return new Date(year, month - 1, day);
}

function getMonthStart_(dateObj) {
  return new Date(dateObj.getFullYear(), dateObj.getMonth(), 1);
}

function normalizeNumberInput_(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return value;

  let text = String(value).trim();

  // Accept mobile/browser formatted numbers such as "10,283.50", "10,283.50 ฿", or "10,283.50 บาท".
  text = text
    .replace(/บาท/g, '')
    .replace(/฿/g, '')
    .replace(/,/g, '')
    .replace(/\s+/g, '');

  if (!text) return 0;
  return Number(text);
}

function toNumber_(value, fieldName) {
  const n = normalizeNumberInput_(value);
  if (!isFinite(n) || n <= 0) {
    throw new Error('กรุณาระบุ ' + fieldName + ' เป็นตัวเลขมากกว่า 0');
  }
  return n;
}

function toNonNegativeNumber_(value, fieldName) {
  const n = normalizeNumberInput_(value);
  if (!isFinite(n) || n < 0) {
    throw new Error('กรุณาระบุ ' + fieldName + ' เป็นตัวเลขตั้งแต่ 0 ขึ้นไป');
  }
  return n;
}

function toOptionalNonNegativeNumber_(value, fieldName) {
  if (value === null || value === undefined || String(value).trim() === '') return '';
  return toNonNegativeNumber_(value, fieldName);
}

function cleanText_(value, maxLength) {
  // Be careful: cleanText_ is sometimes passed directly to Array.map,
  // where the second argument is the array index. Only honor explicit large limits.
  const limit = (typeof maxLength === 'number' && maxLength >= 20) ? maxLength : 500;
  return String(value === null || value === undefined ? '' : value)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

function toBooleanSafe_(value, defaultValue) {
  if (value === true || value === false) return value;
  if (value === null || value === undefined || value === '') return !!defaultValue;
  const text = String(value).trim().toLowerCase();
  if (['true', 'yes', 'y', '1', 'checked'].indexOf(text) !== -1) return true;
  if (['false', 'no', 'n', '0', 'unchecked'].indexOf(text) !== -1) return false;
  return !!defaultValue;
}

function sanitizeClientPayload_(payload) {
  const source = payload || {};
  const result = {};
  Object.keys(source).forEach(key => {
    const value = source[key];
    if (value === null || value === undefined) {
      result[key] = '';
      return;
    }

    if (['amount', 'quantity', 'price', 'expectedIncome', 'payMother', 'debtBills', 'savingsPlan', 'livingBudget'].indexOf(key) !== -1) {
      result[key] = normalizeNumberInput_(value);
    } else if (key === 'essential' || key === 'isEssential') {
      result[key] = toBooleanSafe_(value, true);
    } else {
      result[key] = cleanText_(value, key === 'note' ? 1000 : 300);
    }
  });
  return result;
}

function getSettingsColumn_(sheet, colIndex) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet
    .getRange(2, colIndex, sheet.getLastRow() - 1, 1)
    .getValues()
    .flat()
    .map(cleanText_)
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i);
}

function getGoalNames_() {
  const ss = getSS_();
  const sheet = ss.getSheetByName(APP_CONFIG.SHEET_GOALS);
  if (!sheet || sheet.getLastRow() < 2) return ['Emergency Fund 100k'];

  const names = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1)
    .getValues()
    .flat()
    .map(cleanText_)
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i);

  return names.length ? names : ['Emergency Fund 100k'];
}

function getCategoriesFromSettings() {
  try {
    ensureWorkbook_();
    const ss = getSS_();
    const sheet = ss.getSheetByName(APP_CONFIG.SHEET_SETTINGS);

    const income = getSettingsColumn_(sheet, 1);
    const expense = getSettingsColumn_(sheet, 2).filter(v => v !== 'Savings' && v !== 'Investment');
    const paymentMethods = getSettingsColumn_(sheet, 3);
    const savingsBuckets = getSettingsColumn_(sheet, 5);
    const investmentAssets = getSettingsColumn_(sheet, 7);

    return {
      income: income.length ? income : DEFAULT_SETTINGS.income,
      expense: expense.length ? expense : DEFAULT_SETTINGS.expense,
      paymentMethods: paymentMethods.length ? paymentMethods : DEFAULT_SETTINGS.paymentMethods,
      savingsBuckets: savingsBuckets.length ? savingsBuckets : DEFAULT_SETTINGS.goalTypes,
      savingsGoals: getGoalNames_(),
      investmentAssets: investmentAssets.length ? investmentAssets : DEFAULT_SETTINGS.investmentAssets,
      investmentActions: ['Buy', 'DCA', 'Sell', 'Withdraw', 'Dividend', 'Fee'],
      savingsActions: ['Deposit', 'Withdrawal'],
    };
  } catch (e) {
    return {
      income: DEFAULT_SETTINGS.income,
      expense: DEFAULT_SETTINGS.expense,
      paymentMethods: DEFAULT_SETTINGS.paymentMethods,
      savingsBuckets: DEFAULT_SETTINGS.goalTypes,
      savingsGoals: ['Emergency Fund 100k'],
      investmentAssets: DEFAULT_SETTINGS.investmentAssets,
      investmentActions: ['Buy', 'DCA', 'Sell', 'Withdraw', 'Dividend', 'Fee'],
      savingsActions: ['Deposit', 'Withdrawal'],
    };
  }
}

function getAddTransactionQuickData() {
  try {
    ensureWorkbook_();
    return {
      status: 'success',
      categories: getCategoriesFromSettings(),
      recent: getRecentTransactions(3),
      today: formatDateForClient_(new Date())
    };
  } catch (error) {
    return { status: 'error', message: error.message || String(error), recent: [] };
  }
}



// Backward-compatible alias in case an older frontend deployed with this misspelled name.

function getAddTransationQuickData() {
  return getAddTransactionQuickData();
}

function dateDiffDays_(startDate, endDate) {
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()).getTime();
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()).getTime();
  return Math.round((end - start) / (24 * 60 * 60 * 1000));
}

function getTodayLocal_() {
  const text = Utilities.formatDate(new Date(), APP_CONFIG.TIMEZONE, 'yyyy-MM-dd');
  return parseLocalDate_(text);
}

function lastTuesdayOfMonth_(dateObj) {
  const year = dateObj.getFullYear();
  const month = dateObj.getMonth();
  const lastDay = new Date(year, month + 1, 0);
  const diff = (lastDay.getDay() - 2 + 7) % 7;
  return new Date(year, month, lastDay.getDate() - diff);
}

function minDate_(a, b) {
  return a.getTime() <= b.getTime() ? a : b;
}

function safeRatio_(actual, planned) {
  actual = Number(actual) || 0;
  planned = Number(planned) || 0;
  if (planned <= 0) return 0;
  return actual / planned;
}

function normalizeDateValue_(value) {
  if (!value) return null;

  if (Object.prototype.toString.call(value) === '[object Date]') {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const text = cleanText_(value);
  if (!text) return null;

  try { return parseLocalDate_(text); } catch (e) { return null; }
}

function formatDateForClient_(dateValue) {
  if (Object.prototype.toString.call(dateValue) === '[object Date]') {
    return Utilities.formatDate(dateValue, APP_CONFIG.TIMEZONE, 'yyyy-MM-dd');
  }
  return cleanText_(dateValue);
}

function formatMoneyForText_(value) {
  return (Number(value) || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 }) + ' ฿';
}

function addDays_(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDateKey_(date) {
  return Utilities.formatDate(date, APP_CONFIG.TIMEZONE, 'yyyy-MM-dd');
}

function formatMonthKey_(date) {
  return Utilities.formatDate(date, APP_CONFIG.TIMEZONE, 'yyyy-MM');
}
