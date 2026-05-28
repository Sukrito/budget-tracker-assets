/*******************************************************
 * Personal AI Finance OS v12.9 Split Backend
 * File: HolidayPayCycleService.gs
 * Google Apps Script shares global scope across .gs files.
 *******************************************************/

function updateHolidaysAndPayCycles() {
  updateThailandHolidays();
  updatePayCycles();
}

function updateThailandHolidays() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getOrCreateSheet_(ss, APP_CONFIG.SHEET_HOLIDAYS);

  const currentYear = Number(Utilities.formatDate(new Date(), APP_CONFIG.TIMEZONE, 'yyyy'));
  const startYear = currentYear;
  const endYear = currentYear + 5;

  const rows = [['Date', 'Holiday Name', 'Source']];
  const errors = [];

  for (let year = startYear; year <= endYear; year++) {
    const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/TH`;

    try {
      const response = UrlFetchApp.fetch(url, {
        muteHttpExceptions: true,
        followRedirects: true,
        headers: { 'Accept': 'application/json', 'User-Agent': 'GoogleAppsScript-FinanceOS' }
      });

      const code = response.getResponseCode();
      const body = response.getContentText();

      if (code !== 200 || !body) {
        errors.push(`Nager.Date ${year}: HTTP ${code}`);
        appendFallbackThaiHolidays_(rows, year);
        continue;
      }

      const holidays = JSON.parse(body);
      if (!Array.isArray(holidays) || holidays.length === 0) {
        errors.push(`Nager.Date ${year}: empty response`);
        appendFallbackThaiHolidays_(rows, year);
        continue;
      }

      holidays.forEach(h => rows.push([parseLocalDate_(h.date), h.localName || h.name || '', `Nager.Date ${year}`]));

    } catch (err) {
      errors.push(`Nager.Date ${year}: ${err.message || err}`);
      appendFallbackThaiHolidays_(rows, year);
    }
  }

  const seen = new Set();
  const uniqueRows = [rows[0]];
  for (let i = 1; i < rows.length; i++) {
    const dateKey = Utilities.formatDate(rows[i][0], APP_CONFIG.TIMEZONE, 'yyyy-MM-dd');
    const name = rows[i][1];
    const key = `${dateKey}|${name}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueRows.push(rows[i]);
    }
  }

  sheet.clearContents();
  sheet.getRange(1, 1, uniqueRows.length, 3).setValues(uniqueRows);
  sheet.getRange('A:A').setNumberFormat('yyyy-mm-dd');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, 3);
  SpreadsheetApp.flush();

  SpreadsheetApp.getUi().alert(
    `อัปเดต Holidays แล้ว: ${startYear}-${endYear}\nจำนวนวันหยุด: ${uniqueRows.length - 1}` +
    (errors.length ? `\n\nมีบางปีใช้ fallback:\n${errors.join('\n')}` : '')
  );
}

function appendFallbackThaiHolidays_(rows, year) {
  const fixed = [
    ['01-01', "New Year's Day"],
    ['04-06', 'Chakri Memorial Day'],
    ['04-13', 'Songkran Festival'],
    ['04-14', 'Songkran Festival'],
    ['04-15', 'Songkran Festival'],
    ['05-01', 'National Labour Day'],
    ['05-04', 'Coronation Day'],
    ['06-03', "H.M. Queen Suthida's Birthday"],
    ['07-28', "H.M. King Vajiralongkorn's Birthday"],
    ['08-12', "H.M. Queen Sirikit The Queen Mother's Birthday"],
    ['10-13', 'H.M. King Bhumibol Adulyadej Memorial Day'],
    ['10-23', 'Chulalongkorn Memorial Day'],
    ['12-05', "H.M. King Bhumibol Adulyadej's Birthday / National Day / Father's Day"],
    ['12-10', 'Constitution Day'],
    ['12-31', "New Year's Eve"],
  ];

  fixed.forEach(item => rows.push([parseLocalDate_(`${year}-${item[0]}`), item[1], `Fallback ${year}`]));

  if (year === 2026) {
    [
      ['2026-01-02', 'Additional special holiday'],
      ['2026-03-03', 'Makha Bucha Day'],
      ['2026-06-01', 'Substitution for Visakha Bucha Day'],
      ['2026-07-29', 'Asalha Bucha Day'],
      ['2026-07-30', 'Buddhist Lent Day / Khao Phansa'],
      ['2026-12-07', "Substitution for H.M. King Bhumibol Adulyadej's Birthday"],
    ].forEach(item => rows.push([parseLocalDate_(item[0]), item[1], 'Fallback 2026']));
  }
}

