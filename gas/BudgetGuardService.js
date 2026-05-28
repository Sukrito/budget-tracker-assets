/*******************************************************
 * Personal AI Finance OS v12.9 Split Backend
 * File: BudgetGuardService.gs
 * Google Apps Script shares global scope across .gs files.
 *******************************************************/

function buildBudgetGuard_(summary, expenseSheet, startDate, endDate) {
  const alerts = [];
  const safeDailySpend = Number(summary.safeDailySpend) || 0;
  const availableAfterPlan = Number(summary.availableCashAfterPlan) || 0;
  const livingPct = Number(summary.livingBudgetUsedPercent) || 0;
  const livingRemaining = Number(summary.livingBudgetRemaining) || 0;
  const daysLeft = Math.max(1, Number(summary.daysLeft) || 1);

  const actualPayMother = Number(summary.actualPayMother) || 0;
  const plannedPayMother = Number(summary.plannedPayMother) || 0;
  const actualDebtBills = Number(summary.actualDebtBills) || 0;
  const plannedDebtBills = Number(summary.plannedDebtBills) || 0;

  // These categories are already tracked by Plan Progress.
  // Do not warn them again as "abnormal category spending", otherwise planned payments
  // such as Family / Medical-Pet / Debt-Bills look like overspending.
  const plannedBucketCategories = getPlannedBudgetGuardCategories_();

  if (availableAfterPlan < 0) {
    addBudgetAlertDedup_(alerts, makeBudgetAlert_(
      'critical',
      'แผนรอบนี้ติดลบ',
      'เงินหลังหักแผนหลักติดลบ ควรลด Living Budget หรือเลื่อนบางแผนก่อน',
      'plan_negative'
    ));
  } else if (safeDailySpend > 0 && safeDailySpend < 200) {
    addBudgetAlertDedup_(alerts, makeBudgetAlert_(
      'danger',
      'งบต่อวันต่ำมาก',
      `เหลือใช้ได้ประมาณ ${formatMoneyForText_(safeDailySpend)}/วัน ควรใช้เฉพาะรายจ่ายจำเป็น`,
      'daily_low'
    ));
  }

  // Living Budget already excludes Pay Mother and Debt/Bills categories.
  // This warning therefore represents flexible day-to-day spending only.
  if (livingPct >= 1) {
    addBudgetAlertDedup_(alerts, makeBudgetAlert_(
      'critical',
      'Living Budget เกินแผนแล้ว',
      `ใช้เกินแผน ${formatMoneyForText_(Math.abs(livingRemaining))} แล้ว ควรหยุดรายจ่ายไม่จำเป็น`,
      'living_over'
    ));
  } else if (livingPct >= 0.8) {
    addBudgetAlertDedup_(alerts, makeBudgetAlert_(
      'warning',
      'Living Budget ใกล้เต็ม',
      `ใช้ไป ${(livingPct * 100).toFixed(0)}% แล้ว แต่ยังเหลือ ${daysLeft} วัน`,
      'living_tight'
    ));
  }

  if (plannedDebtBills > 0 && actualDebtBills < plannedDebtBills) {
    const missing = plannedDebtBills - actualDebtBills;
    addBudgetAlertDedup_(alerts, makeBudgetAlert_(
      'info',
      'ยังมี Debt / Bills ที่ต้องกันเงิน',
      `ควรกันเงินไว้อีก ${formatMoneyForText_(missing)} ก่อนเพิ่มรายจ่ายอื่น`,
      'debt_missing'
    ));
  }

  if (plannedPayMother > 0 && actualPayMother < plannedPayMother) {
    const missing = plannedPayMother - actualPayMother;
    addBudgetAlertDedup_(alerts, makeBudgetAlert_(
      'info',
      'ยังมี Pay Mother / Family Plan ที่ต้องกันเงิน',
      `ควรกันเงินไว้อีก ${formatMoneyForText_(missing)} สำหรับแผนส่วนนี้`,
      'pay_mother_missing'
    ));
  }

  // Category overspending should only look at flexible/living categories,
  // not categories that are already represented as planned buckets.
  const categories = getExpenseCategoryTotalsForDateRange_(expenseSheet, startDate, endDate, 5, plannedBucketCategories);
  categories.forEach(cat => {
    if (cat.amount >= 3000 && cat.share >= 0.35) {
      addBudgetAlertDedup_(alerts, makeBudgetAlert_(
        'warning',
        `หมวด ${cat.category} ใช้สูงในงบใช้ชีวิต`,
        `ใช้ไป ${formatMoneyForText_(cat.amount)} คิดเป็น ${(cat.share * 100).toFixed(0)}% ของรายจ่ายที่ไม่ใช่แผนหลัก`,
        'category_' + normalizeBudgetCategoryKey_(cat.category)
      ));
    }
  });

  if (!alerts.length) {
    addBudgetAlertDedup_(alerts, makeBudgetAlert_(
      'success',
      'งบยังอยู่ในเกณฑ์ปลอดภัย',
      'ยังไม่พบสัญญาณงบใกล้แตกในรอบเงินเดือนนี้',
      'safe'
    ));
  }

  return alerts.slice(0, 6);
}

