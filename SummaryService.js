/*******************************************************
 * Personal AI Finance OS v12.9 Split Backend
 * File: SummaryService.gs
 * Google Apps Script shares global scope across .gs files.
 *******************************************************/

function getFinancialSummaryCached_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(API_SECURITY.SUMMARY_CACHE_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      parsed._cache = { hit: true, layer: 'script_cache', seconds: API_SECURITY.SUMMARY_CACHE_SECONDS };
      return parsed;
    } catch (err) {
      cache.remove(API_SECURITY.SUMMARY_CACHE_KEY);
    }
  }

  const sheetCached = getDashboardCachePayload_();
  if (sheetCached) {
    try {
      cache.put(API_SECURITY.SUMMARY_CACHE_KEY, JSON.stringify(sheetCached), Math.min(API_SECURITY.SUMMARY_CACHE_SECONDS, 300));
    } catch (err) {}
    sheetCached._cache = { hit: true, layer: 'dashboard_cache_sheet', seconds: API_SECURITY.SUMMARY_CACHE_SECONDS };
    return sheetCached;
  }

  const data = getFinancialSummary();
  saveDashboardCachePayload_(data);
  try {
    cache.put(API_SECURITY.SUMMARY_CACHE_KEY, JSON.stringify(data), API_SECURITY.SUMMARY_CACHE_SECONDS);
  } catch (err) {
    // Cache is a performance helper only. Never block the main API because of cache issues.
  }
  data._cache = { hit: false, layer: 'computed', seconds: API_SECURITY.SUMMARY_CACHE_SECONDS };
  return data;
}

function getDashboardCachePayload_() {
  try {
    const ss = getSS_();
    const sheet = ss.getSheetByName(APP_CONFIG.SHEET_DASHBOARD_CACHE);
    if (!sheet || sheet.getLastRow() < 2) return null;

    const row = sheet.getRange(2, 1, 1, DASHBOARD_CACHE_HEADERS.length).getValues()[0];
    const cacheKey = cleanText_(row[0]);
    const expiresAt = row[2];
    const payloadText = row[3];

    if (cacheKey !== API_SECURITY.SUMMARY_CACHE_KEY) return null;
    if (!(expiresAt instanceof Date) || expiresAt.getTime() < Date.now()) return null;
    if (!payloadText) return null;

    return JSON.parse(String(payloadText));
  } catch (err) {
    return null;
  }
}

function saveDashboardCachePayload_(data) {
  try {
    const ss = getSS_();
    let sheet = ss.getSheetByName(APP_CONFIG.SHEET_DASHBOARD_CACHE);
    if (!sheet) {
      sheet = ss.insertSheet(APP_CONFIG.SHEET_DASHBOARD_CACHE);
      sheet.getRange(1, 1, 1, DASHBOARD_CACHE_HEADERS.length).setValues([DASHBOARD_CACHE_HEADERS]);
      sheet.setFrozenRows(1);
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + (API_SECURITY.SUMMARY_CACHE_SECONDS * 1000));
    const payload = JSON.stringify(data || {});

    // Google Sheets cell limit is enough for current dashboard payload. If it grows too much, skip sheet cache safely.
    if (payload.length > 45000) return;

    sheet.getRange(2, 1, 1, DASHBOARD_CACHE_HEADERS.length).setValues([[API_SECURITY.SUMMARY_CACHE_KEY, now, expiresAt, payload]]);
  } catch (err) {
    // Sheet cache is optional. Never block dashboard because of cache save errors.
  }
}

function invalidateFinanceCache_() {
  try { CacheService.getScriptCache().remove(API_SECURITY.SUMMARY_CACHE_KEY); } catch (err) {}
  try {
    const ss = getSS_();
    const sheet = ss.getSheetByName(APP_CONFIG.SHEET_DASHBOARD_CACHE);
    if (sheet && sheet.getLastRow() >= 2) sheet.getRange(2, 1, sheet.getLastRow() - 1, DASHBOARD_CACHE_HEADERS.length).clearContent();
  } catch (err) {}
}

