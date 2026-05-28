/*******************************************************
 * Personal AI Finance OS v12.9 Split Backend
 * File: PlanService.gs
 * Google Apps Script shares global scope across .gs files.
 *******************************************************/

function getPlanForPayCycle_(payCycleStart) {
  const empty = {
    rowNumber: null,
    payCycleStart: payCycleStart || null,
    payCycleEnd: null,
    expectedIncome: 0,
    payMother: 0,
    debtBills: 0,
    savingsPlan: 0,
    livingBudget: 0,
    expectedBuffer: 0,
    mainGoal: '',
    note: ''
  };

  const ss = getSS_();
  const sheet = ss.getSheetByName(APP_CONFIG.SHEET_PLANS);
  if (!sheet || sheet.getLastRow() < 2) return empty;

  const headerMap = getHeaderMap_(sheet);
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const target = normalizeDateValue_(payCycleStart);
  if (!target) return empty;

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const start = normalizeDateValue_(getByHeader_(row, headerMap, 'Pay Cycle Start'));
    if (!start) continue;

    if (start.getTime() === target.getTime()) {
      return {
        rowNumber: i + 2,
        payCycleStart: start,
        payCycleEnd: normalizeDateValue_(getByHeader_(row, headerMap, 'Pay Cycle End')),
        expectedIncome: Number(getByHeader_(row, headerMap, 'Expected Income')) || 0,
        payMother: Number(getByHeader_(row, headerMap, 'Pay Mother Plan')) || 0,
        debtBills: Number(getByHeader_(row, headerMap, 'Debt / Bills Plan')) || 0,
        savingsPlan: Number(getByHeader_(row, headerMap, 'Savings Plan')) || 0,
        livingBudget: Number(getByHeader_(row, headerMap, 'Living Budget')) || 0,
        expectedBuffer: Number(getByHeader_(row, headerMap, 'Expected Buffer')) || 0,
        mainGoal: cleanText_(getByHeader_(row, headerMap, 'Main Goal')),
        note: cleanText_(getByHeader_(row, headerMap, 'Note'))
      };
    }
  }

  return empty;
}

function buildEditablePlanPayload_(plan, cycle) {
  const expectedBuffer = Number(plan.expectedBuffer) || (
    (Number(plan.expectedIncome) || 0) -
    (Number(plan.payMother) || 0) -
    (Number(plan.debtBills) || 0) -
    (Number(plan.savingsPlan) || 0) -
    (Number(plan.livingBudget) || 0)
  );

  return {
    payCycleStart: formatDateForClient_(plan.payCycleStart || cycle.start),
    payCycleEnd: formatDateForClient_(plan.payCycleEnd || cycle.end),
    expectedIncome: Number(plan.expectedIncome) || 0,
    payMother: Number(plan.payMother) || 0,
    debtBills: Number(plan.debtBills) || 0,
    savingsPlan: Number(plan.savingsPlan) || 0,
    livingBudget: Number(plan.livingBudget) || 0,
    expectedBuffer: expectedBuffer,
    mainGoal: cleanText_(plan.mainGoal),
    note: cleanText_(plan.note)
  };
}

function updateCurrentPlan(data) {
  const lock = LockService.getDocumentLock();

  try {
    lock.waitLock(10000);
    ensureWorkbook_();
    data = sanitizeClientPayload_(data || {});

    const cycle = getCurrentPayCycle_();
    const ss = getSS_();
    const sheet = getRequiredSheet_(ss, APP_CONFIG.SHEET_PLANS);
    const logSheet = getRequiredSheet_(ss, APP_CONFIG.SHEET_PLAN_CHANGE_LOG);
    const oldPlan = getPlanForPayCycle_(cycle.start);

    const nextPlan = {
      expectedIncome: toNonNegativeNumber_(data && data.expectedIncome, 'Expected Income'),
      payMother: toNonNegativeNumber_(data && data.payMother, 'Pay Mother Plan'),
      debtBills: toNonNegativeNumber_(data && data.debtBills, 'Debt / Bills Plan'),
      savingsPlan: toNonNegativeNumber_(data && data.savingsPlan, 'Savings Plan'),
      livingBudget: toNonNegativeNumber_(data && data.livingBudget, 'Living Budget'),
      mainGoal: cleanText_(data && data.mainGoal),
      note: cleanText_(data && data.note)
    };

    nextPlan.expectedBuffer = nextPlan.expectedIncome - nextPlan.payMother - nextPlan.debtBills - nextPlan.savingsPlan - nextPlan.livingBudget;

    const rowValues = [
      cycle.start,
      cycle.end,
      nextPlan.expectedIncome,
      nextPlan.payMother,
      nextPlan.debtBills,
      nextPlan.savingsPlan,
      nextPlan.livingBudget,
      nextPlan.expectedBuffer,
      nextPlan.mainGoal,
      nextPlan.note
    ];

    let targetRow = oldPlan.rowNumber;
    if (!targetRow) {
      targetRow = findFirstEmptyTransactionRow_(sheet);
    }

    sheet.getRange(targetRow, 1, 1, PLAN_HEADERS.length).setValues([rowValues]);

    const logRow = [
      new Date(),
      cycle.start,
      cycle.end,
      Number(oldPlan.expectedIncome) || 0,
      nextPlan.expectedIncome,
      Number(oldPlan.payMother) || 0,
      nextPlan.payMother,
      Number(oldPlan.debtBills) || 0,
      nextPlan.debtBills,
      Number(oldPlan.savingsPlan) || 0,
      nextPlan.savingsPlan,
      Number(oldPlan.livingBudget) || 0,
      nextPlan.livingBudget,
      Number(oldPlan.expectedBuffer) || 0,
      nextPlan.expectedBuffer,
      cleanText_(oldPlan.mainGoal),
      nextPlan.mainGoal,
      cleanText_(oldPlan.note),
      nextPlan.note,
      'Web App'
    ];

    writeTransactionRow_(logSheet, logRow);
    SpreadsheetApp.flush();
    invalidateFinanceCache_();

    const summary = getFinancialSummary();
    return {
      status: 'success',
      message: 'อัปเดตแผนรอบนี้เรียบร้อยแล้ว',
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
