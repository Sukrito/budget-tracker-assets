/*******************************************************
 * Personal AI Finance OS v12.9 Split Backend
 * File: CycleService.gs
 * Google Apps Script shares global scope across .gs files.
 *******************************************************/

function getCurrentPayCycle_() {
  const ss = getSS_();
  const sheet = ss.getSheetByName(APP_CONFIG.SHEET_PAY_CYCLES);

  if (!sheet || sheet.getLastRow() < 2) return getCurrentPayCycleFallback_();

  const today = getTodayLocal_();
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
  let selected = null;

  values.forEach(row => {
    const payDate = normalizeDateValue_(row[1]);
    const cycleEnd = normalizeDateValue_(row[2]);
    if (!payDate || !cycleEnd) return;

    if (payDate.getTime() <= today.getTime()) {
      if (!selected || payDate.getTime() > selected.start.getTime()) {
        selected = { start: payDate, end: cycleEnd, today };
      }
    }
  });

  return selected || getCurrentPayCycleFallback_();
}

function getCurrentPayCycleFallback_() {
  const today = getTodayLocal_();
  const thisPay = lastTuesdayOfMonth_(today);

  let start = today.getTime() >= thisPay.getTime()
    ? thisPay
    : lastTuesdayOfMonth_(new Date(today.getFullYear(), today.getMonth() - 1, 1));

  const nextPay = lastTuesdayOfMonth_(new Date(start.getFullYear(), start.getMonth() + 1, 1));
  const end = addDays_(nextPay, -1);
  return { start, end, today };
}

function isCycleArchived_(payCycleStart) {
  const ss = getSS_();
  const sheet = ss.getSheetByName(APP_CONFIG.SHEET_CYCLE_HISTORY);
  if (!sheet || sheet.getLastRow() < 2) return false;

  const targetKey = formatDateKey_(payCycleStart);
  const headerMap = getHeaderMap_(sheet);
  const startColIndex = headerMap['Pay Cycle Start'];
  if (startColIndex === undefined) return false;

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  for (let i = 0; i < values.length; i++) {
    const date = normalizeDateValue_(values[i][startColIndex]);
    if (date && formatDateKey_(date) === targetKey) return true;
  }

  return false;
}

function buildHistoryInsight_(historyRows) {
  const rows = Array.isArray(historyRows) ? historyRows.filter(Boolean) : [];

  if (!rows.length) {
    return {
      title: 'ยังไม่มีประวัติย้อนหลัง',
      trend: 'No Data',
      summary: 'กด Archive เพื่อเริ่มเก็บประวัติรอบเงินเดือน แล้วระบบจะเริ่มวิเคราะห์แนวโน้มให้',
      averageFcf: 0,
      averageSafeDailySpend: 0,
      onTrackCount: 0,
      watchCount: 0,
      needsActionCount: 0
    };
  }

  const sample = rows.slice(0, 3);
  const averageFcf = sample.reduce((sum, row) => sum + (Number(row.fcf) || 0), 0) / sample.length;
  const averageSafeDailySpend = sample.reduce((sum, row) => sum + (Number(row.safeDailySpend) || 0), 0) / sample.length;
  const onTrackCount = sample.filter(row => row.result === 'On Track').length;
  const watchCount = sample.filter(row => row.result === 'Watch').length;
  const needsActionCount = sample.filter(row => row.result === 'Needs Action').length;

  let trend = 'Stable';
  if (sample.length >= 2) {
    const latestFcf = Number(sample[0].fcf) || 0;
    const previousFcf = Number(sample[1].fcf) || 0;
    if (latestFcf > previousFcf + 1000) trend = 'Improving';
    else if (latestFcf < previousFcf - 1000) trend = 'Declining';
  }

  const title = trend === 'Improving'
    ? 'แนวโน้มดีขึ้น'
    : trend === 'Declining'
      ? 'แนวโน้มควรระวัง'
      : 'แนวโน้มค่อนข้างนิ่ง';

  const summary = `FCF เฉลี่ย ${formatMoneyForText_(averageFcf)} จาก ${sample.length} รอบล่าสุด • ใช้ได้เฉลี่ย ${formatMoneyForText_(averageSafeDailySpend)}/วัน`;

  return {
    title: title,
    trend: trend,
    summary: summary,
    averageFcf: averageFcf,
    averageSafeDailySpend: averageSafeDailySpend,
    onTrackCount: onTrackCount,
    watchCount: watchCount,
    needsActionCount: needsActionCount
  };
}