function getFinancialSummary() {
  const summary = {
    income: 0,
    expense: 0,
    savings: 0,
    investments: 0,
    fcf: 0,
    fcfRate: 0,

    openingCashBalance: 0,
    availableCash: 0,
    availableCashAfterPlan: 0,

    plannedIncome: 0,
    plannedPayMother: 0,
    plannedDebtBills: 0,
    plannedSavings: 0,
    plannedLivingBudget: 0,
    expectedBufferAfterPlan: 0,
    planFlexRemaining: 0,

    actualPayMother: 0,
    payMotherProgress: 0,
    actualDebtBills: 0,
    debtBillsProgress: 0,
    actualSavings: 0,
    savingsProgress: 0,
    actualLivingExpense: 0,
    livingBudgetRemaining: 0,
    livingBudgetUsedPercent: 0,
    planCompletedCount: 0,
    planTaskCount: 0,
    planTrackingStatus: 'Unknown',

    cycleReview: null,
    cycleReviewStatus: 'Unknown',
    cycleReviewResult: 'Unknown',
    cycleReviewRecommendation: '',
    aiCoachV2: '',
    planSuggestion: null,
    cycleHistory: [],
    isCurrentCycleArchived: false,
    historyInsight: null,
    budgetGuard: [],
    budgetGuardLevel: 'Unknown',
    budgetGuardSummary: '',
    categorySpending: [],
    monthlyPatternInsight: null,
    editablePlan: null,

    daysLeft: 0,
    safeDailySpend: 0,

    emergencyFundCurrent: 0,
    emergencyFundTarget: 100000,
    emergencyFundProgress: 0,
    investmentCurrent: 0,

    aiStatus: '💡 พร้อมวิเคราะห์ข้อมูล',
    riskLevel: 'Unknown',
    uiTone: 'neutral',
    month: '',
  };

  try {
    ensureWorkbook_();

    const ss = getSS_();
    const incomeSheet = ss.getSheetByName(APP_CONFIG.SHEET_INCOME);
    const expenseSheet = ss.getSheetByName(APP_CONFIG.SHEET_EXPENSES);
    const savingsSheet = ss.getSheetByName(APP_CONFIG.SHEET_SAVINGS);
    const investmentSheet = ss.getSheetByName(APP_CONFIG.SHEET_INVESTMENTS);

    const cycle = getCurrentPayCycle_();
    const actualEnd = minDate_(cycle.end, cycle.today);

    summary.income = sumAmountForDateRange_(incomeSheet, cycle.start, actualEnd, 4);
    summary.expense = sumAmountForDateRange_(expenseSheet, cycle.start, actualEnd, 4);
    summary.savings = sumNetSavingsForDateRange_(savingsSheet, cycle.start, actualEnd);
    summary.investments = sumInvestmentCashOutForDateRange_(investmentSheet, cycle.start, actualEnd);
    summary.fcf = summary.income - summary.expense - summary.savings - summary.investments;
    summary.fcfRate = summary.income > 0 ? summary.fcf / summary.income : 0;

    const emergency = getGoalStatus_('Emergency Fund 100k');
    summary.emergencyFundCurrent = emergency.current;
    summary.emergencyFundTarget = emergency.target || 100000;
    summary.emergencyFundProgress = summary.emergencyFundTarget > 0
      ? summary.emergencyFundCurrent / summary.emergencyFundTarget
      : 0;

    summary.openingCashBalance = getAccountOpeningBalanceByType_('Cash');
    summary.availableCash = getAccountCurrentBalanceByType_('Cash');
    if (!summary.availableCash) {
      summary.availableCash = summary.openingCashBalance + summary.fcf;
    }

    summary.investmentCurrent = getAccountCurrentBalanceByType_('Investment');
    if (!summary.investmentCurrent) {
      summary.investmentCurrent = getInvestmentCurrentValue_();
    }

    const plan = getPlanForPayCycle_(cycle.start);
    summary.plannedIncome = plan.expectedIncome;
    summary.plannedPayMother = plan.payMother;
    summary.plannedDebtBills = plan.debtBills;
    summary.plannedSavings = plan.savingsPlan;
    summary.plannedLivingBudget = plan.livingBudget;
    summary.expectedBufferAfterPlan = plan.expectedBuffer;
    summary.editablePlan = buildEditablePlanPayload_(plan, cycle); // ✅ ย้ายมาไว้หลัง cycle และ plan พร้อมแล้ว

    if (!summary.expectedBufferAfterPlan && (
      summary.plannedIncome || summary.plannedPayMother || summary.plannedDebtBills || summary.plannedSavings || summary.plannedLivingBudget
    )) {
      summary.expectedBufferAfterPlan =
        summary.plannedIncome -
        summary.plannedPayMother -
        summary.plannedDebtBills -
        summary.plannedSavings -
        summary.plannedLivingBudget;
    }

    const planTracking = getPlanTrackingForDateRange_(expenseSheet, savingsSheet, cycle.start, actualEnd, summary);
    summary.actualPayMother = planTracking.actualPayMother;
    summary.payMotherProgress = planTracking.payMotherProgress;
    summary.actualDebtBills = planTracking.actualDebtBills;
    summary.debtBillsProgress = planTracking.debtBillsProgress;
    summary.actualSavings = planTracking.actualSavings;
    summary.savingsProgress = planTracking.savingsProgress;
    summary.actualLivingExpense = planTracking.actualLivingExpense;
    summary.livingBudgetRemaining = planTracking.livingBudgetRemaining;
    summary.livingBudgetUsedPercent = planTracking.livingBudgetUsedPercent;
    summary.planCompletedCount = planTracking.planCompletedCount;   // ✅ ลบบรรทัดซ้ำออกแล้ว
    summary.planTaskCount = planTracking.planTaskCount;
    summary.planTrackingStatus = planTracking.planTrackingStatus;

    summary.availableCashAfterPlan = summary.openingCashBalance + summary.expectedBufferAfterPlan;
    summary.planFlexRemaining = summary.fcf - summary.expectedBufferAfterPlan;

    summary.daysLeft = Math.max(1, dateDiffDays_(cycle.today, cycle.end) + 1);
    summary.safeDailySpend = summary.daysLeft > 0                   // ✅ แก้ safeDailySpend ติดลบ
      ? Math.max(0, summary.availableCashAfterPlan) / summary.daysLeft
      : 0;

    summary.cycleReview = buildCycleReview_(summary);
    summary.cycleReviewStatus = summary.cycleReview.status;
    summary.cycleReviewResult = summary.cycleReview.result;
    summary.cycleReviewRecommendation = summary.cycleReview.recommendation;
    summary.aiCoachV2 = summary.cycleReview.recommendation;
    summary.planSuggestion = buildPlanSuggestion_(summary);
    summary.cycleHistory = getCycleHistory_(6);
    summary.isCurrentCycleArchived = isCycleArchived_(cycle.start);
    summary.historyInsight = buildHistoryInsight_(summary.cycleHistory);
    summary.budgetGuard = buildBudgetGuard_(summary, expenseSheet, cycle.start, actualEnd);
    summary.budgetGuardLevel = getBudgetGuardLevel_(summary.budgetGuard);
    summary.budgetGuardSummary = buildBudgetGuardSummary_(summary.budgetGuard);
    summary.categorySpending = getExpenseCategoryTotalsForDateRange_(expenseSheet, cycle.start, actualEnd, 8);
    summary.monthlyPatternInsight = buildMonthlyPatternInsight_(summary, summary.cycleHistory, expenseSheet, cycle.start, actualEnd);

    summary.month = formatDateForClient_(cycle.start) + ' ถึง ' + formatDateForClient_(actualEnd);
    summary.aiStatus = buildAIStatus_(summary);
    summary.riskLevel = buildRiskLevel_(summary);
    summary.uiTone = buildUITone_(summary);

    return summary;
  } catch (e) {
    summary.aiStatus = '⚠️ ไม่สามารถดึงข้อมูลได้: ' + e.message;
    summary.riskLevel = 'Error';
    return summary;
  }
}

