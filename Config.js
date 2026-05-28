/*******************************************************
 * Personal AI Finance OS v12.9 Split Backend
 * File: Config.gs
 * Google Apps Script shares global scope across .gs files.
 *******************************************************/

/*******************************************************
 * Personal AI Finance OS - Google Apps Script Backend v12.9
 * Supports: Income, Expenses, Savings, Investments + Phase 4 App Upgrade
 * Phase 4 includes: Budget Guard, Edit/Delete Transactions, Monthly Pattern Insight
 * Phase 4.6 UI Polish: mobile-first dashboard payload compatible with SaaS-style UX
 *
 * v12.7: Recent_Index + Fast Dashboard Cache
 * v12.7.1: System Check hotfix
 * v12.8: System Check polish + clearer key/cache/recent diagnostics
 * v12.9: Project cleanup + versioning + changelog
 *
 * GitHub Pages frontend:
 * - index.html
 * - styles.css
 * - script.js
 *******************************************************/


const APP_META = {
  NAME: 'Personal AI Finance OS',
  BACKEND_VERSION: '12.9.0',
  BACKEND_LABEL: 'v12.9 Project Cleanup + Versioning + Changelog',
  FRONTEND_EXPECTED_VERSION: '12.9.0',
  RELEASE_DATE: '2026-05-27',
  BUILD_CHANNEL: 'GitHub Pages + Apps Script',
};

const APP_CONFIG = {
  SHEET_INCOME: 'Income',
  SHEET_EXPENSES: 'Expenses',
  SHEET_SAVINGS: 'Savings',
  SHEET_INVESTMENTS: 'Investments',
  SHEET_GOALS: 'Goals',
  SHEET_ACCOUNTS: 'Accounts',
  SHEET_PLANS: 'Plans',
  SHEET_SETTINGS: 'Settings',
  SHEET_PAY_CYCLES: 'Pay_Cycles',
  SHEET_HOLIDAYS: 'Holidays',
  SHEET_PAY_OVERRIDES: 'Pay_Cycle_Overrides',
  SHEET_CYCLE_HISTORY: 'Cycle_History',
  SHEET_PLAN_CHANGE_LOG: 'Plan_Change_Log',
  SHEET_RECENT_INDEX: 'Recent_Index',
  SHEET_DASHBOARD_CACHE: 'Dashboard_Cache',
  TIMEZONE: 'Asia/Bangkok',
};

const INCOME_HEADERS = [
  'Date', 'Source', 'Category', 'Amount', 'Recurring?', 'Note', 'Month', 'Created At'
];

const EXPENSE_HEADERS = [
  'Date', 'Category', 'Item', 'Amount', 'Payment Method', 'Essential?', 'Note', 'Month', 'Created At'
];

const SAVINGS_HEADERS = [
  'Date', 'Account / Bucket', 'Goal Name', 'Deposit', 'Withdrawal', 'Balance', 'Note', 'Month', 'Created At'
];

const INVESTMENT_HEADERS = [
  'Date', 'Asset Type', 'Asset Name', 'Action', 'Amount', 'Quantity', 'Price', 'Note', 'Month', 'Created At'
];

const ACCOUNT_HEADERS = [
  'Date', 'Account', 'Type', 'Opening Balance', 'Current Balance', 'Note'
];

const PLAN_HEADERS = [
  'Pay Cycle Start', 'Pay Cycle End', 'Expected Income', 'Pay Mother Plan', 'Debt / Bills Plan', 'Savings Plan', 'Living Budget', 'Expected Buffer', 'Main Goal', 'Note'
];


const CYCLE_HISTORY_HEADERS = [
  'Archived At',
  'Pay Cycle Start',
  'Pay Cycle End',
  'Income',
  'Expense',
  'Savings',
  'Investments',
  'Actual FCF',
  'Expected Buffer',
  'Plan Flex',
  'Available Cash After Plan',
  'Safe Daily Spend',
  'Emergency Fund Current',
  'Emergency Fund Progress',
  'Result',
  'Status',
  'Recommendation',
  'Note'
];


const PLAN_CHANGE_LOG_HEADERS = [
  'Changed At',
  'Pay Cycle Start',
  'Pay Cycle End',
  'Expected Income Before',
  'Expected Income After',
  'Pay Mother Before',
  'Pay Mother After',
  'Debt / Bills Before',
  'Debt / Bills After',
  'Savings Before',
  'Savings After',
  'Living Budget Before',
  'Living Budget After',
  'Expected Buffer Before',
  'Expected Buffer After',
  'Main Goal Before',
  'Main Goal After',
  'Note Before',
  'Note After',
  'Source'
];