function updatePayCycles() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const paySheet = getOrCreateSheet_(ss, APP_CONFIG.SHEET_PAY_CYCLES);
  const holidaySheet = getOrCreateSheet_(ss, APP_CONFIG.SHEET_HOLIDAYS);
  const overrideSheet = getOrCreateSheet_(ss, APP_CONFIG.SHEET_PAY_OVERRIDES);

  const currentYear = Number(Utilities.formatDate(new Date(), APP_CONFIG.TIMEZONE, 'yyyy'));
  const startYear = currentYear;
  const endYear = currentYear + 5;

  const holidayDates = getHolidayDateSet_(holidaySheet);
  const overrides = getPayCycleOverrides_(overrideSheet);
  const rows = [['Month', 'Pay Date', 'Cycle End', 'Source']];
  const months = [];

  for (let year = startYear; year <= endYear; year++) {
    for (let month = 0; month < 12; month++) months.push(new Date(year, month, 1));
  }

  const payDates = months.map(monthDate => {
    const monthKey = formatMonthKey_(monthDate);
    if (overrides[monthKey]) return { month: monthDate, payDate: overrides[monthKey], source: 'Override' };
    return { month: monthDate, payDate: getFourthBusinessDayBeforeMonthEnd_(monthDate, holidayDates), source: 'Formula: 4th business day before month end' };
  });

  for (let i = 0; i < payDates.length; i++) {
    rows.push([payDates[i].month, payDates[i].payDate, payDates[i + 1] ? addDays_(payDates[i + 1].payDate, -1) : '', payDates[i].source]);
  }

  paySheet.clearContents();
  paySheet.getRange(1, 1, rows.length, 4).setValues(rows);
  paySheet.getRange('A:C').setNumberFormat('yyyy-mm-dd');
  paySheet.setFrozenRows(1);
  paySheet.autoResizeColumns(1, 4);
  SpreadsheetApp.flush();
  SpreadsheetApp.getUi().alert(`อัปเดต Pay Cycles แล้ว: ${startYear}-${endYear}\nจำนวนแถวทั้งหมด: ${rows.length - 1}`);
}

function getFourthBusinessDayBeforeMonthEnd_(monthDate, holidayDates) {
  let d = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  let businessDaysFound = 0;

  while (businessDaysFound < 4) {
    if (isBusinessDay_(d, holidayDates)) {
      businessDaysFound++;
      if (businessDaysFound === 4) return new Date(d);
    }
    d = addDays_(d, -1);
  }

  return d;
}

function isBusinessDay_(date, holidayDates) {
  const day = date.getDay();
  if (day === 0 || day === 6) return false;
  return !holidayDates.has(formatDateKey_(date));
}

function getHolidayDateSet_(holidaySheet) {
  const values = holidaySheet.getDataRange().getValues();
  const set = new Set();
  for (let i = 1; i < values.length; i++) {
    const date = values[i][0];
    if (date instanceof Date) set.add(formatDateKey_(date));
  }
  return set;
}

function getPayCycleOverrides_(overrideSheet) {
  ensureOverrideHeader_(overrideSheet);
  const values = overrideSheet.getDataRange().getValues();
  const overrides = {};

  for (let i = 1; i < values.length; i++) {
    const month = values[i][0];
    const payDate = values[i][1];
    if (month instanceof Date && payDate instanceof Date) overrides[formatMonthKey_(month)] = payDate;
  }

  return overrides;
}

function ensureOverrideHeader_(sheet) {
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, 3).setValues([['Month', 'Pay Date', 'Note']]);
}

function createFinanceOSTriggers() {
  deleteFinanceOSTriggers();
  ScriptApp.newTrigger('updateHolidaysAndPayCycles')
    .timeBased()
    .onMonthDay(1)
    .atHour(6)
    .nearMinute(0)
    .create();
  SpreadsheetApp.getUi().alert('สร้าง Auto Update Trigger แล้ว');
}

function deleteFinanceOSTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'updateHolidaysAndPayCycles') ScriptApp.deleteTrigger(trigger);
  });
}