function buildCycleReview_(summary) {
  const plannedIncome = Number(summary.plannedIncome) || 0;
  const actualIncome = Number(summary.income) || 0;
  const expectedBuffer = Number(summary.expectedBufferAfterPlan) || 0;
  const actualFcf = Number(summary.fcf) || 0;
  const safeDailySpend = Number(summary.safeDailySpend) || 0;
  const livingUsedPercent = Number(summary.livingBudgetUsedPercent) || 0;
  const planFlex = Number(summary.planFlexRemaining) || 0;

  const incomeProgress = safeRatio_(actualIncome, plannedIncome);

  const items = [
    {
      key: 'income',
      label: 'Income',
      actual: actualIncome,
      planned: plannedIncome,
      progress: incomeProgress,
      status: plannedIncome <= 0 ? 'No Plan' : actualIncome >= plannedIncome ? 'Completed' : 'Pending'
    },
    {
      key: 'payMother',
      label: 'Pay Mother',
      actual: Number(summary.actualPayMother) || 0,
      planned: Number(summary.plannedPayMother) || 0,
      progress: Number(summary.payMotherProgress) || 0,
      status: getProgressStatus_(Number(summary.actualPayMother) || 0, Number(summary.plannedPayMother) || 0)
    },
    {
      key: 'debtBills',
      label: 'Debt / Bills',
      actual: Number(summary.actualDebtBills) || 0,
      planned: Number(summary.plannedDebtBills) || 0,
      progress: Number(summary.debtBillsProgress) || 0,
      status: getProgressStatus_(Number(summary.actualDebtBills) || 0, Number(summary.plannedDebtBills) || 0)
    },
    {
      key: 'savings',
      label: 'Savings',
      actual: Number(summary.actualSavings) || 0,
      planned: Number(summary.plannedSavings) || 0,
      progress: Number(summary.savingsProgress) || 0,
      status: getProgressStatus_(Number(summary.actualSavings) || 0, Number(summary.plannedSavings) || 0)
    },
    {
      key: 'livingBudget',
      label: 'Living Budget',
      actual: Number(summary.actualLivingExpense) || 0,
      planned: Number(summary.plannedLivingBudget) || 0,
      progress: livingUsedPercent,
      remaining: Number(summary.livingBudgetRemaining) || 0,
      status: Number(summary.plannedLivingBudget) <= 0 ? 'No Plan' : livingUsedPercent <= 1 ? 'Safe' : 'Over Budget'
    }
  ];

  const pending = [];
  const completed = [];

  items.forEach(item => {
    if (item.status === 'Completed' || item.status === 'Safe') completed.push(item.label);
    if (item.status === 'Pending' || item.status === 'Over Budget') pending.push(item.label);
  });

  let result = 'On Track';
  if (Number(summary.availableCashAfterPlan) < 0 || actualFcf < 0 || livingUsedPercent > 1) {
    result = 'Needs Action';
  } else if (pending.length > 0 || planFlex <= 0 || safeDailySpend < 300) {
    result = 'Watch';
  }

  let status = 'ยังไม่มีแผนรอบนี้';
  if (Number(summary.planTaskCount) > 0 || plannedIncome > 0) {
    if (result === 'Needs Action') status = 'ต้องปรับแผน';
    else if (result === 'Watch') status = 'ติดตามใกล้ชิด';
    else status = 'เป็นไปตามแผน';
  }

  const notes = [];
  if ((Number(summary.actualPayMother) || 0) >= (Number(summary.plannedPayMother) || 0) && (Number(summary.plannedPayMother) || 0) > 0) {
    notes.push('ช่วยแม่/ค่ารักษาสัตว์ครบตามแผนแล้ว');
  }
  if ((Number(summary.actualSavings) || 0) >= (Number(summary.plannedSavings) || 0) && (Number(summary.plannedSavings) || 0) > 0) {
    notes.push('ออมครบตามแผนแล้ว');
  }
  if ((Number(summary.plannedDebtBills) || 0) > 0 && (Number(summary.actualDebtBills) || 0) < (Number(summary.plannedDebtBills) || 0)) {
    notes.push('ยังเหลือ Debt/Bills ที่ควรกันเงินไว้ก่อน');
  }
  if (livingUsedPercent > 0.8 && livingUsedPercent <= 1) {
    notes.push('Living Budget ใช้ไปค่อนข้างมากแล้ว');
  } else if (livingUsedPercent <= 0.5 && (Number(summary.plannedLivingBudget) || 0) > 0) {
    notes.push('งบใช้ชีวิตยังเหลือปลอดภัย');
  }
  if (safeDailySpend >= 300 && planFlex > 0) {
    notes.push('งบใช้จ่ายต่อวันยังอยู่ในโซนปลอดภัย');
  }

  let recommendation = 'เริ่มบันทึกรายการจริงให้ครบ เพื่อให้ระบบแนะนำแผนได้แม่นขึ้น';
  if (result === 'Needs Action') {
    recommendation = 'ควรลดรายจ่ายหรือเลื่อนบางแผน เพราะเงินหลังทำตามแผนเริ่มไม่พอ';
  } else if ((Number(summary.plannedDebtBills) || 0) > 0 && (Number(summary.actualDebtBills) || 0) < (Number(summary.plannedDebtBills) || 0)) {
    recommendation = 'แผนหลักดีแล้ว แต่ควรกันเงินสำหรับ Debt/Bills ก่อนเพิ่มรายจ่ายอื่น';
  } else if ((Number(summary.actualSavings) || 0) < (Number(summary.plannedSavings) || 0) && (Number(summary.plannedSavings) || 0) > 0) {
    recommendation = 'ควรโอนเงินออมตามแผนก่อน เพื่อไม่ให้ Emergency Fund หลุดเป้า';
  } else if (safeDailySpend >= 300 && planFlex > 0) {
    recommendation = 'แผนรอบนี้ยังปลอดภัย ใช้จ่ายตามงบรายวันและโฟกัส Emergency Fund ต่อ';
  }

  return {
    result,
    status,
    recommendation,
    items,
    pending,
    completed,
    notes,
    expectedBuffer,
    actualFcf,
    planFlex,
    safeDailySpend,
    livingBudgetRemaining: Number(summary.livingBudgetRemaining) || 0,
  };
}

