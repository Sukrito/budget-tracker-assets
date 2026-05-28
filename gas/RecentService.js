/*******************************************************
 * Personal AI Finance OS v12.9 Split Backend
 * File: RecentService.gs
 * Google Apps Script shares global scope across .gs files.
 *******************************************************/

function getRecentTransactions(limit) {
  try {
    const maxRows = Number(limit) > 0 ? Number(limit) : 10;
    const rows = getRecentTransactionsFromIndex_(maxRows);
    if (rows.length) return rows;

    // First run after upgrade or after blank index: build the index once, then read from it.
    rebuildRecentIndex_(200);
    return getRecentTransactionsFromIndex_(maxRows);
  } catch (e) {
    return [];
  }
}

function getRecentTransactionsFromIndex_(limit) {
  const ss = getSS_();
  const sheet = ss.getSheetByName(APP_CONFIG.SHEET_RECENT_INDEX);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const rowCount = Math.min(Number(limit) || 10, sheet.getLastRow() - 1);
  if (rowCount <= 0) return [];

  const values = sheet.getRange(2, 1, rowCount, RECENT_INDEX_HEADERS.length).getValues();
  return values.map(row => ({
    id: cleanText_(row[3]),
    transactionId: cleanText_(row[3]),
    rowNumber: Number(row[5]) || '',
    type: cleanText_(row[4]),
    date: formatDateForClient_(row[6]),
    category: cleanText_(row[7]),
    item: cleanText_(row[8]),
    source: cleanText_(row[9]),
    action: cleanText_(row[10]),
    paymentMethod: cleanText_(row[11]),
    essential: row[12],
    amount: Number(row[13]) || 0,
    quantity: row[14] || '',
    price: row[15] || '',
    note: cleanText_(row[16]),
  })).filter(row => row.transactionId && row.type && row.amount);
}

function rebuildRecentIndex_(limit) {
  const maxRows = Math.max(20, Number(limit) || 200);
  const ss = getSS_();
  const rows = [];

  collectRecentFromSheet_(ss.getSheetByName(APP_CONFIG.SHEET_INCOME), 'Income', rows);
  collectRecentFromSheet_(ss.getSheetByName(APP_CONFIG.SHEET_EXPENSES), 'Expenses', rows);
  collectRecentFromSheet_(ss.getSheetByName(APP_CONFIG.SHEET_SAVINGS), 'Savings', rows);
  collectRecentFromSheet_(ss.getSheetByName(APP_CONFIG.SHEET_INVESTMENTS), 'Investments', rows);

  rows.sort((a, b) => {
    if (b.createdTime !== a.createdTime) return b.createdTime - a.createdTime;
    if (b.txTime !== a.txTime) return b.txTime - a.txTime;
    return b.globalOrder - a.globalOrder;
  });

  const indexRows = rows.slice(0, maxRows).map((item, idx) => buildRecentIndexRow_(item, idx + 1));
  writeRecentIndexRows_(indexRows);

  return {
    status: 'success',
    message: 'สร้าง Recent_Index ใหม่เรียบร้อยแล้ว',
    count: indexRows.length,
  };
}

function writeRecentIndexRows_(rows) {
  const ss = getSS_();
  let sheet = ss.getSheetByName(APP_CONFIG.SHEET_RECENT_INDEX);
  if (!sheet) {
    sheet = ss.insertSheet(APP_CONFIG.SHEET_RECENT_INDEX);
  }

  sheet.clearContents();
  sheet.getRange(1, 1, 1, RECENT_INDEX_HEADERS.length).setValues([RECENT_INDEX_HEADERS]);
  sheet.setFrozenRows(1);

  if (rows && rows.length) {
    sheet.getRange(2, 1, rows.length, RECENT_INDEX_HEADERS.length).setValues(rows);
  }
}

function prependRecentIndexFromSheetRow_(type, rowNumber) {
  try {
    const ss = getSS_();
    const config = getSheetConfigByTransactionType_(type);
    const sheet = ss.getSheetByName(config.sheetName);
    if (!sheet || rowNumber < 2 || rowNumber > sheet.getLastRow()) return;

    const rows = [];
    const row = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
    const headerMap = getHeaderMap_(sheet);
    collectRecentRowFromValues_(row, rowNumber, type, headerMap, rows);
    if (!rows.length) return;

    const newIndexRow = buildRecentIndexRow_(rows[0], 1);
    const indexRows = getRecentIndexRawRows_(199).filter(r => cleanText_(r[3]) !== cleanText_(newIndexRow[3]));
    writeRecentIndexRows_([newIndexRow].concat(indexRows));
  } catch (err) {
    // Recent index is a speed helper only. Never block transaction writes.
  }
}

function getRecentIndexRawRows_(limit) {
  const ss = getSS_();
  const sheet = ss.getSheetByName(APP_CONFIG.SHEET_RECENT_INDEX);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const count = Math.min(Number(limit) || 200, sheet.getLastRow() - 1);
  if (count <= 0) return [];
  return sheet.getRange(2, 1, count, RECENT_INDEX_HEADERS.length).getValues();
}