function archiveCurrentCycle(note) {
  const lock = LockService.getDocumentLock();

  try {
    lock.waitLock(10000);
    ensureWorkbook_();

    const ss = getSS_();
    const sheet = getRequiredSheet_(ss, APP_CONFIG.SHEET_CYCLE_HISTORY);
    const cycle = getCurrentPayCycle_();
    const summary = getFinancialSummary();
    const review = summary.cycleReview || {};

    const rowValues = [
      new Date(),
      cycle.start,
      cycle.end,
      Number(summary.income) || 0,
      Number(summary.expense) || 0,
      Number(summary.savings) || 0,
      Number(summary.investments) || 0,
      Number(summary.fcf) || 0,
      Number(summary.expectedBufferAfterPlan) || 0,
      Number(summary.planFlexRemaining) || 0,
      Number(summary.availableCashAfterPlan) || 0,
      Number(summary.safeDailySpend) || 0,
      Number(summary.emergencyFundCurrent) || 0,
      Number(summary.emergencyFundProgress) || 0,
      cleanText_(review.result || summary.cycleReviewResult || ''),
      cleanText_(review.status || summary.cycleReviewStatus || ''),
      cleanText_(review.recommendation || summary.cycleReviewRecommendation || ''),
      cleanText_(note || '')
    ];

    upsertCycleHistoryRow_(sheet, cycle.start, rowValues);
    SpreadsheetApp.flush();
    invalidateFinanceCache_();

    const cycleHistory = getCycleHistory_(6);
    summary.cycleHistory = cycleHistory;
    summary.isCurrentCycleArchived = isCycleArchived_(cycle.start);
    summary.historyInsight = buildHistoryInsight_(cycleHistory);

    return {
      status: 'success',
      message: 'บันทึก Cycle History เรียบร้อยแล้ว',
      cycleHistory: cycleHistory,
      summary: summary
    };
  } catch (error) {
    return {
      status: 'error',
      message: error.message || String(error)
    };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function getCycleHistory(limit) {
  ensureWorkbook_();
  return getCycleHistory_(limit || 6);
}

function getCycleHistory_(limit) {
  const ss = getSS_();
  const sheet = ss.getSheetByName(APP_CONFIG.SHEET_CYCLE_HISTORY);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const headerMap = getHeaderMap_(sheet);
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const rows = [];

  values.forEach(row => {
    const payCycleStart = normalizeDateValue_(getByHeader_(row, headerMap, 'Pay Cycle Start'));
    if (!payCycleStart) return;

    const archivedAt = getByHeader_(row, headerMap, 'Archived At');
    const archivedDate = Object.prototype.toString.call(archivedAt) === '[object Date]' ? archivedAt : payCycleStart;

    rows.push({
      archivedAt: formatDateForClient_(archivedAt),
      payCycleStart: formatDateForClient_(payCycleStart),
      payCycleEnd: formatDateForClient_(getByHeader_(row, headerMap, 'Pay Cycle End')),
      income: Number(getByHeader_(row, headerMap, 'Income')) || 0,
      expense: Number(getByHeader_(row, headerMap, 'Expense')) || 0,
      savings: Number(getByHeader_(row, headerMap, 'Savings')) || 0,
      investments: Number(getByHeader_(row, headerMap, 'Investments')) || 0,
      fcf: Number(getByHeader_(row, headerMap, 'Actual FCF')) || 0,
      expectedBuffer: Number(getByHeader_(row, headerMap, 'Expected Buffer')) || 0,
      planFlex: Number(getByHeader_(row, headerMap, 'Plan Flex')) || 0,
      availableCashAfterPlan: Number(getByHeader_(row, headerMap, 'Available Cash After Plan')) || 0,
      safeDailySpend: Number(getByHeader_(row, headerMap, 'Safe Daily Spend')) || 0,
      emergencyFundCurrent: Number(getByHeader_(row, headerMap, 'Emergency Fund Current')) || 0,
      emergencyFundProgress: Number(getByHeader_(row, headerMap, 'Emergency Fund Progress')) || 0,
      result: cleanText_(getByHeader_(row, headerMap, 'Result')),
      status: cleanText_(getByHeader_(row, headerMap, 'Status')),
      recommendation: cleanText_(getByHeader_(row, headerMap, 'Recommendation')),
      note: cleanText_(getByHeader_(row, headerMap, 'Note')),
      sortTime: archivedDate.getTime()
    });
  });

  rows.sort((a, b) => b.sortTime - a.sortTime);
  return rows.slice(0, Number(limit) || 6).map(row => {
    delete row.sortTime;
    return row;
  });
}

function upsertCycleHistoryRow_(sheet, payCycleStart, rowValues) {
  const targetKey = formatDateKey_(payCycleStart);
  const headerMap = getHeaderMap_(sheet);
  const startColIndex = headerMap['Pay Cycle Start'];

  if (startColIndex === undefined) {
    throw new Error('ไม่พบคอลัมน์ Pay Cycle Start ใน Cycle_History');
  }

  if (sheet.getLastRow() >= 2) {
    const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
    for (let i = 0; i < values.length; i++) {
      const existingDate = normalizeDateValue_(values[i][startColIndex]);
      if (!existingDate) continue;
      if (formatDateKey_(existingDate) === targetKey) {
        sheet.getRange(i + 2, 1, 1, rowValues.length).setValues([rowValues]);
        return;
      }
    }
  }

  writeTransactionRow_(sheet, rowValues);
}


/*******************************************************
 * Phase 4.2 - Budget Guard
 *******************************************************/