function getProgressStatus_(actual, planned) {
  actual = Number(actual) || 0;
  planned = Number(planned) || 0;
  if (planned <= 0) return 'No Plan';
  return actual >= planned ? 'Completed' : 'Pending';
}

function buildPlanSuggestion_(summary) {
  const currentBuffer = Number(summary.expectedBufferAfterPlan) || 0;
  const nextSavings = Number(summary.plannedSavings) || 0;
  const nextPayMother = Number(summary.plannedPayMother) || 0;
  const nextDebtBills = Math.max(0, Number(summary.plannedDebtBills) || 0);
  const nextLivingBudget = Number(summary.plannedLivingBudget) || 0;
  const expectedIncome = Number(summary.plannedIncome) || Number(summary.income) || 0;

  let suggestionText = 'ใช้แผนเดิมต่อได้ และติดตามรายจ่ายจริงทุกวัน';
  if (summary.cycleReview && summary.cycleReview.result === 'Needs Action') {
    suggestionText = 'รอบถัดไปควรลด Living Budget หรือเลื่อนบางแผนก่อน';
  } else if ((Number(summary.emergencyFundProgress) || 0) < 1) {
    suggestionText = 'รอบถัดไปยังควรให้ Emergency Fund เป็นเป้าหมายหลัก';
  }

  return {
    expectedIncome,
    payMother: nextPayMother,
    debtBills: nextDebtBills,
    savings: nextSavings,
    livingBudget: nextLivingBudget,
    expectedBuffer: currentBuffer,
    suggestionText,
  };
}

