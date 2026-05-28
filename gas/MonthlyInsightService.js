/*******************************************************
 * Personal AI Finance OS v12.9 Split Backend
 * File: MonthlyInsightService.gs
 * Google Apps Script shares global scope across .gs files.
 *******************************************************/

function buildMonthlyPatternInsight_(summary, historyRows, expenseSheet, startDate, endDate) {
  const history = Array.isArray(historyRows) ? historyRows.filter(Boolean) : [];
  const categories = getExpenseCategoryTotalsForDateRange_(expenseSheet, startDate, endDate, 5, getPlannedBudgetGuardCategories_());
  const topCategory = categories.length ? categories[0] : null;

  const insight = {
    title: 'Monthly Pattern Insight',
    trend: 'Need 2 Cycles',
    summary: 'ต้อง Archive Cycle อย่างน้อย 2 รอบเพื่อวิเคราะห์แนวโน้มรายเดือนให้แม่นขึ้น',
    fcfChange: 0,
    expenseChange: 0,
    topCategory: topCategory,
    notes: []
  };

  if (topCategory) {
    insight.notes.push(`รายจ่ายสูงสุดรอบนี้คือ ${topCategory.category} ${formatMoneyForText_(topCategory.amount)}`);
  }

  if (history.length >= 2) {
    const latest = history[0];
    const previous = history[1];
    const latestFcf = Number(latest.fcf) || 0;
    const previousFcf = Number(previous.fcf) || 0;
    const latestExpense = Number(latest.expense) || 0;
    const previousExpense = Number(previous.expense) || 0;

    insight.fcfChange = latestFcf - previousFcf;
    insight.expenseChange = latestExpense - previousExpense;

    if (insight.fcfChange > 1000 && insight.expenseChange <= 0) {
      insight.trend = 'Improving';
      insight.title = 'พฤติกรรมการเงินดีขึ้น';
      insight.summary = `FCF ดีขึ้น ${formatMoneyForText_(insight.fcfChange)} และรายจ่ายไม่ได้เพิ่มจากรอบก่อน`;
    } else if (insight.fcfChange < -1000 || insight.expenseChange > 1000) {
      insight.trend = 'Declining';
      insight.title = 'รายจ่ายเริ่มกดดันแผน';
      insight.summary = `FCF เปลี่ยน ${formatMoneyForText_(insight.fcfChange)} และรายจ่ายเปลี่ยน ${formatMoneyForText_(insight.expenseChange)} จากรอบก่อน`;
    } else {
      insight.trend = 'Stable';
      insight.title = 'พฤติกรรมการเงินค่อนข้างนิ่ง';
      insight.summary = `FCF และรายจ่ายใกล้เคียงรอบก่อน ยังควบคุมได้`;
    }
  } else {
    insight.trend = 'Current Cycle';
    if (Number(summary.livingBudgetUsedPercent) > 0) {
      insight.summary = `รอบนี้ใช้ Living Budget ไป ${(Number(summary.livingBudgetUsedPercent) * 100).toFixed(0)}% • ยังต้องมีประวัติ 2 รอบเพื่อดูแนวโน้ม`;
    } else {
      insight.summary = 'มีข้อมูลรอบปัจจุบัน แต่ยังต้อง Archive อย่างน้อย 2 รอบเพื่อวิเคราะห์แนวโน้ม';
    }
  }

  if (Number(summary.savingsProgress) >= 1) insight.notes.push('ออมครบตามแผนในรอบนี้');
  if (Number(summary.livingBudgetUsedPercent) >= 1) insight.notes.push('Living Budget เกินแผน ควรปรับงบหรือจำกัดรายจ่ายไม่จำเป็น');
  if (Number(summary.safeDailySpend) < 300) insight.notes.push('งบใช้ต่อวันต่ำ ควรวางแผนรายวันจนจบรอบเงินเดือน');

  return insight;
}