const SETTINGS_HEADERS = [
  'Income Categories', 'Expense Categories', 'Payment Methods', 'Debt Types', 'Goal Types', 'Priority', 'Investment Assets', 'Status'
];

const DEFAULT_SETTINGS = {
  income: ['Salary', 'Side income', 'Research/Project', 'Gift', 'Interest', 'Refund', 'Other'],
  expense: ['Food', 'Transport', 'Family', 'Medical/Pet', 'Housing', 'Utilities', 'Phone/Internet', 'Education', 'Work/Project', 'AI/API/Cloud', 'Game/Entertainment', 'Shopping', 'Subscription', 'Debt payment', 'Other'],
  paymentMethods: ['Bank transfer', 'Cash', 'PromptPay', 'Credit card', 'Debit card', 'E-wallet', 'Other'],
  debtTypes: ['Credit card', 'Personal loan', 'Installment', 'Family loan', 'BNPL', 'Other'],
  goalTypes: ['Emergency fund', 'Short-term', 'Long-term', 'Investment', 'Skill/Project', 'AI/Cloud', 'Other'],
  priority: ['Critical', 'High', 'Medium', 'Low'],
  investmentAssets: ['Cash', 'Money Market', 'Fund/ETF', 'Thai Stock', 'US Stock', 'Gold', 'XAU/USD', 'Crypto'],
  status: ['Active', 'Planned', 'Paid', 'Unpaid', 'Paused', 'Completed', 'Review'],
};


/*******************************************************
 * GitHub Pages API Security
 *
 * ตั้งรหัสลับที่:
 * Apps Script > Project Settings > Script properties
 *
 * Recommended properties:
 * FINANCE_OS_API_SECRET
 * FINANCE_OS_READ_SECRET
 * FINANCE_OS_WRITE_SECRET
 * FINANCE_OS_ADMIN_SECRET
 *
 * ค่าแต่ละตัวสามารถใช้รหัสเดียวกันได้ในช่วงใช้งานส่วนตัว
 * แต่ถ้าต้องการแยกสิทธิ์จริง ให้ใช้คนละรหัส:
 * - READ_SECRET: ดู Dashboard / Recent / System Check
 * - WRITE_SECRET: เพิ่ม/แก้รายการ และแก้ Plan
 * - ADMIN_SECRET: ลบรายการ, Archive, Clear Cache, Rebuild Recent
 *
 * ไม่ควรเก็บรหัสจริงไว้ใน GitHub หรือ script.js
 *******************************************************/
const API_SECURITY = {
  ENABLED: true,

  // Legacy key: keeps the current GitHub Pages frontend working.
  // If only this property exists, it can read/write/admin.
  SECRET_PROPERTY: 'FINANCE_OS_API_SECRET',

  // Optional split keys for stronger control.
  // Set these later if you want separate keys per permission level.
  READ_SECRET_PROPERTY: 'FINANCE_OS_READ_SECRET',
  WRITE_SECRET_PROPERTY: 'FINANCE_OS_WRITE_SECRET',
  ADMIN_SECRET_PROPERTY: 'FINANCE_OS_ADMIN_SECRET',

  LOG_SHEET: 'ApiLogs',
  PUBLIC_ACTIONS: ['health'],
  WRITE_ACTIONS: ['recordTransaction', 'updateCurrentPlan'],
  ADMIN_ACTIONS: ['archiveCurrentCycle', 'updateTransaction', 'deleteTransaction', 'resetFinanceCache', 'rebuildRecentIndex'],

  SUMMARY_CACHE_KEY: 'finance_summary_v12_9',
  SUMMARY_CACHE_SECONDS: 300,
  RECENT_SCAN_LIMIT: 0, // 0 = scan all used rows for correctness; set 500/1000 later if sheets get huge
};

const API_LOG_HEADERS = [
  'Timestamp', 'Action', 'Method', 'Status', 'Message', 'User Agent', 'Source'
];

const RECENT_INDEX_HEADERS = [
  'Created Time', 'Tx Time', 'Global Order', 'Transaction ID', 'Type', 'Row Number', 'Date',
  'Category', 'Item', 'Source', 'Action', 'Payment Method', 'Essential',
  'Amount', 'Quantity', 'Price', 'Note'
];

const DASHBOARD_CACHE_HEADERS = ['Cache Key', 'Cached At', 'Expires At', 'Payload JSON'];