function getAccountOpeningBalanceByType_(accountType) {
  return sumAccountColumnByType_(accountType, 'Opening Balance');
}

function getAccountCurrentBalanceByType_(accountType) {
  return sumAccountColumnByType_(accountType, 'Current Balance');
}

function sumAccountColumnByType_(accountType, columnName) {
  const ss = getSS_();
  const sheet = ss.getSheetByName(APP_CONFIG.SHEET_ACCOUNTS);
  if (!sheet || sheet.getLastRow() < 2) return 0;

  const headerMap = getHeaderMap_(sheet);
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  let total = 0;

  values.forEach(row => {
    const type = cleanText_(getByHeader_(row, headerMap, 'Type'));
    if (type !== accountType) return;
    total += Number(getByHeader_(row, headerMap, columnName)) || 0;
  });

  return total;
}

function getGoalStatus_(goalName) {
  const ss = getSS_();
  const goalsSheet = ss.getSheetByName(APP_CONFIG.SHEET_GOALS);
  const savingsSheet = ss.getSheetByName(APP_CONFIG.SHEET_SAVINGS);

  let target = 0;
  if (goalsSheet && goalsSheet.getLastRow() >= 2) {
    const values = goalsSheet.getRange(2, 1, goalsSheet.getLastRow() - 1, 3).getValues();
    values.forEach(row => {
      if (cleanText_(row[0]) === goalName) target = Number(row[2]) || 0;
    });
  }

  let current = 0;
  if (savingsSheet && savingsSheet.getLastRow() >= 2) {
    const values = savingsSheet.getRange(2, 1, savingsSheet.getLastRow() - 1, SAVINGS_HEADERS.length).getValues();
    values.forEach(row => {
      const rowGoal = cleanText_(row[2]);
      if (rowGoal !== goalName) return;
      current += (Number(row[3]) || 0) - (Number(row[4]) || 0);
    });
  }

  return { current, target };
}