function getPlannedBudgetGuardCategories_() {
  return [
    'Family',
    'Medical/Pet',
    'Debt payment',
    'Utilities',
    'Phone/Internet',
    'Subscription',
    'Housing'
  ];
}

function normalizeBudgetCategoryKey_(value) {
  return cleanText_(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

function addBudgetAlertDedup_(alerts, alert) {
  if (!alert) return;
  const key = alert.key || `${alert.level}:${alert.title}`;
  if (alerts.some(item => (item.key || `${item.level}:${item.title}`) === key)) return;
  alerts.push(alert);
}

function makeBudgetAlert_(level, title, message, key) {
  return {
    level: level,
    title: title,
    message: message,
    key: key || '',
    createdAt: Utilities.formatDate(new Date(), APP_CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm')
  };
}

function getBudgetGuardLevel_(alerts) {
  alerts = Array.isArray(alerts) ? alerts : [];
  if (alerts.some(a => a.level === 'critical')) return 'critical';
  if (alerts.some(a => a.level === 'danger')) return 'danger';
  if (alerts.some(a => a.level === 'warning')) return 'warning';
  if (alerts.some(a => a.level === 'info')) return 'info';
  return 'success';
}

function buildBudgetGuardSummary_(alerts) {
  alerts = Array.isArray(alerts) ? alerts : [];
  const actionable = alerts.filter(a => a.level !== 'success');
  if (!actionable.length) return 'งบยังอยู่ในเกณฑ์ปลอดภัย ยังไม่พบสัญญาณงบใกล้แตก';

  const critical = actionable.filter(a => a.level === 'critical' || a.level === 'danger').length;
  const warning = actionable.filter(a => a.level === 'warning').length;
  const info = actionable.filter(a => a.level === 'info').length;

  const parts = [];
  if (critical) parts.push(`เสี่ยงสูง ${critical} เรื่อง`);
  if (warning) parts.push(`ควรระวัง ${warning} เรื่อง`);
  if (info) parts.push(`ต้องกันเงิน ${info} เรื่อง`);

  return `${parts.join(' • ')} — เปิดรายละเอียดเพื่อจัดการตามลำดับความสำคัญ`;
}

function getExpenseCategoryTotalsForDateRange_(sheet, startDate, endDate, limit, excludedCategories) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  const headerMap = getHeaderMap_(sheet);
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const totals = {};
  let grandTotal = 0;
  const excludedSet = new Set((excludedCategories || []).map(normalizeBudgetCategoryKey_));

  values.forEach(row => {
    const dateObj = normalizeDateValue_(getByHeader_(row, headerMap, 'Date'));
    if (!dateObj) return;
    if (dateObj.getTime() < startDate.getTime() || dateObj.getTime() > endDate.getTime()) return;

    const category = cleanText_(getByHeader_(row, headerMap, 'Category')) || 'Other';
    if (excludedSet.has(normalizeBudgetCategoryKey_(category))) return;

    const amount = Number(getByHeader_(row, headerMap, 'Amount')) || 0;
    if (amount <= 0) return;

    totals[category] = (totals[category] || 0) + amount;
    grandTotal += amount;
  });

  return Object.keys(totals)
    .map(category => ({
      category: category,
      amount: totals[category],
      share: grandTotal > 0 ? totals[category] / grandTotal : 0
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, Number(limit) || 8);
}

/*******************************************************
 * Phase 4.3 - Edit / Delete Transactions
 *******************************************************/
