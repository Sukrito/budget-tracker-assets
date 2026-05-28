/*******************************************************
 * Personal AI Finance OS v12.9 Split Backend
 * File: TransactionService.gs
 * Google Apps Script shares global scope across .gs files.
 *******************************************************/

function recordTransaction(data) {
  const lock = LockService.getDocumentLock();

  try {
    lock.waitLock(10000);
    ensureWorkbook_();

    if (!data) throw new Error('ไม่พบข้อมูลที่ส่งมา');
    data = sanitizeClientPayload_(data);

    const type = cleanText_(data.type);
    const allowedTypes = ['Income', 'Expenses', 'Savings', 'Investments'];
    if (allowedTypes.indexOf(type) === -1) {
      throw new Error('ประเภทรายการไม่ถูกต้อง');
    }

    const dateObj = parseLocalDate_(data.date);
    const monthStart = getMonthStart_(dateObj);
    const category = cleanText_(data.category);
    const note = cleanText_(data.note);
    const amount = toNumber_(data.amount, 'จำนวนเงิน');
    const createdAt = new Date();

    if (!category) throw new Error('กรุณาเลือกหมวดหมู่');

    const ss = getSS_();

    if (type === 'Income') {
      const sheet = getRequiredSheet_(ss, APP_CONFIG.SHEET_INCOME);
      const source = cleanText_(data.source) || category;
      const writtenRowNumber = writeTransactionRow_(sheet, [dateObj, source, category, amount, false, note, monthStart, createdAt]);
      prependRecentIndexFromSheetRow_(type, writtenRowNumber);

    } else if (type === 'Expenses') {
      const sheet = getRequiredSheet_(ss, APP_CONFIG.SHEET_EXPENSES);
      const item = cleanText_(data.item) || note || category;
      const paymentMethod = cleanText_(data.paymentMethod) || 'Bank transfer';
      const essential = data.essential === false ? false : true;
      const writtenRowNumber = writeTransactionRow_(sheet, [dateObj, category, item, amount, paymentMethod, essential, note, monthStart, createdAt]);
      prependRecentIndexFromSheetRow_(type, writtenRowNumber);

    } else if (type === 'Savings') {
      const sheet = getRequiredSheet_(ss, APP_CONFIG.SHEET_SAVINGS);
      const action = normalizeSavingsActionStrict_(data.action);
      const goalName = cleanText_(data.goalName) || cleanText_(data.item) || 'Emergency Fund 100k';
      const knownGoals = getGoalNames_();
      if (knownGoals.length && knownGoals.indexOf(goalName) === -1) {
        throw new Error('ชื่อ Goal/Item ไม่ตรงกับ Settings: ' + goalName);
      }
      const deposit = action === 'Withdrawal' ? 0 : amount;
      const withdrawal = action === 'Withdrawal' ? amount : 0;
      const balance = getSavingsBalanceBefore_(sheet, goalName) + deposit - withdrawal;
      const writtenRowNumber = writeTransactionRow_(sheet, [dateObj, category, goalName, deposit, withdrawal, balance, note, monthStart, createdAt]);
      prependRecentIndexFromSheetRow_(type, writtenRowNumber);

    } else if (type === 'Investments') {
      const sheet = getRequiredSheet_(ss, APP_CONFIG.SHEET_INVESTMENTS);
      const action = normalizeInvestmentActionStrict_(data.action);
      const assetName = cleanText_(data.item) || category;
      const quantity = toOptionalNonNegativeNumber_(data.quantity, 'จำนวนหน่วย');
      const price = toOptionalNonNegativeNumber_(data.price, 'ราคาต่อหน่วย');
      const writtenRowNumber = writeTransactionRow_(sheet, [dateObj, category, assetName, action, amount, quantity, price, note, monthStart, createdAt]);
      prependRecentIndexFromSheetRow_(type, writtenRowNumber);
    }

    SpreadsheetApp.flush();
    invalidateFinanceCache_();

    return {
      status: 'success',
      message: 'บันทึกข้อมูลเรียบร้อยแล้ว',
      summary: getFinancialSummaryCached_(),
      recent: getRecentTransactions(10),
    };
  } catch (error) {
    return { status: 'error', message: error.message || String(error) };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function getSavingsBalanceBefore_(sheet, goalName) {
  if (!sheet || sheet.getLastRow() < 2) return 0;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, SAVINGS_HEADERS.length).getValues();
  let total = 0;

  values.forEach(row => {
    if (cleanText_(row[2]) !== goalName) return;
    total += (Number(row[3]) || 0) - (Number(row[4]) || 0);
  });

  return total;
}

function writeTransactionRow_(sheet, rowValues) {
  const targetRow = findFirstEmptyTransactionRow_(sheet);
  sheet.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
  return targetRow;
}

function findFirstEmptyTransactionRow_(sheet) {
  const startRow = 2;
  const maxRows = sheet.getMaxRows();
  const numRows = Math.max(maxRows - startRow + 1, 1);
  const dateValues = sheet.getRange(startRow, 1, numRows, 1).getValues();

  for (let i = 0; i < dateValues.length; i++) {
    const value = dateValues[i][0];
    if (value === '' || value === null) return startRow + i;
  }

  sheet.insertRowAfter(maxRows);
  return maxRows + 1;
}

function buildTransactionId_(type, rowNumber) {
  return cleanText_(type) + ':' + String(rowNumber || '').trim();
}

function parseTransactionId_(transactionId) {
  const text = cleanText_(transactionId);
  const parts = text.split(':');
  if (parts.length !== 2) throw new Error('Transaction ID ไม่ถูกต้อง');

  const type = cleanText_(parts[0]);
  const rowNumber = Number(parts[1]);
  if (!type || !isFinite(rowNumber) || rowNumber < 2) throw new Error('Transaction ID ไม่ถูกต้อง');

  return { type: type, rowNumber: rowNumber };
}

function getSheetConfigByTransactionType_(type) {
  const map = {
    Income: { sheetName: APP_CONFIG.SHEET_INCOME, headers: INCOME_HEADERS },
    Expenses: { sheetName: APP_CONFIG.SHEET_EXPENSES, headers: EXPENSE_HEADERS },
    Savings: { sheetName: APP_CONFIG.SHEET_SAVINGS, headers: SAVINGS_HEADERS },
    Investments: { sheetName: APP_CONFIG.SHEET_INVESTMENTS, headers: INVESTMENT_HEADERS }
  };
  const config = map[cleanText_(type)];
  if (!config) throw new Error('ประเภทรายการไม่ถูกต้อง');
  return config;
}

function getTransactionById(transactionId) {
  try {
    ensureWorkbook_();
    const parsed = parseTransactionId_(transactionId);
    const config = getSheetConfigByTransactionType_(parsed.type);
    const sheet = getRequiredSheet_(getSS_(), config.sheetName);
    if (parsed.rowNumber > sheet.getLastRow()) throw new Error('ไม่พบรายการนี้');

    const row = sheet.getRange(parsed.rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
    return buildTransactionPayloadFromRow_(parsed.type, parsed.rowNumber, row, getHeaderMap_(sheet));
  } catch (error) {
    return { status: 'error', message: error.message || String(error) };
  }
}

function buildTransactionPayloadFromRow_(type, rowNumber, row, headerMap) {
  let amount = Number(getByHeader_(row, headerMap, 'Amount')) || 0;
  let category = cleanText_(getByHeader_(row, headerMap, 'Category'));
  let item = cleanText_(getByHeader_(row, headerMap, 'Item'));
  let action = cleanText_(getByHeader_(row, headerMap, 'Action'));
  let note = cleanText_(getByHeader_(row, headerMap, 'Note'));

  if (type === 'Income') {
    category = category || cleanText_(getByHeader_(row, headerMap, 'Source'));
    item = cleanText_(getByHeader_(row, headerMap, 'Source'));
  } else if (type === 'Savings') {
    const deposit = Number(getByHeader_(row, headerMap, 'Deposit')) || 0;
    const withdrawal = Number(getByHeader_(row, headerMap, 'Withdrawal')) || 0;
    amount = Math.abs(deposit - withdrawal);
    action = withdrawal > 0 ? 'Withdrawal' : 'Deposit';
    category = cleanText_(getByHeader_(row, headerMap, 'Account / Bucket'));
    item = cleanText_(getByHeader_(row, headerMap, 'Goal Name'));
  } else if (type === 'Investments') {
    category = cleanText_(getByHeader_(row, headerMap, 'Asset Type'));
    item = cleanText_(getByHeader_(row, headerMap, 'Asset Name'));
  }

  return {
    status: 'success',
    id: buildTransactionId_(type, rowNumber),
    transactionId: buildTransactionId_(type, rowNumber),
    rowNumber: rowNumber,
    type: type,
    date: formatDateForClient_(getByHeader_(row, headerMap, 'Date')),
    category: category,
    item: item,
    source: cleanText_(getByHeader_(row, headerMap, 'Source')),
    action: action,
    paymentMethod: cleanText_(getByHeader_(row, headerMap, 'Payment Method')),
    essential: getByHeader_(row, headerMap, 'Essential?'),
    amount: amount,
    quantity: getByHeader_(row, headerMap, 'Quantity') || '',
    price: getByHeader_(row, headerMap, 'Price') || '',
    note: note
  };
}

function updateTransaction(transactionId, data) {
  const lock = LockService.getDocumentLock();

  try {
    lock.waitLock(10000);
    ensureWorkbook_();

    const parsed = parseTransactionId_(transactionId);
    const config = getSheetConfigByTransactionType_(parsed.type);
    const ss = getSS_();
    const sheet = getRequiredSheet_(ss, config.sheetName);
    if (parsed.rowNumber > sheet.getLastRow()) throw new Error('ไม่พบรายการนี้');

    const oldRow = sheet.getRange(parsed.rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
    const oldHeaderMap = getHeaderMap_(sheet);
    const oldCreatedAt = getByHeader_(oldRow, oldHeaderMap, 'Created At') || new Date();
    const oldSavingsGoal = cleanText_(getByHeader_(oldRow, oldHeaderMap, 'Goal Name'));

    const rowValues = buildTransactionRowValues_(parsed.type, data || {}, oldCreatedAt);
    sheet.getRange(parsed.rowNumber, 1, 1, rowValues.length).setValues([rowValues]);

    if (parsed.type === 'Savings') {
      const newGoal = cleanText_((data || {}).goalName) || cleanText_((data || {}).item) || oldSavingsGoal || 'Emergency Fund 100k';
      recalculateSavingsBalancesForGoal_(sheet, oldSavingsGoal);
      if (newGoal !== oldSavingsGoal) recalculateSavingsBalancesForGoal_(sheet, newGoal);
    }

    rebuildRecentIndex_(200);
    SpreadsheetApp.flush();
    invalidateFinanceCache_();
    return {
      status: 'success',
      message: 'แก้ไขรายการเรียบร้อยแล้ว',
      summary: getFinancialSummary(),
      recent: getRecentTransactions(10)
    };
  } catch (error) {
    return { status: 'error', message: error.message || String(error) };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function deleteTransaction(transactionId) {
  const lock = LockService.getDocumentLock();

  try {
    lock.waitLock(10000);
    ensureWorkbook_();

    const parsed = parseTransactionId_(transactionId);
    const config = getSheetConfigByTransactionType_(parsed.type);
    const ss = getSS_();
    const sheet = getRequiredSheet_(ss, config.sheetName);
    if (parsed.rowNumber > sheet.getLastRow()) throw new Error('ไม่พบรายการนี้');

    let oldSavingsGoal = '';
    if (parsed.type === 'Savings') {
      const oldRow = sheet.getRange(parsed.rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
      oldSavingsGoal = cleanText_(getByHeader_(oldRow, getHeaderMap_(sheet), 'Goal Name'));
    }

    sheet.deleteRow(parsed.rowNumber);
    if (parsed.type === 'Savings') recalculateSavingsBalancesForGoal_(sheet, oldSavingsGoal);
    rebuildRecentIndex_(200);

    SpreadsheetApp.flush();
    invalidateFinanceCache_();
    return {
      status: 'success',
      message: 'ลบรายการเรียบร้อยแล้ว',
      summary: getFinancialSummary(),
      recent: getRecentTransactions(10)
    };
  } catch (error) {
    return { status: 'error', message: error.message || String(error) };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function buildTransactionRowValues_(type, data, createdAt) {
  data = sanitizeClientPayload_(data || {});
  const dateObj = parseLocalDate_(data.date);
  const monthStart = getMonthStart_(dateObj);
  const category = cleanText_(data.category);
  const note = cleanText_(data.note);
  const amount = toNumber_(data.amount, 'จำนวนเงิน');

  if (!category) throw new Error('กรุณาเลือกหมวดหมู่');

  if (type === 'Income') {
    const source = cleanText_(data.source) || cleanText_(data.item) || category;
    return [dateObj, source, category, amount, false, note, monthStart, createdAt || new Date()];
  }

  if (type === 'Expenses') {
    const item = cleanText_(data.item) || note || category;
    const paymentMethod = cleanText_(data.paymentMethod) || 'Bank transfer';
    const essential = data.essential === false || data.essential === 'false' ? false : true;
    return [dateObj, category, item, amount, paymentMethod, essential, note, monthStart, createdAt || new Date()];
  }

  if (type === 'Savings') {
    const action = normalizeSavingsActionStrict_(data.action);
    const goalName = cleanText_(data.goalName) || cleanText_(data.item) || 'Emergency Fund 100k';
    const knownGoals = getGoalNames_();
    if (knownGoals.length && knownGoals.indexOf(goalName) === -1) {
      throw new Error('ชื่อ Goal/Item ไม่ตรงกับ Settings: ' + goalName);
    }
    const deposit = action === 'Withdrawal' ? 0 : amount;
    const withdrawal = action === 'Withdrawal' ? amount : 0;
    return [dateObj, category, goalName, deposit, withdrawal, 0, note, monthStart, createdAt || new Date()];
  }

  if (type === 'Investments') {
    const action = normalizeInvestmentActionStrict_(data.action);
    const assetName = cleanText_(data.item) || category;
    const knownAssets = getCategoriesFromSettings().investmentAssets || [];
    if (knownAssets.length && knownAssets.indexOf(assetName) === -1) {
      throw new Error('ชื่อสินทรัพย์ไม่ตรงกับ Settings: ' + assetName);
    }
    const quantity = toOptionalNonNegativeNumber_(data.quantity, 'จำนวนหน่วย');
    const price = toOptionalNonNegativeNumber_(data.price, 'ราคาต่อหน่วย');
    return [dateObj, category, assetName, action, amount, quantity, price, note, monthStart, createdAt || new Date()];
  }

  throw new Error('ประเภทรายการไม่ถูกต้อง');
}

function recalculateSavingsBalancesForGoal_(sheet, goalName) {
  if (!sheet || sheet.getLastRow() < 2 || !goalName) return;
  const headerMap = getHeaderMap_(sheet);
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  let balance = 0;

  values.forEach((row, index) => {
    const rowGoal = cleanText_(getByHeader_(row, headerMap, 'Goal Name'));
    if (rowGoal !== goalName) return;

    balance += (Number(getByHeader_(row, headerMap, 'Deposit')) || 0) - (Number(getByHeader_(row, headerMap, 'Withdrawal')) || 0);
    const balanceIndex = headerMap['Balance'];
    if (balanceIndex !== undefined) sheet.getRange(index + 2, balanceIndex + 1).setValue(balance);
  });
}

/*******************************************************
 * Phase 4.4 - Monthly Pattern Insight
 *******************************************************/

function normalizeSavingsActionStrict_(value) {
  const text = cleanText_(value).toLowerCase();
  if (text === 'deposit' || text === 'ฝาก' || text === 'ฝากเข้า' || text === '') return 'Deposit';
  if (text === 'withdrawal' || text === 'withdraw' || text === 'ถอน' || text === 'ถอนออก') return 'Withdrawal';
  throw new Error('Action ของเงินออมไม่ถูกต้อง กรุณาใช้ Deposit หรือ Withdrawal');
}

function normalizeInvestmentActionStrict_(value) {
  const text = cleanText_(value).toLowerCase();
  if (text === 'buy' || text === 'ซื้อ' || text === '') return 'Buy';
  if (text === 'dca') return 'DCA';
  if (text === 'sell' || text === 'ขาย') return 'Sell';
  if (text === 'withdraw' || text === 'withdrawal' || text === 'ถอน') return 'Withdraw';
  if (text === 'dividend' || text === 'ปันผล') return 'Dividend';
  if (text === 'fee' || text === 'ค่าธรรมเนียม') return 'Fee';
  throw new Error('Action ของการลงทุนไม่ถูกต้อง กรุณาเลือก Buy, DCA, Sell, Withdraw, Dividend หรือ Fee');
}

function normalizeSavingsAction_(value) {
  const text = cleanText_(value).toLowerCase();
  if (text === 'withdrawal' || text === 'withdraw' || text === 'ถอน' || text === 'ถอนออก') {
    return 'Withdrawal';
  }
  return 'Deposit';
}

function normalizeInvestmentAction_(value) {
  const text = cleanText_(value).toLowerCase();
  if (text === 'withdraw' || text === 'withdrawal' || text === 'ถอน') return 'Withdraw';
  if (text === 'sell' || text === 'ขาย') return 'Sell';
  if (text === 'dca') return 'DCA';
  if (text === 'opening balance' || text === 'opening') return 'Opening Balance';
  if (text === 'dividend' || text === 'ปันผล') return 'Dividend';
  if (text === 'fee' || text === 'ค่าธรรมเนียม') return 'Fee';
  return 'Buy';
}