function getInvestmentCurrentValue_() {
  const ss = getSS_();
  const sheet = ss.getSheetByName(APP_CONFIG.SHEET_INVESTMENTS);
  if (!sheet || sheet.getLastRow() < 2) return 0;

  const headerMap = getHeaderMap_(sheet);
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  let total = 0;

  values.forEach(row => {
    const action = cleanText_(getByHeader_(row, headerMap, 'Action'));
    const amount = Number(getByHeader_(row, headerMap, 'Amount')) || 0;
    if (!amount) return;

    if (action === 'Withdraw' || action === 'Withdrawal' || action === 'Sell' || action === 'Fee') {
      total -= amount;
    } else {
      // ใช้ Opening Balance ได้เฉพาะ fallback กรณีไม่มี Accounts
      total += amount;
    }
  });

  return total;
}

function sumAmountForDateRange_(sheet, startDate, endDate, amountCol) {
  if (!sheet || sheet.getLastRow() < 2) return 0;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(amountCol, 1)).getValues();
  let total = 0;

  values.forEach(row => {
    const dateObj = normalizeDateValue_(row[0]);
    const amount = Number(row[amountCol - 1]) || 0;
    if (!dateObj || amount <= 0) return;
    if (dateObj.getTime() >= startDate.getTime() && dateObj.getTime() <= endDate.getTime()) total += amount;
  });

  return total;
}

function getPlanTrackingForDateRange_(expenseSheet, savingsSheet, startDate, endDate, summary) {
  const plannedPayMother = Number(summary.plannedPayMother) || 0;
  const plannedDebtBills = Number(summary.plannedDebtBills) || 0;
  const plannedSavings = Number(summary.plannedSavings) || 0;
  const plannedLivingBudget = Number(summary.plannedLivingBudget) || 0;

  const payMotherCategories = ['Family', 'Medical/Pet'];
  const debtBillsCategories = ['Debt payment', 'Utilities', 'Phone/Internet', 'Subscription', 'Housing'];

  const actualPayMother = sumExpensesByCategoriesForDateRange_(expenseSheet, startDate, endDate, payMotherCategories);
  const actualDebtBills = sumExpensesByCategoriesForDateRange_(expenseSheet, startDate, endDate, debtBillsCategories);
  const actualSavings = Number(summary.savings) || sumNetSavingsForDateRange_(savingsSheet, startDate, endDate);
  const actualLivingExpense = Math.max(0, (Number(summary.expense) || 0) - actualPayMother - actualDebtBills);

  const payMotherProgress = safeRatio_(actualPayMother, plannedPayMother);
  const debtBillsProgress = safeRatio_(actualDebtBills, plannedDebtBills);
  const savingsProgress = safeRatio_(actualSavings, plannedSavings);
  const livingBudgetUsedPercent = safeRatio_(actualLivingExpense, plannedLivingBudget);
  const livingBudgetRemaining = plannedLivingBudget ? plannedLivingBudget - actualLivingExpense : 0;

  let completed = 0;
  let total = 0;

  if (plannedPayMother > 0) {
    total++;
    if (actualPayMother >= plannedPayMother) completed++;
  }

  if (plannedDebtBills > 0) {
    total++;
    if (actualDebtBills >= plannedDebtBills) completed++;
  }

  if (plannedSavings > 0) {
    total++;
    if (actualSavings >= plannedSavings) completed++;
  }

  // Phase 4.5 Polish:
  // Living Budget is a usage monitor, not a checklist task.
  // Do not count it as completed/incomplete, otherwise 0% spending looks like an unfinished plan.

  let status = 'ยังไม่มีแผนหลักสำหรับรอบนี้';
  if (total > 0) {
    if (livingBudgetUsedPercent > 1) {
      status = `ทำแผนหลักแล้ว ${completed}/${total} รายการ • Living Budget เกินแผน`;
    } else if (completed === total) {
      status = 'ทำแผนหลักครบแล้ว • Living Budget ยังอยู่ในโซนติดตาม';
    } else if (savingsProgress >= 1 && payMotherProgress >= 1) {
      status = `แผนสำคัญทำครบแล้ว • เหลือแผนหลัก ${total - completed} รายการ`;
    } else {
      status = `ทำแผนหลักแล้ว ${completed}/${total} รายการ`;
    }
  }

  return {
    actualPayMother,
    payMotherProgress,
    actualDebtBills,
    debtBillsProgress,
    actualSavings,
    savingsProgress,
    actualLivingExpense,
    livingBudgetRemaining,
    livingBudgetUsedPercent,
    planCompletedCount: completed,
    planTaskCount: total,
    planTrackingStatus: status,
  };
}