function buildRecentIndexRow_(item, order) {
  return [
    new Date(Number(item.createdTime) || Date.now()),
    new Date(Number(item.txTime) || Number(item.createdTime) || Date.now()),
    Number(order) || Number(item.globalOrder) || 0,
    buildTransactionId_(item.type, item.rowNumber),
    item.type,
    item.rowNumber,
    item.date,
    item.category,
    item.item || '',
    item.source || '',
    item.action || '',
    item.paymentMethod || '',
    item.essential,
    Number(item.amount) || 0,
    item.quantity || '',
    item.price || '',
    item.note || '',
  ];
}

function collectRecentFromSheet_(sheet, type, out) {
  if (!sheet || sheet.getLastRow() < 2) return;

  const headerMap = getHeaderMap_(sheet);
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  // Performance v12.4:
  // Default to scanning all used rows to avoid missing records when sheets contain gaps.
  // If the workbook grows large later, set API_SECURITY.RECENT_SCAN_LIMIT to 500/1000.
  const scanLimit = Number(API_SECURITY.RECENT_SCAN_LIMIT) || 0;
  const startRow = scanLimit > 0 ? Math.max(2, lastRow - scanLimit + 1) : 2;
  const rowCount = Math.max(lastRow - startRow + 1, 0);
  if (rowCount <= 0) return;

  const values = sheet.getRange(startRow, 1, rowCount, lastCol).getValues();
  const today = getTodayLocal_();

  values.forEach((row, index) => {
    const rowNumber = startRow + index;
    const dateValue = getByHeader_(row, headerMap, 'Date');
    const txDate = normalizeDateValue_(dateValue);

    if (!txDate || txDate.getTime() > today.getTime()) return;

    let amount = 0;
    let category = '';
    let note = '';

    if (type === 'Income') {
      amount = Number(getByHeader_(row, headerMap, 'Amount')) || 0;
      category = cleanText_(getByHeader_(row, headerMap, 'Category')) || cleanText_(getByHeader_(row, headerMap, 'Source'));
      note = cleanText_(getByHeader_(row, headerMap, 'Note'));

    } else if (type === 'Expenses') {
      amount = Number(getByHeader_(row, headerMap, 'Amount')) || 0;
      category = cleanText_(getByHeader_(row, headerMap, 'Category'));
      note = cleanText_(getByHeader_(row, headerMap, 'Note')) || cleanText_(getByHeader_(row, headerMap, 'Item'));

    } else if (type === 'Savings') {
      const deposit = Number(getByHeader_(row, headerMap, 'Deposit')) || 0;
      const withdrawal = Number(getByHeader_(row, headerMap, 'Withdrawal')) || 0;
      amount = deposit - withdrawal;
      category = cleanText_(getByHeader_(row, headerMap, 'Goal Name')) || cleanText_(getByHeader_(row, headerMap, 'Account / Bucket')) || cleanText_(getByHeader_(row, headerMap, 'Account'));
      note = cleanText_(getByHeader_(row, headerMap, 'Note'));

    } else if (type === 'Investments') {
      const action = cleanText_(getByHeader_(row, headerMap, 'Action'));
      if (action === 'Opening Balance' || action === 'Opening') return;

      amount = Number(getByHeader_(row, headerMap, 'Amount')) || Number(getByHeader_(row, headerMap, 'Deposit')) || 0;
      const assetType = cleanText_(getByHeader_(row, headerMap, 'Asset Type')) || cleanText_(getByHeader_(row, headerMap, 'Type'));
      const assetName = cleanText_(getByHeader_(row, headerMap, 'Asset Name')) || cleanText_(getByHeader_(row, headerMap, 'Asset'));
      category = assetType + (assetName ? ' / ' + assetName : '');
      note = cleanText_(getByHeader_(row, headerMap, 'Note')) || action;
    }

    if (!category || !isFinite(Number(amount)) || Number(amount) === 0) return;

    const createdAt = getByHeader_(row, headerMap, 'Created At');
    const createdDate = normalizeCreatedAt_(createdAt, txDate);
    const txTime = txDate ? txDate.getTime() : 0;
    const createdTime = createdDate ? createdDate.getTime() : txTime;

    out.push({
      type: type,
      date: formatDateForClient_(dateValue),
      category: category,
      item: cleanText_(getByHeader_(row, headerMap, 'Item')) || cleanText_(getByHeader_(row, headerMap, 'Asset Name')) || cleanText_(getByHeader_(row, headerMap, 'Goal Name')) || '',
      source: cleanText_(getByHeader_(row, headerMap, 'Source')) || '',
      action: cleanText_(getByHeader_(row, headerMap, 'Action')) || (Number(getByHeader_(row, headerMap, 'Withdrawal')) > 0 ? 'Withdrawal' : Number(getByHeader_(row, headerMap, 'Deposit')) > 0 ? 'Deposit' : ''),
      paymentMethod: cleanText_(getByHeader_(row, headerMap, 'Payment Method')) || '',
      essential: getByHeader_(row, headerMap, 'Essential?'),
      amount: Math.abs(amount),
      quantity: getByHeader_(row, headerMap, 'Quantity') || '',
      price: getByHeader_(row, headerMap, 'Price') || '',
      note: note,
      createdTime: createdTime,
      txTime: txTime,
      globalOrder: out.length + 1,
      rowNumber: rowNumber,
    });
  });
}