function sumExpensesByCategoriesForDateRange_(sheet, startDate, endDate, categories) {
  if (!sheet || sheet.getLastRow() < 2) return 0;

  const categorySet = new Set((categories || []).map(cleanText_));
  const headerMap = getHeaderMap_(sheet);
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  let total = 0;

  values.forEach(row => {
    const dateObj = normalizeDateValue_(getByHeader_(row, headerMap, 'Date'));
    if (!dateObj) return;
    if (dateObj.getTime() < startDate.getTime() || dateObj.getTime() > endDate.getTime()) return;

    const category = cleanText_(getByHeader_(row, headerMap, 'Category'));
    if (!categorySet.has(category)) return;

    const amount = Number(getByHeader_(row, headerMap, 'Amount')) || 0;
    if (amount > 0) total += amount;
  });

  return total;
}

function sumNetSavingsForDateRange_(sheet, startDate, endDate) {
  if (!sheet || sheet.getLastRow() < 2) return 0;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, SAVINGS_HEADERS.length).getValues();
  let total = 0;

  values.forEach(row => {
    const dateObj = normalizeDateValue_(row[0]);
    if (!dateObj) return;
    if (dateObj.getTime() < startDate.getTime() || dateObj.getTime() > endDate.getTime()) return;
    total += (Number(row[3]) || 0) - (Number(row[4]) || 0);
  });

  return total;
}

function sumInvestmentCashOutForDateRange_(sheet, startDate, endDate) {
  if (!sheet || sheet.getLastRow() < 2) return 0;

  const headerMap = getHeaderMap_(sheet);
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  let total = 0;

  values.forEach(row => {
    const dateObj = normalizeDateValue_(getByHeader_(row, headerMap, 'Date'));
    if (!dateObj) return;
    if (dateObj.getTime() < startDate.getTime() || dateObj.getTime() > endDate.getTime()) return;

    const action = cleanText_(getByHeader_(row, headerMap, 'Action'));
    if (action === 'Opening Balance' || action === 'Opening') return;

    const amount = Number(getByHeader_(row, headerMap, 'Amount')) || 0;
    if (!amount) return;

    // Buy/DCA/Deposit = เงินออกจากบัญชีหลักไปลงทุน จึงนับเป็น cash out
    // Withdraw/Sell = เงินกลับมาจากพอร์ต จึงลด cash out
    if (action === 'Withdraw' || action === 'Withdrawal' || action === 'Sell') {
      total -= amount;
    } else if (action === 'Fee') {
      total += amount;
    } else {
      total += amount;
    }
  });

  return total;
}

function buildAIStatus_(summary) {
  const income = Number(summary.income) || 0;
  const expense = Number(summary.expense) || 0;
  const fcf = Number(summary.fcf) || 0;
  const safeDailySpend = Number(summary.safeDailySpend) || 0;
  const availableCashAfterPlan = Number(summary.availableCashAfterPlan) || 0;

  // Keep this text short and emoji-free. Frontend adds tone icon + color.
  if (income <= 0 && expense <= 0) return 'เริ่มบันทึกได้เลย';
  if (fcf < 0) return 'FCF ติดลบ';
  if (availableCashAfterPlan < 0) return 'แผนติดลบ';
  if (safeDailySpend < 200) return 'คุมรายจ่ายเข้ม';
  if (safeDailySpend < 500) return 'ระวังงบรายวัน';
  if ((summary.emergencyFundProgress || 0) < 1) return 'แผนปลอดภัย';
  return 'เงินสดดี';
}

function buildRiskLevel_(summary) {
  if (Number(summary.fcf) < 0) return 'High';
  if (Number(summary.availableCashAfterPlan) < 0) return 'High';
  if (Number(summary.safeDailySpend) < 200) return 'Medium';
  if (Number(summary.fcfRate) < 0.1) return 'Medium';
  return 'Low';
}

function buildUITone_(summary) {
  const risk = buildRiskLevel_(summary);
  const safeDaily = Number(summary.safeDailySpend) || 0;
  const fcf = Number(summary.fcf) || 0;
  if (risk === 'High' || fcf < 0) return 'danger';
  if (risk === 'Medium' || safeDaily < 300) return 'warning';
  if (safeDaily >= 500 && fcf > 0) return 'success';
  return 'watch';
}