function collectRecentRowFromValues_(row, rowNumber, type, headerMap, out) {
  const dateValue = getByHeader_(row, headerMap, 'Date');
  const txDate = normalizeDateValue_(dateValue);
  const today = getTodayLocal_();

  if (!txDate || txDate.getTime() > today.getTime()) return;

  let amount = 0;
  let category = '';
  let note = '';

  if (type === 'Income') {
    amount = Number(getByHeader_(row, headerMap, 'Amount')) || 0;
    category = cleanText_(getByHeader_(row, headerMap, 'Category')) || cleanText_(getByHeader_(row, headerMap, 'Source'));
    note = cleanText_(getByHeader_(row, headerMap, 'Note'));

  } else if (type === 'Expenses') {
    amount = Number(getByHeader_(row, headerMap, 'Amount')) || 0;
    category = cleanText_(getByHeader_(row, headerMap, 'Category'));
    note = cleanText_(getByHeader_(row, headerMap, 'Note')) || cleanText_(getByHeader_(row, headerMap, 'Item'));

  } else if (type === 'Savings') {
    const deposit = Number(getByHeader_(row, headerMap, 'Deposit')) || 0;
    const withdrawal = Number(getByHeader_(row, headerMap, 'Withdrawal')) || 0;
    amount = deposit - withdrawal;
    category = cleanText_(getByHeader_(row, headerMap, 'Goal Name')) || cleanText_(getByHeader_(row, headerMap, 'Account / Bucket')) || cleanText_(getByHeader_(row, headerMap, 'Account'));
    note = cleanText_(getByHeader_(row, headerMap, 'Note'));

  } else if (type === 'Investments') {
    const action = cleanText_(getByHeader_(row, headerMap, 'Action'));
    if (action === 'Opening Balance' || action === 'Opening') return;

    amount = Number(getByHeader_(row, headerMap, 'Amount')) || Number(getByHeader_(row, headerMap, 'Deposit')) || 0;
    const assetType = cleanText_(getByHeader_(row, headerMap, 'Asset Type')) || cleanText_(getByHeader_(row, headerMap, 'Type'));
    const assetName = cleanText_(getByHeader_(row, headerMap, 'Asset Name')) || cleanText_(getByHeader_(row, headerMap, 'Asset'));
    category = assetType + (assetName ? ' / ' + assetName : '');
    note = cleanText_(getByHeader_(row, headerMap, 'Note')) || action;
  }

  if (!category || !isFinite(Number(amount)) || Number(amount) === 0) return;

  const createdAt = getByHeader_(row, headerMap, 'Created At');
  const createdDate = normalizeCreatedAt_(createdAt, txDate);
  const txTime = txDate ? txDate.getTime() : 0;
  const createdTime = createdDate ? createdDate.getTime() : txTime;

  out.push({
    type: type,
    date: formatDateForClient_(dateValue),
    category: category,
    item: cleanText_(getByHeader_(row, headerMap, 'Item')) || cleanText_(getByHeader_(row, headerMap, 'Asset Name')) || cleanText_(getByHeader_(row, headerMap, 'Goal Name')) || '',
    source: cleanText_(getByHeader_(row, headerMap, 'Source')) || '',
    action: cleanText_(getByHeader_(row, headerMap, 'Action')) || (Number(getByHeader_(row, headerMap, 'Withdrawal')) > 0 ? 'Withdrawal' : Number(getByHeader_(row, headerMap, 'Deposit')) > 0 ? 'Deposit' : ''),
    paymentMethod: cleanText_(getByHeader_(row, headerMap, 'Payment Method')) || '',
    essential: getByHeader_(row, headerMap, 'Essential?'),
    amount: Math.abs(amount),
    quantity: getByHeader_(row, headerMap, 'Quantity') || '',
    price: getByHeader_(row, headerMap, 'Price') || '',
    note: note,
    createdTime: createdTime,
    txTime: txTime,
    globalOrder: out.length + 1,
    rowNumber: rowNumber,
  });
}

function normalizeCreatedAt_(value, fallbackDate) {
  if (Object.prototype.toString.call(value) === '[object Date]') return value;
  const parsed = normalizeDateValue_(value);
  return parsed || fallbackDate || null;
}
