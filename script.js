


  // GitHub Pages migration:
  // 1) Deploy Code.gs as Web App.
  // 2) Paste the /exec URL below. v12.9 Cleanup: Versioning + Changelog + project structure
  const APPS_SCRIPT_API_URL = 'https://script.google.com/macros/s/AKfycbxvNT8KxDzW8jM6j_JrBqEdJKdAERZrrAtG6ICnx4pEytxiBRAkql5RXTLco7hscxqb/exec';

  const APP_FRONTEND_VERSION = '12.9.0';
  const APP_RELEASE_LABEL = 'v12.9 Project Cleanup + Versioning + Changelog';

  const FINANCE_OS_API_KEY_STORAGE = 'finance_os_session_secret_v12_9';

  function getStoredApiKey_() {
    try { return sessionStorage.getItem(FINANCE_OS_API_KEY_STORAGE) || ''; } catch (e) { return ''; }
  }

  function getApiKey_() {
    let key = getStoredApiKey_();

    if (!key) {
      key = window.prompt('ใส่รหัสเข้าใช้งาน Personal AI Finance OS') || '';
      key = key.trim();
      if (!key) throw new Error('ยังไม่ได้ใส่รหัสเข้าใช้งาน');
      try { sessionStorage.setItem(FINANCE_OS_API_KEY_STORAGE, key); } catch (e) {}
    }

    return key;
  }

  function resetApiKey() {
    try { sessionStorage.removeItem(FINANCE_OS_API_KEY_STORAGE); } catch (e) {}
    try { localStorage.removeItem('finance_os_api_secret_v1'); } catch (e) {}
    showToast('ล็อกแอปแล้ว กรุณา Login ใหม่อีกครั้ง', 'success');
    setTimeout(() => window.location.reload(), 500);
  }

  function logoutFinanceOS() {
    resetApiKey();
  }

  function assertApiUrl_() {
    if (!APPS_SCRIPT_API_URL || APPS_SCRIPT_API_URL.indexOf('PASTE_YOUR') !== -1) {
      throw new Error('ยังไม่ได้ตั้งค่า APPS_SCRIPT_API_URL ใน script.js');
    }
  }

  function handleApiPayload_(payload, action) {
    if (payload && payload.status === 'error') {
      const msg = payload.message || payload.error || `API ${action} error`;
      if (/unauthorized|forbidden|secret|รหัส/i.test(msg)) {
        try { localStorage.removeItem(FINANCE_OS_API_KEY_STORAGE); } catch (e) {}
      }
      throw new Error(msg);
    }
    return payload;
  }

  function buildApiUrl_(action, params) {
    assertApiUrl_();
    const url = new URL(APPS_SCRIPT_API_URL);
    url.searchParams.set('action', action);
    url.searchParams.set('key', getApiKey_());
    Object.keys(params || {}).forEach(key => {
      if (params[key] !== undefined && params[key] !== null) url.searchParams.set(key, params[key]);
    });
    return url.toString();
  }

  async function apiGet_(action, params) {
    const res = await fetch(buildApiUrl_(action, params), {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store'
    });
    if (!res.ok) throw new Error(`API GET ${action} failed: ${res.status}`);
    const payload = await res.json();
    return handleApiPayload_(payload, action);
  }

  async function apiPost_(action, data) {
    assertApiUrl_();
    const res = await fetch(APPS_SCRIPT_API_URL, {
      method: 'POST',
      redirect: 'follow',
      cache: 'no-store',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, data, key: getApiKey_() })
    });
    if (!res.ok) throw new Error(`API POST ${action} failed: ${res.status}`);
    const payload = await res.json();
    return handleApiPayload_(payload, action);
  }

  const PAGE_TITLES = {
    dashboard: 'Phase 4.5 • Dashboard Fast Cache',
    add: 'Phase 4.5 • Add + Recent Index',
    plan: 'Phase 4.5 • Plan Polish',
    history: 'Phase 4.5 • History Insight',
    settings: 'Phase 4.5 • More & Settings'
  };

  function showPage(page) {
    const target = page || 'dashboard';
    document.querySelectorAll('.app-page').forEach(el => {
      el.classList.toggle('active', el.dataset.page === target);
    });
    document.querySelectorAll('.bottom-nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.nav === target);
    });
    const subtitle = document.getElementById('page-subtitle');
    if (subtitle) subtitle.textContent = PAGE_TITLES[target] || PAGE_TITLES.dashboard;
    if (target === 'add') loadAddTransactionQuickData_();
    if (target === 'history') loadCycleHistoryLazy_();
    if (target === 'settings') ensureSettingsToolsPanel_();
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, 0); }
  }

  let systemCategories = {
    Income: [],
    Expenses: [],
    Savings: [],
    Investments: [],
    savingsGoals: [],
    savingsActions: ['Deposit', 'Withdrawal'],
    investmentActions: ['Buy', 'DCA', 'Sell', 'Withdraw', 'Dividend', 'Fee']
  };

  let IS_SUBMITTING = false;
  let TOAST_TIMER = null;
  let ADD_DATE_LOCKED = false;
  const DATE_LOCK_KEY = 'finance_os_add_date_lock';
  const DATE_LOCK_VALUE_KEY = 'finance_os_add_date_value';
  let ADD_QUICK_DATA_LOADED = false;

  const TYPE_STYLES = {
    Income: 'tx-type-label type-option border rounded-xl p-3 text-center cursor-pointer block border-emerald-500 bg-emerald-50/40 text-emerald-700 font-semibold shadow-sm ring-1 ring-emerald-100 transition active:scale-95',
    Expenses: 'tx-type-label type-option border rounded-xl p-3 text-center cursor-pointer block border-rose-500 bg-rose-50/40 text-rose-700 font-semibold shadow-sm ring-1 ring-rose-100 transition active:scale-95',
    Savings: 'tx-type-label type-option border rounded-xl p-3 text-center cursor-pointer block border-sky-500 bg-sky-50/40 text-sky-700 font-semibold shadow-sm ring-1 ring-sky-100 transition active:scale-95',
    Investments: 'tx-type-label type-option border rounded-xl p-3 text-center cursor-pointer block border-violet-500 bg-violet-50/40 text-violet-700 font-semibold shadow-sm ring-1 ring-violet-100 transition active:scale-95'
  };

  const CLASS_INACTIVE = 'tx-type-label type-option border rounded-xl p-3 text-center cursor-pointer block border-slate-200 text-slate-600 bg-white/70 shadow-sm transition active:scale-95';

  function setDefaultAddType_() {
    const selected = document.querySelector('input[name="type"]:checked');
    if (!selected) {
      const expense = document.querySelector('input[name="type"][value="Expenses"]');
      if (expense) expense.checked = true;
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    setDefaultAddType_();
    setupAddDateLock_();
    setupPlanEditorListeners_();
    showPage('dashboard');
    refreshAll();
  });

  function refreshAll() {
    setRefreshState(true);
    // Performance v12.5: load only dashboard-critical data on first refresh.
    // Categories/recent are lazy-loaded when opening Add/History.
    loadFinancialStatus(() => setRefreshState(false));
  }

  function refreshEverything() {
    setRefreshState(true);
    loadCategories();
    loadFinancialStatus(() => setRefreshState(false));
    loadRecentTransactions();
  }

  function loadCycleHistoryLazy_() {
    // Cycle history is already embedded in financial summary. This function is a safe hook for future split endpoints.
    return true;
  }

  function ensureSettingsToolsPanel_() {
    const page = document.querySelector('.app-page[data-page="settings"]') || document.getElementById('page-settings');
    if (!page || document.getElementById('system-check-panel')) return;

    const panel = document.createElement('section');
    panel.id = 'system-check-panel';
    panel.className = 'bg-white rounded-2xl shadow-sm border border-slate-100 p-4 mt-4 space-y-3';
    panel.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div>
          <h2 class="text-base font-bold text-slate-900">System Check</h2>
          <p class="text-xs text-slate-500 mt-1">ตรวจ API, Login, Headers, Recent_Index และ Cache</p>
        </div>
        <span id="system-check-badge" class="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">Ready</span>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <button type="button" onclick="runSystemCheck()" class="rounded-xl bg-slate-900 text-white py-2.5 text-sm font-medium active:scale-95 transition">Run Check</button>
        <button type="button" onclick="resetApiKey()" class="rounded-xl bg-amber-50 text-amber-700 border border-amber-100 py-2.5 text-sm font-medium active:scale-95 transition">Lock App</button>
        <button type="button" onclick="resetFinanceCache()" class="rounded-xl bg-sky-50 text-sky-700 border border-sky-100 py-2.5 text-sm font-medium active:scale-95 transition">Clear Cache</button>
        <button type="button" onclick="rebuildRecentIndex()" class="rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-100 py-2.5 text-sm font-medium active:scale-95 transition">Rebuild Recent</button>
        <button type="button" onclick="refreshEverything()" class="rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 py-2.5 text-sm font-medium active:scale-95 transition col-span-2">Full Refresh</button>
      </div>
      <div id="system-check-result" class="rounded-xl bg-slate-50 border border-slate-100 p-3 text-xs text-slate-500 whitespace-pre-wrap">ยังไม่ได้ตรวจระบบ</div>
    `;
    page.appendChild(panel);
  }

  async function runSystemCheck() {
    const result = document.getElementById('system-check-result');
    const badge = document.getElementById('system-check-badge');
    if (result) result.textContent = 'กำลังตรวจระบบ...';
    if (badge) {
      badge.textContent = 'Checking';
      badge.className = 'text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-600';
    }

    try {
      const report = await apiGet_('systemCheck');
      renderSystemCheckReport_(report);
    } catch (err) {
      if (badge) {
        badge.textContent = 'Error';
        badge.className = 'text-xs px-2.5 py-1 rounded-full bg-rose-100 text-rose-700';
      }
      if (result) result.textContent = 'System Check ล้มเหลว: ' + (err.message || err);
    }
  }

  function renderSystemCheckReport_(report) {
    report = report || {};
    const result = document.getElementById('system-check-result');
    const badge = document.getElementById('system-check-badge');
    const status = report.status || 'unknown';

    if (badge) {
      if (status === 'success') {
        badge.textContent = 'OK';
        badge.className = 'text-xs px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700';
      } else if (status === 'warning') {
        badge.textContent = 'Warning';
        badge.className = 'text-xs px-2.5 py-1 rounded-full bg-amber-100 text-amber-700';
      } else {
        badge.textContent = 'Error';
        badge.className = 'text-xs px-2.5 py-1 rounded-full bg-rose-100 text-rose-700';
      }
    }

    const api = report.api || {};
    const cache = report.cache || {};
    const recent = report.recent || {};
    const hasSessionKey = !!getStoredApiKey_();

    const keyLine = (label, effective, configured) => {
      if (configured) return `- ${label}: OK`;
      if (effective) return `- ${label}: OK (fallback)`;
      return `- ${label}: Missing`;
    };

    const sheetLines = (report.sheets || []).map(s => {
      const ok = !!(s.headerOk || s.headersOk);
      const mark = s.exists && ok ? '✅' : s.exists ? '⚠️' : '❌';
      const msg = s.message && s.message !== 'OK' ? ' • ' + s.message : '';
      return `${mark} ${s.name}: ${s.rows || 0} rows${msg}${s.missingHeaders && s.missingHeaders.length ? ' | headers: ' + s.missingHeaders.join(', ') : ''}`;
    });

    const lines = [
      `Status: ${status}`,
      `Checked: ${report.checkedAt || '-'}`,
      `Elapsed: ${report.elapsedMs || '-'} ms`,
      '',
      'Version:',
      `- Frontend: ${APP_FRONTEND_VERSION}`,
      `- Backend: ${(report.version && report.version.backendVersion) || '-'}`,
      `- Release: ${(report.version && report.version.backendLabel) || APP_RELEASE_LABEL}`,
      '',
      'Login:',
      `- Session: ${hasSessionKey ? 'Logged in' : 'Not logged in'}`,
      '',
      'API:',
      `- Security: ${api.security || '-'}`,
      `- Split keys: ${api.splitMode ? 'Enabled' : api.fallbackMode ? 'Using FINANCE_OS_API_SECRET fallback' : 'Not configured'}`,
      keyLine('Read', api.readKeyEffective, api.readKeyConfigured),
      keyLine('Write', api.writeKeyEffective, api.writeKeyConfigured),
      keyLine('Admin', api.adminKeyEffective, api.adminKeyConfigured),
      '',
      'Cache:',
      `- Script Cache: ${cache.scriptCache || '-'}`,
      `- Dashboard_Cache: ${cache.dashboardCacheSheet || '-'} (${cache.dashboardCacheRows || 0} rows)`,
      `- Cached at: ${cache.dashboardCachedAt || '-'}`,
      `- Expires at: ${cache.dashboardExpiresAt || '-'}`,
      `- TTL: ${api.cacheSeconds || '-'} sec`,
      '',
      'Recent_Index:',
      `- Status: ${recent.status || '-'}`,
      `- Count: ${recent.count || 0}`,
      `- Last tx date: ${recent.lastTxDate || '-'}`,
      `- Last created: ${recent.lastCreatedTime || '-'}`,
      '',
      'Sheets:',
      ...sheetLines,
      '',
      'Warnings:',
      ...((report.warnings || []).length ? report.warnings.map(x => '- ' + x) : ['- ไม่มี']),
      '',
      'Errors:',
      ...((report.errors || []).length ? report.errors.map(x => '- ' + x) : ['- ไม่มี'])
    ];

    if (result) result.textContent = lines.join('\n');
  }

  async function resetFinanceCache() {
    try {
      const res = await apiPost_('resetFinanceCache', {});
      showToast((res && res.message) || 'ล้าง cache แล้ว', 'success');
      refreshAll();
    } catch (err) {
      showToast('ล้าง cache ไม่สำเร็จ: ' + (err.message || err), 'error');
    }
  }


  async function rebuildRecentIndex() {
    try {
      const res = await apiPost_('rebuildRecentIndex', { limit: 200 });
      showToast((res && res.message) || 'สร้าง Recent_Index ใหม่แล้ว', 'success');
      ADD_QUICK_DATA_LOADED = false;
      loadRecentTransactions();
      runSystemCheck();
    } catch (err) {
      showToast('สร้าง Recent_Index ไม่สำเร็จ: ' + (err.message || err), 'error');
    }
  }

  function getTodayLocalDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function setupAddDateLock_() {
    const dateInput = document.getElementById('txtDate');
    const lockToggle = document.getElementById('dateLockToggle');
    const savedLock = localStorage.getItem(DATE_LOCK_KEY) === '1';
    const savedDate = localStorage.getItem(DATE_LOCK_VALUE_KEY);

    ADD_DATE_LOCKED = savedLock;
    if (lockToggle) lockToggle.checked = savedLock;
    if (dateInput) {
      dateInput.value = savedLock && savedDate ? savedDate : getTodayLocalDateString();
      dateInput.addEventListener('change', () => {
        if (ADD_DATE_LOCKED && dateInput.value) localStorage.setItem(DATE_LOCK_VALUE_KEY, dateInput.value);
        updateDateLockHint_();
      });
    }
    updateDateLockHint_();
  }

  function toggleDateLock(checked) {
    ADD_DATE_LOCKED = !!checked;
    localStorage.setItem(DATE_LOCK_KEY, ADD_DATE_LOCKED ? '1' : '0');
    const dateInput = document.getElementById('txtDate');
    if (ADD_DATE_LOCKED && dateInput && dateInput.value) {
      localStorage.setItem(DATE_LOCK_VALUE_KEY, dateInput.value);
      showToast('ตรึงวันที่แล้ว: รายการถัดไปจะใช้วันที่เดิม', 'success', 2200);
    } else {
      showToast('ปิดการตรึงวันที่แล้ว', 'success', 2000);
    }
    updateDateLockHint_();
  }

  function setAddDateToday() {
    const dateInput = document.getElementById('txtDate');
    if (!dateInput) return;
    dateInput.value = getTodayLocalDateString();
    if (ADD_DATE_LOCKED) localStorage.setItem(DATE_LOCK_VALUE_KEY, dateInput.value);
    updateDateLockHint_();
  }

  function updateDateLockHint_() {
    const hint = document.getElementById('dateLockHint');
    const dateInput = document.getElementById('txtDate');
    if (!hint) return;
    const dateText = dateInput && dateInput.value ? dateInput.value : '-';
    hint.textContent = ADD_DATE_LOCKED
      ? `ล็อกวันที่: รายการถัดไปจะใช้ ${dateText}`
      : 'หลังบันทึก: กลับเป็นวันที่วันนี้';
    hint.className = ADD_DATE_LOCKED ? 'text-[11px] text-indigo-500 mt-1' : 'text-[11px] text-slate-400 mt-1';
  }

  function formatMoney(value) {
    const n = Number(value) || 0;
    return n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' ฿';
  }

  function formatMoneyDetailed(value) {
    const n = Number(value) || 0;
    return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ฿';
  }

  function formatPlanInputNumber_(value) {
    const n = Number(value);
    if (!isFinite(n)) return '';
    return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
  }


  function normalizeNumericInput_(value) {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return isFinite(value) ? value : 0;

    let text = String(value)
      .replace(/บาท/g, '')
      .replace(/฿/g, '')
      .replace(/,/g, '')
      .replace(/\s+/g, '')
      .trim();

    if (!text) return 0;

    // Support Thai numerals pasted from mobile keyboards or notes.
    const thaiDigits = '๐๑๒๓๔๕๖๗๘๙';
    text = text.replace(/[๐-๙]/g, d => String(thaiDigits.indexOf(d)));

    // Keep only one decimal point and a leading minus if present.
    text = text.replace(/[^0-9.\-]/g, '');
    const negative = text.startsWith('-');
    text = text.replace(/-/g, '');
    const parts = text.split('.');
    text = parts.shift() + (parts.length ? '.' + parts.join('') : '');
    if (negative) text = '-' + text;

    const n = Number(text);
    return isFinite(n) ? n : 0;
  }

  function sanitizeNumericInputsInForm_(form) {
    if (!form) return;
    form.querySelectorAll('[data-number-input="true"]').forEach(input => {
      const raw = input.value;
      if (raw === null || raw === undefined || String(raw).trim() === '') return;
      const n = normalizeNumericInput_(raw);
      input.value = Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
    });
  }

  function formatPercent(value) {
    const n = Number(value) || 0;
    return (n * 100).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + '%';
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function setWidth(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    const pct = Math.max(0, Math.min(100, (Number(value) || 0) * 100));
    el.style.width = pct + '%';
    el.style.minWidth = pct > 0 ? '8px' : '0';
  }


  function setRefreshState(isLoading) {
    const btn = document.getElementById('refresh-button');
    if (!btn) return;
    btn.disabled = isLoading;
    btn.textContent = isLoading ? '…' : '↻';
    btn.setAttribute('aria-busy', isLoading ? 'true' : 'false');
    if (isLoading) {
      btn.classList.add('opacity-70', 'cursor-not-allowed');
    } else {
      btn.classList.remove('opacity-70', 'cursor-not-allowed');
    }
  }

  function triggerTapFeedback_(el) {
    if (navigator.vibrate) {
      try { navigator.vibrate(12); } catch (e) {}
    }

    if (!el) return;
    el.classList.remove('tap-pop');
    void el.offsetWidth;
    el.classList.add('tap-pop');
  }

  async function loadCategories() {
    try {
      const cats = await apiGet_('getCategoriesFromSettings');
      applyCategories_(cats || {});
    } catch (err) {
      console.error(err);
      systemCategories.Income = ['Salary', 'Side income', 'Other'];
      systemCategories.Expenses = ['Food', 'Transport', 'Medical/Pet', 'Other'];
      systemCategories.Savings = ['Emergency fund', 'Other'];
      systemCategories.Investments = ['Money Market', 'Fund/ETF', 'Other'];
      systemCategories.savingsGoals = ['Emergency Fund 100k'];
      systemCategories.investmentActions = ['Buy', 'DCA', 'Sell', 'Withdraw', 'Dividend', 'Fee'];
      toggleType('Expenses');
      showToast('โหลดหมวดหมู่ไม่สำเร็จ ใช้ค่าเริ่มต้นแทน', 'warning');
    }
  }

  async function loadAddTransactionQuickData_(force) {
    if (ADD_QUICK_DATA_LOADED && !force) return;
    try {
      const res = await apiGet_('getAddTransactionQuickData');
      ADD_QUICK_DATA_LOADED = true;
      if (!res || res.status === 'error') return;
      if (res.categories) applyCategories_(res.categories);
      if (res.recent) {
        renderRecentMiniTransactions(res.recent);
        renderRecentTransactions(res.recent);
      }
    } catch (err) {
      console.warn('Quick Add data failed', err);
    }
  }

  function applyCategories_(cats) {
    cats = cats || {};
    systemCategories.Income = cats.income && cats.income.length ? cats.income : ['Salary', 'Side income', 'Other'];
    systemCategories.Expenses = cats.expense && cats.expense.length ? cats.expense : ['Food', 'Transport', 'Medical/Pet', 'Other'];
    systemCategories.Savings = cats.savingsBuckets && cats.savingsBuckets.length ? cats.savingsBuckets : ['Emergency fund', 'Other'];
    systemCategories.Investments = cats.investmentAssets && cats.investmentAssets.length ? cats.investmentAssets : ['Money Market', 'Fund/ETF', 'Thai Stock', 'Other'];
    systemCategories.savingsGoals = cats.savingsGoals && cats.savingsGoals.length ? cats.savingsGoals : ['Emergency Fund 100k'];
    systemCategories.savingsActions = cats.savingsActions && cats.savingsActions.length ? cats.savingsActions : ['Deposit', 'Withdrawal'];
    systemCategories.investmentActions = cats.investmentActions && cats.investmentActions.length ? cats.investmentActions : ['Buy', 'DCA', 'Sell', 'Withdraw', 'Dividend', 'Fee'];
    toggleType(getSelectedType() || 'Expenses');
  }

  function getSelectedType() {
    const selected = document.querySelector('input[name="type"]:checked');
    return selected ? selected.value : 'Expenses';
  }

  function toggleType(type) {
    const radio = document.querySelector(`input[name="type"][value="${type}"]`);
    if (radio) radio.checked = true;

    ['income', 'expense', 'savings', 'investments'].forEach(key => {
      const id = key === 'expense' ? 'label-expense' : `label-${key}`;
      const el = document.getElementById(id);
      if (el) {
        el.className = CLASS_INACTIVE;
        el.setAttribute('aria-pressed', 'false');
      }
    });

    const activeId = type === 'Expenses' ? 'label-expense' : type === 'Investments' ? 'label-investments' : `label-${type.toLowerCase()}`;
    const active = document.getElementById(activeId);
    if (active) {
      active.className = TYPE_STYLES[type] || CLASS_INACTIVE;
      active.setAttribute('aria-pressed', 'true');
      triggerTapFeedback_(active);
    }

    updateFormMode(type);
    updateCategories(type);
  }

  function updateFormMode(type) {
    const savingsFields = document.getElementById('savingsFields');
    const investmentFields = document.getElementById('investmentFields');
    const categoryLabel = document.getElementById('categoryLabel');
    const amountLabel = document.getElementById('amountLabel');

    if (savingsFields) {
      const showSavings = type === 'Savings';
      savingsFields.classList.toggle('hidden', !showSavings);
      savingsFields.classList.toggle('grid', showSavings);
    }

    if (investmentFields) investmentFields.classList.toggle('hidden', type !== 'Investments');

    if (categoryLabel) {
      categoryLabel.textContent = type === 'Income' ? 'หมวดรายรับ'
        : type === 'Expenses' ? 'หมวดรายจ่าย'
        : type === 'Savings' ? 'Account / Bucket'
        : 'ประเภทสินทรัพย์';
    }

    if (amountLabel) {
      amountLabel.textContent = type === 'Income' ? 'จำนวนเงินรับ (บาท)'
        : type === 'Expenses' ? 'จำนวนเงินจ่าย (บาท)'
        : type === 'Savings' ? 'จำนวนเงินออม/ถอน (บาท)'
        : 'จำนวนเงินลงทุน (บาท)';
    }

    fillSelect('goalNameSelect', systemCategories.savingsGoals);
    fillSelect('savingsActionSelect', systemCategories.savingsActions);
    fillSelect('investmentActionSelect', systemCategories.investmentActions);
  }

  function updateCategories(type) {
    const categories = systemCategories[type] || [];
    fillSelect('categorySelect', categories.length ? categories : ['Other']);
  }

  function fillSelect(id, items) {
    const select = document.getElementById(id);
    if (!select) return;
    const current = select.value;
    select.innerHTML = '';
    (items || []).forEach(item => {
      const opt = document.createElement('option');
      opt.value = item;
      opt.textContent = item;
      select.appendChild(opt);
    });
    if (current && Array.from(select.options).some(o => o.value === current)) select.value = current;
  }


  function renderSummaryLoadingSkeleton_() {
    ['sum-income', 'sum-expense', 'sum-savings', 'sum-investments'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<span class="inline-block w-16 h-4 bg-slate-200 rounded animate-pulse"></span>';
    });

    const fcf = document.getElementById('sum-fcf');
    if (fcf) fcf.innerHTML = '<span class="inline-block w-20 h-5 bg-slate-200 rounded animate-pulse"></span>';

    ['top-safe-daily', 'top-plan-status', 'top-emergency-progress'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<span class="inline-block w-12 h-3.5 bg-slate-200 rounded animate-pulse"></span>';
    });

    renderCycleReviewLoadingSkeleton_();
    renderPlanEditorLoadingSkeleton_();
    renderHistoryInsightLoadingSkeleton_();
    renderCycleHistoryLoadingSkeleton_();
    renderBudgetGuard([], 'loading', 'กำลังประเมิน Budget Guard');
    renderMonthlyPatternInsight(null);
  }


  function renderPlanEditorLoadingSkeleton_() {
    const badge = document.getElementById('plan-editor-badge');
    if (badge) {
      badge.textContent = 'กำลังโหลด';
      badge.className = 'text-xs px-2.5 py-1 rounded-full font-medium bg-slate-100 text-slate-600 text-right max-w-[45%] break-words';
    }
    setText('plan-editor-cycle', 'กำลังโหลดแผนรอบเงินเดือน');
    const preview = document.getElementById('planExpectedBufferPreview');
    if (preview) preview.innerHTML = '<span class="inline-block w-20 h-4 bg-slate-200 rounded animate-pulse"></span>';
  }

  function renderHistoryInsightLoadingSkeleton_() {
    const title = document.getElementById('history-insight-title');
    const summary = document.getElementById('history-insight-summary');
    const trend = document.getElementById('history-insight-trend');
    if (title) title.innerHTML = '<span class="inline-block w-28 h-4 bg-slate-200 rounded animate-pulse"></span>';
    if (summary) summary.innerHTML = '<span class="inline-block w-full h-3 bg-slate-200 rounded animate-pulse"></span>';
    if (trend) {
      trend.textContent = '-';
      trend.className = 'shrink-0 text-xs px-2.5 py-1 rounded-full font-medium bg-slate-100 text-slate-600';
    }
  }

  function renderCycleReviewLoadingSkeleton_() {
    const badge = document.getElementById('cycle-review-badge');
    if (badge) {
      badge.className = 'text-xs px-2.5 py-1 rounded-full font-medium bg-slate-100 text-slate-600 text-right max-w-[45%] break-words';
      badge.innerHTML = '<span class="inline-block w-16 h-3.5 bg-slate-200 rounded animate-pulse"></span>';
    }

    const status = document.getElementById('cycle-review-status');
    if (status) status.innerHTML = '<span class="inline-block w-40 h-3 bg-slate-200 rounded animate-pulse"></span>';

    const main = document.getElementById('cycle-review-main');
    if (main) main.innerHTML = '<span class="inline-block w-44 h-4 bg-slate-200 rounded animate-pulse"></span>';

    const recommendation = document.getElementById('cycle-review-recommendation');
    if (recommendation) recommendation.innerHTML = '<span class="inline-block w-full h-3 bg-slate-200 rounded animate-pulse"></span><span class="inline-block w-3/4 h-3 bg-slate-200 rounded animate-pulse mt-1"></span>';

    ['review-actual-fcf', 'review-expected-buffer'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<span class="inline-block w-20 h-4 bg-slate-200 rounded animate-pulse"></span>';
    });

    const notesBox = document.getElementById('cycle-review-notes');
    if (notesBox) {
      notesBox.innerHTML = `
        <div class="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
          <span class="inline-block w-full h-3 bg-slate-200 rounded animate-pulse"></span>
          <span class="inline-block w-2/3 h-3 bg-slate-200 rounded animate-pulse mt-1"></span>
        </div>
        <div class="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
          <span class="inline-block w-5/6 h-3 bg-slate-200 rounded animate-pulse"></span>
        </div>
      `;
    }
  }


  function renderCycleHistoryLoadingSkeleton_() {
    const box = document.getElementById('cycle-history-list');
    if (!box) return;
    box.innerHTML = `
      <div class="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
        <span class="inline-block w-full h-3 bg-slate-200 rounded animate-pulse"></span>
        <span class="inline-block w-2/3 h-3 bg-slate-200 rounded animate-pulse mt-2"></span>
      </div>
    `;
  }

  function renderCycleHistory(rows) {
    const box = document.getElementById('cycle-history-list');
    if (!box) return;

    rows = rows || [];
    box.innerHTML = '';

    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'text-xs text-slate-400 rounded-xl border border-slate-100 bg-slate-50 px-3 py-3';
      empty.textContent = 'ยังไม่มีประวัติรอบเงินเดือน กด Archive เพื่อบันทึกรอบปัจจุบัน';
      box.appendChild(empty);
      return;
    }

    rows.forEach(row => {
      const result = row.result || 'Review';
      const isGood = result === 'On Track';
      const isBad = result === 'Needs Action';
      const badgeClass = isBad ? 'bg-rose-100 text-rose-700' : isGood ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700';

      const item = document.createElement('div');
      item.className = 'rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-3';

      const top = document.createElement('div');
      top.className = 'flex items-start justify-between gap-2';

      const left = document.createElement('div');
      left.className = 'min-w-0';

      const title = document.createElement('div');
      title.className = 'text-sm font-semibold text-slate-800 truncate';
      title.textContent = `${row.payCycleStart || '-'} ถึง ${row.payCycleEnd || '-'}`;

      const meta = document.createElement('div');
      meta.className = 'text-xs text-slate-500 mt-0.5';
      meta.textContent = `FCF ${formatMoney(row.fcf)} • Safe ${formatMoney(row.safeDailySpend)}/วัน`;

      left.appendChild(title);
      left.appendChild(meta);

      const badge = document.createElement('span');
      badge.className = `text-xs px-2.5 py-1 rounded-full font-medium ${badgeClass} whitespace-nowrap`;
      badge.textContent = result;

      top.appendChild(left);
      top.appendChild(badge);

      const detail = document.createElement('div');
      detail.className = 'text-xs text-slate-500 mt-2 line-clamp-2';
      detail.textContent = row.recommendation || row.status || 'บันทึกสรุปรอบเงินเดือนแล้ว';

      item.appendChild(top);
      item.appendChild(detail);
      box.appendChild(item);
    });
  }

  async function archiveCurrentCycle() {
    if (!confirm('บันทึกสรุปรอบปัจจุบันลง Cycle History?')) return;

    const btn = document.getElementById('archive-cycle-button');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Saving...';
      btn.classList.add('opacity-70', 'cursor-not-allowed');
    }

    try {
      const res = await apiPost_('archiveCurrentCycle', 'Archived from GitHub Pages');
      if (res && res.status === 'success') {
        showToast(res.message || 'บันทึก Cycle History แล้ว', 'success');
        if (res.summary) renderFinancialSummary(res.summary);
        if (res.cycleHistory) renderCycleHistory(res.cycleHistory);
      } else {
        showToast('บันทึก Cycle History ไม่สำเร็จ: ' + (res ? res.message : 'ไม่ทราบสาเหตุ'), 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('บันทึก Cycle History ไม่สำเร็จ: ' + (err.message || err), 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Archive';
        btn.classList.remove('opacity-70', 'cursor-not-allowed');
      }
    }
  }

  async function loadFinancialStatus(done) {
    renderSummaryLoadingSkeleton_();
    try {
      const data = await apiGet_('getFinancialSummary');
      renderFinancialSummary(data || {});
    } catch (err) {
      console.error(err);
      ['sum-income', 'sum-expense', 'sum-savings', 'sum-investments', 'sum-fcf', 'top-safe-daily', 'top-plan-status', 'top-emergency-progress'].forEach(id => setText(id, '-'));
      resetCycleReviewOnError_();
      renderPlanEditorOnError_();
      renderHistoryInsight(null);
      renderArchiveStatus({ isCurrentCycleArchived: false });
      renderCycleHistory([]);
      showToast('โหลดสรุปการเงินไม่สำเร็จ: ' + (err.message || err), 'error');
    } finally {
      if (typeof done === 'function') done();
    }
  }

  function buildCompactPlanStatus_(data) {
    const status = String(data.planTrackingStatus || '');
    const completed = Number(data.planCompletedCount);
    const total = Number(data.planTaskCount);
    if (isFinite(completed) && isFinite(total) && total > 0) return `${completed}/${total}`;
    if (status) return status.replace('แผน', '').trim() || 'พร้อม';
    return '-';
  }


  function clearSkeletonLoaders_() {
    document.querySelectorAll('.animate-pulse').forEach(el => el.remove());
  }

  function renderFinancialSummary(data) {
    clearSkeletonLoaders_();
    data = data || {};
    setText('sum-income', formatMoney(data.income));
    setText('sum-expense', formatMoney(data.expense));
    setText('sum-savings', formatMoney(data.savings));
    setText('sum-investments', formatMoney(data.investments));
    setText('sum-fcf', formatMoney(data.fcf));
    setText('sum-month', data.month ? `รอบ ${data.month} • FCF Rate ${formatPercent(data.fcfRate)}` : '');
    setText('top-safe-daily', data.safeDailySpend === undefined ? '-' : formatMoney(data.safeDailySpend).replace(' ฿', ''));
    setText('top-emergency-progress', data.emergencyFundProgress === undefined ? '-' : formatPercent(data.emergencyFundProgress));
    setText('top-plan-status', buildCompactPlanStatus_(data));

    setText('emergency-current', `${formatMoney(data.emergencyFundCurrent)} / ${formatMoney(data.emergencyFundTarget)}`);
    setText('emergency-progress', `Progress ${formatPercent(data.emergencyFundProgress)}`);
    setText('investment-current', formatMoney(data.investmentCurrent));
    renderDailyControlPanel(data);
    renderBudgetGuard(data.budgetGuard || [], data.budgetGuardLevel, data.budgetGuardSummary);
    renderMonthlyPatternInsight(data.monthlyPatternInsight || null);
    renderPlanProgress(data);
    renderCycleReview(data);
    renderPlanEditor(data.editablePlan || {});
    renderArchiveStatus(data);
    renderHistoryInsight(data.historyInsight || null);
    renderCycleHistory(data.cycleHistory || []);

    setWidth('emergency-bar', data.emergencyFundProgress);

    const fcfEl = document.getElementById('sum-fcf');
    if (fcfEl) fcfEl.className = Number(data.fcf) < 0 ? 'text-xl font-bold text-rose-600' : 'text-xl font-bold text-emerald-600';

    renderAICoachBadge_(data);
  }

  function renderAICoachBadge_(data) {
    const aiBadge = document.getElementById('ai-badge');
    if (!aiBadge) return;

    const safeDaily = Number(data.safeDailySpend) || 0;
    const availableAfterPlan = Number(data.availableCashAfterPlan);
    const fcf = Number(data.fcf) || 0;
    const guardLevel = String(data.budgetGuardLevel || '').toLowerCase();
    let text = data.aiStatus || 'พร้อมวิเคราะห์ข้อมูล';
    let tone = 'good';

    if (fcf < 0 || availableAfterPlan < 0 || guardLevel === 'danger' || safeDaily < 150) {
      tone = 'danger';
      text = text || 'ต้องรีบปรับแผน';
    } else if (guardLevel === 'warning' || safeDaily < 300) {
      tone = 'warning';
      text = text || 'ควรระวังการใช้จ่าย';
    } else if (safeDaily < 500 || guardLevel === 'info') {
      tone = 'watch';
      text = text || 'ใช้จ่ายได้ แต่ควรติดตาม';
    } else {
      text = text || 'ใช้จ่ายได้ตามแผน';
    }

    const configs = {
      danger: 'bg-gradient-to-r from-rose-100 to-red-50 text-rose-700 border border-rose-200 shadow-sm',
      warning: 'bg-gradient-to-r from-amber-100 to-orange-50 text-amber-700 border border-amber-200 shadow-sm',
      watch: 'bg-gradient-to-r from-yellow-100 to-amber-50 text-yellow-700 border border-yellow-200 shadow-sm',
      good: 'bg-gradient-to-r from-emerald-100 to-green-50 text-emerald-700 border border-emerald-200 shadow-sm'
    };

    const icon = tone === 'danger' ? '🚨' : tone === 'warning' ? '🟠' : tone === 'watch' ? '🟡' : '🟢';
    text = String(text || '').replace(/^[🚨🟠🟡🟢💡⚠️\s]+/g, '').trim();
    aiBadge.textContent = `${icon} ${text}`;
    aiBadge.className = 'text-xs px-2.5 py-1 rounded-full font-semibold max-w-[48%] text-center leading-snug ' + configs[tone];
  }

  function renderDailyControlPanel(data) {
    const safeDailySpend = firstNumber_(data.safeDailySpend, data.dailySafeSpend);
    const daysLeft = firstNumber_(data.daysLeft, data.payCycleDaysLeft);
    const planFlex = firstNumber_(data.planFlexRemaining, data.planFlex, data.actualVsPlanGap);
    const availableAfterPlan = firstNumber_(data.availableCashAfterPlan, data.cashAfterPlan);

    setText('safe-daily-spend', safeDailySpend === null ? '-' : formatMoney(safeDailySpend) + ' /วัน');
    setText('days-left', daysLeft === null ? '-' : daysLeft.toLocaleString('th-TH') + ' วัน');
    setText('plan-flex', planFlex === null ? '-' : formatMoney(planFlex));
    setText('available-after-plan', availableAfterPlan === null ? '-' : formatMoney(availableAfterPlan));
    renderDailyProgressBar_(data);

    const badge = document.getElementById('daily-status-badge');
    const primary = document.getElementById('coach-primary');
    const detail = document.getElementById('coach-detail');

    if (safeDailySpend === null || daysLeft === null) {
      if (badge) {
        badge.textContent = 'รอข้อมูล';
        badge.className = 'text-xs px-2.5 py-1 rounded-full font-medium bg-slate-100 text-slate-600 text-right max-w-[170px]';
      }
      if (primary) primary.textContent = 'ยังไม่มีข้อมูลเพียงพอสำหรับคำนวณงบต่อวัน';
      if (detail) detail.textContent = 'ตรวจว่ามี Pay Cycle, Plans และ Accounts ครบแล้ว จากนั้นกด Refresh อีกครั้ง';
      return;
    }

    let statusText = 'ใช้จ่ายได้ตามแผน';
    let badgeClass = 'text-xs px-2.5 py-1 rounded-full font-medium bg-emerald-100 text-emerald-700 text-right max-w-[170px]';
    let primaryText = `วันนี้ใช้ได้ประมาณ ${formatMoney(safeDailySpend)} / วัน`;
    let detailText = `เหลืออีก ${daysLeft.toLocaleString('th-TH')} วันในรอบเงินเดือน ใช้ตัวเลขนี้เพื่อกันไม่ให้กระทบแผนออม/ลงทุน`;

    if (availableAfterPlan !== null && availableAfterPlan < 0) {
      statusText = 'แผนติดลบ';
      badgeClass = 'text-xs px-2.5 py-1 rounded-full font-medium bg-rose-100 text-rose-700 text-right max-w-[170px]';
      primaryText = 'เงินตามแผนไม่พอ ต้องลดรายจ่ายหรือเลื่อนบางแผน';
      detailText = 'ตรวจ Pay Mother, Debt/Bills, Savings Plan และ Living Budget ในชีต Plans';
    } else if (safeDailySpend < 150) {
      statusText = 'ต้องคุมเข้ม';
      badgeClass = 'text-xs px-2.5 py-1 rounded-full font-medium bg-rose-100 text-rose-700 text-right max-w-[170px]';
      primaryText = `งบต่อวันต่ำมาก: ${formatMoney(safeDailySpend)} / วัน`;
      detailText = 'ควรลดรายจ่ายที่ไม่จำเป็น และบันทึกรายจ่ายทุกวันจนถึงรอบเงินเดือนถัดไป';
    } else if (safeDailySpend < 300) {
      statusText = 'ระวังการใช้จ่าย';
      badgeClass = 'text-xs px-2.5 py-1 rounded-full font-medium bg-amber-100 text-amber-700 text-right max-w-[170px]';
      primaryText = `ใช้ได้ประมาณ ${formatMoney(safeDailySpend)} / วัน`;
      detailText = 'ยังใช้จ่ายได้ แต่ควรติดตาม Plan Flex และรายจ่ายจำเป็นอย่างใกล้ชิด';
    } else if (planFlex !== null && planFlex <= 0) {
      statusText = 'ติดตามแผนใกล้ชิด';
      badgeClass = 'text-xs px-2.5 py-1 rounded-full font-medium bg-amber-100 text-amber-700 text-right max-w-[170px]';
      primaryText = `ใช้ได้ประมาณ ${formatMoney(safeDailySpend)} / วัน`;
      detailText = 'งบต่อวันยังพอใช้ได้ แต่ Plan Flex เหลือน้อย ควรติดตามแผนใกล้ชิด';
    }

    if (badge) {
      badge.textContent = statusText;
      badge.className = badgeClass;
    }
    if (primary) primary.textContent = primaryText;
    if (detail) detail.textContent = detailText;
  }

  function renderDailyProgressBar_(data) {
    data = data || {};
    const bar = document.getElementById('daily-progress-bar');
    const percentEl = document.getElementById('daily-progress-percent');
    const helper = document.getElementById('daily-progress-helper');
    const label = document.getElementById('daily-progress-label');
    if (!bar || !percentEl || !helper || !label) return;

    const livingPct = firstNumber_(data.livingBudgetUsedPercent);
    const livingUsed = firstNumber_(data.actualLivingExpense) || 0;
    const livingPlan = firstNumber_(data.plannedLivingBudget) || 0;
    const livingRemaining = firstNumber_(data.livingBudgetRemaining);

    if (livingPct === null || livingPlan <= 0) {
      bar.style.width = '0%';
      bar.style.minWidth = '0';
      bar.className = 'daily-progress-fill';
      percentEl.textContent = '-';
      label.textContent = 'Living Budget Progress';
      helper.textContent = 'ยังไม่มี Living Budget ในแผนรอบนี้';
      return;
    }

    const cappedPct = Math.max(0, Math.min(1.2, livingPct));
    const widthPct = Math.min(100, cappedPct * 100);
    bar.style.width = widthPct + '%';
    bar.style.minWidth = widthPct > 0 ? '10px' : '0';

    const tone = livingPct >= 1 ? 'danger' : livingPct >= 0.8 ? 'warning' : 'safe';
    bar.className = 'daily-progress-fill' + (tone === 'danger' ? ' danger' : tone === 'warning' ? ' warning' : '');

    percentEl.textContent = formatPercent(livingPct);
    percentEl.className = tone === 'danger'
      ? 'text-xs font-bold text-rose-700'
      : tone === 'warning'
        ? 'text-xs font-bold text-amber-700'
        : 'text-xs font-bold text-emerald-700';

    label.textContent = tone === 'danger'
      ? 'Living Budget Over Plan'
      : tone === 'warning'
        ? 'Living Budget Warning'
        : 'Living Budget Progress';

    const remainingText = livingRemaining === null ? '' : ` • เหลือ ${formatMoney(livingRemaining)}`;
    helper.textContent = `ใช้ไป ${formatMoney(livingUsed)} จากแผน ${formatMoney(livingPlan)}${remainingText}`;
  }

  function renderPlanProgress(data) {
    setPlanItem('pay-mother', data.actualPayMother, data.plannedPayMother, data.payMotherProgress, 'จ่ายแล้ว');
    setPlanItem('debt-bills', data.actualDebtBills, data.plannedDebtBills, data.debtBillsProgress, 'จ่ายแล้ว');
    setPlanItem('savings', data.actualSavings, data.plannedSavings, data.savingsProgress, 'ออมแล้ว');

    const livingUsed = firstNumber_(data.actualLivingExpense) || 0;
    const livingPlan = firstNumber_(data.plannedLivingBudget) || 0;
    const livingPct = firstNumber_(data.livingBudgetUsedPercent) || 0;
    setText('living-progress-text', formatPercent(livingPct));
    setText('living-detail', `${formatMoney(livingUsed)} / ${formatMoney(livingPlan)} • เหลือ ${formatMoney(data.livingBudgetRemaining)} • ไม่ถูกนับเป็นแผนหลัก`);
    setWidth('living-progress-bar', livingPct);

    const completed = Number(data.planCompletedCount) || 0;
    const total = Number(data.planTaskCount) || 0;
    const livingLabel = livingPct > 1 ? 'Living เกินแผน' : livingPct >= 0.8 ? 'Living ใกล้เต็ม' : 'Living ปลอดภัย';
    const badge = document.getElementById('plan-progress-badge');
    if (badge) {
      badge.textContent = total ? `${completed}/${total} แผนหลัก • ${livingLabel}` : livingLabel;
      badge.className = livingPct > 1
        ? 'text-xs px-2.5 py-1 rounded-full font-medium bg-rose-100 text-rose-700 max-w-[45%] break-words text-right'
        : completed === total && total > 0
          ? 'text-xs px-2.5 py-1 rounded-full font-medium bg-emerald-100 text-emerald-700 max-w-[45%] break-words text-right'
          : 'text-xs px-2.5 py-1 rounded-full font-medium bg-amber-100 text-amber-700 max-w-[45%] break-words text-right';
    }
    setText('plan-tracking-status', data.planTrackingStatus || 'แผนหลักแยกจาก Living Budget ซึ่งเป็นตัวติดตามการใช้จ่าย');
  }

  function setPlanItem(prefix, actual, planned, progress, verb) {
    const a = firstNumber_(actual) || 0;
    const p = firstNumber_(planned) || 0;
    const pct = p > 0 ? Math.min(1, a / p) : 0;
    const displayPct = progress !== undefined && progress !== null ? Number(progress) || pct : pct;
    setText(`${prefix}-progress-text`, p > 0 ? formatPercent(displayPct) : '-');
    setText(`${prefix}-detail`, p > 0 ? `${verb} ${formatMoney(a)} / ${formatMoney(p)}` : 'ไม่มีแผนในรอบนี้');
    setWidth(`${prefix}-progress-bar`, displayPct);
  }


  function resetCycleReviewOnError_() {
    setText('cycle-review-status', 'โหลดข้อมูลไม่สำเร็จ');
    setText('cycle-review-main', 'ยังไม่สามารถสรุปรอบเงินเดือนได้');
    setText('cycle-review-recommendation', 'กรุณากด Refresh อีกครั้ง หรือตรวจสอบ Code.gs / Google Sheets');
    setText('review-actual-fcf', '-');
    setText('review-expected-buffer', '-');

    const badge = document.getElementById('cycle-review-badge');
    if (badge) {
      badge.textContent = 'Error';
      badge.className = 'text-xs px-2.5 py-1 rounded-full font-medium bg-rose-100 text-rose-700 text-right max-w-[45%] break-words';
    }

    const notesBox = document.getElementById('cycle-review-notes');
    if (notesBox) {
      notesBox.innerHTML = '<div class="rounded-lg bg-rose-50 border border-rose-100 px-3 py-2 text-rose-600">โหลด Cycle Review ไม่สำเร็จ</div>';
    }
  }

  function renderCycleReview(data) {
    const review = data.cycleReview || {};
    const result = review.result || data.cycleReviewResult || 'Unknown';
    const status = review.status || data.cycleReviewStatus || 'กำลังประเมิน';
    const recommendation = review.recommendation || data.cycleReviewRecommendation || data.aiCoachV2 || 'บันทึกข้อมูลเพิ่มเพื่อให้คำแนะนำแม่นขึ้น';

    const badge = document.getElementById('cycle-review-badge');
    if (badge) {
      badge.textContent = status;
      if (result === 'Needs Action') {
        badge.className = 'text-xs px-2.5 py-1 rounded-full font-medium bg-rose-100 text-rose-700 text-right max-w-[45%] break-words';
      } else if (result === 'Watch') {
        badge.className = 'text-xs px-2.5 py-1 rounded-full font-medium bg-amber-100 text-amber-700 text-right max-w-[45%] break-words';
      } else {
        badge.className = 'text-xs px-2.5 py-1 rounded-full font-medium bg-emerald-100 text-emerald-700 text-right max-w-[45%] break-words';
      }
    }

    const main = document.getElementById('cycle-review-main');
    if (main) {
      if (result === 'Needs Action') main.textContent = 'ต้องปรับแผนรอบนี้';
      else if (result === 'Watch') main.textContent = 'ยังไปต่อได้ แต่ควรติดตามใกล้ชิด';
      else main.textContent = 'แผนรอบนี้ยังอยู่ในเกณฑ์ดี';
    }

    setText('cycle-review-status', status || 'สรุปผลจากแผนจริงและรายการที่บันทึก');
    setText('cycle-review-recommendation', recommendation);
    setText('review-actual-fcf', formatMoney(review.actualFcf !== undefined ? review.actualFcf : data.fcf));
    setText('review-expected-buffer', formatMoneyDetailed(review.expectedBuffer !== undefined ? review.expectedBuffer : data.expectedBufferAfterPlan));

    const notesBox = document.getElementById('cycle-review-notes');
    if (!notesBox) return;

    const notes = Array.isArray(review.notes) && review.notes.length
      ? review.notes
      : buildFallbackCycleNotes_(data);

    notesBox.innerHTML = '';
    notes.slice(0, 5).forEach(note => {
      const div = document.createElement('div');
      div.className = 'rounded-lg bg-slate-50 border border-slate-100 px-3 py-2';
      div.textContent = '• ' + note;
      notesBox.appendChild(div);
    });
  }

  function buildFallbackCycleNotes_(data) {
    const notes = [];
    if (Number(data.actualSavings) >= Number(data.plannedSavings) && Number(data.plannedSavings) > 0) {
      notes.push('ออมครบตามแผนแล้ว');
    }
    if (Number(data.actualPayMother) >= Number(data.plannedPayMother) && Number(data.plannedPayMother) > 0) {
      notes.push('ช่วยแม่/ค่ารักษาสัตว์ครบตามแผนแล้ว');
    }
    if (Number(data.actualDebtBills) < Number(data.plannedDebtBills) && Number(data.plannedDebtBills) > 0) {
      notes.push('ยังเหลือ Debt/Bills ที่ควรกันเงินไว้ก่อน');
    }
    if (Number(data.safeDailySpend) >= 300 && Number(data.planFlexRemaining) > 0) {
      notes.push('งบใช้จ่ายต่อวันยังอยู่ในโซนปลอดภัย');
    }
    return notes.length ? notes : ['ยังไม่มีข้อมูลเพียงพอสำหรับสรุปรอบเงินเดือน'];
  }


  function setupPlanEditorListeners_() {
    ['planExpectedIncome', 'planPayMother', 'planDebtBills', 'planSavings', 'planLivingBudget'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', updateExpectedBufferPreview_);
    });
  }

  function renderPlanEditor(plan) {
    plan = plan || {};
    const fields = {
      planExpectedIncome: plan.expectedIncome,
      planPayMother: plan.payMother,
      planDebtBills: plan.debtBills,
      planSavings: plan.savingsPlan,
      planLivingBudget: plan.livingBudget,
      planMainGoal: plan.mainGoal,
      planNote: plan.note
    };

    const numericPlanFields = new Set([
      'planExpectedIncome',
      'planPayMother',
      'planDebtBills',
      'planSavings',
      'planLivingBudget'
    ]);

    Object.keys(fields).forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const value = fields[id];
      if (value === undefined || value === null || value === '') {
        el.value = '';
      } else if (numericPlanFields.has(id)) {
        el.value = formatPlanInputNumber_(value);
      } else {
        el.value = value;
      }
    });

    setText('plan-editor-cycle', plan.payCycleStart && plan.payCycleEnd ? `${plan.payCycleStart} ถึง ${plan.payCycleEnd}` : 'แผนรอบเงินเดือนปัจจุบัน');

    const badge = document.getElementById('plan-editor-badge');
    if (badge) {
      badge.textContent = 'แก้ได้';
      badge.className = 'text-xs px-2.5 py-1 rounded-full font-medium bg-indigo-100 text-indigo-700 text-right max-w-[45%] break-words';
    }

    updateExpectedBufferPreview_();
  }

  function renderPlanEditorOnError_() {
    setText('plan-editor-cycle', 'โหลดแผนไม่สำเร็จ');
    const badge = document.getElementById('plan-editor-badge');
    if (badge) {
      badge.textContent = 'Error';
      badge.className = 'text-xs px-2.5 py-1 rounded-full font-medium bg-rose-100 text-rose-700 text-right max-w-[45%] break-words';
    }
    const preview = document.getElementById('planExpectedBufferPreview');
    if (preview) preview.textContent = '-';
  }

  function updateExpectedBufferPreview_() {
    const income = normalizeNumericInput_((document.getElementById('planExpectedIncome') || {}).value) || 0;
    const payMother = normalizeNumericInput_((document.getElementById('planPayMother') || {}).value) || 0;
    const debtBills = normalizeNumericInput_((document.getElementById('planDebtBills') || {}).value) || 0;
    const savings = normalizeNumericInput_((document.getElementById('planSavings') || {}).value) || 0;
    const living = normalizeNumericInput_((document.getElementById('planLivingBudget') || {}).value) || 0;
    const buffer = income - payMother - debtBills - savings - living;

    const preview = document.getElementById('planExpectedBufferPreview');
    if (preview) {
      const mainClass = buffer < 0 ? 'text-rose-700' : 'text-emerald-700';
      const helperText = buffer < 0 ? 'แผนติดลบ ควรลดงบหรือเลื่อนบางรายการ' : 'คงเหลือหลังหักแผนหลัก';
      preview.innerHTML = `
        <span class="block text-base font-bold ${mainClass}">${formatMoneyDetailed(buffer)}</span>
        <span class="block text-[11px] font-medium text-slate-400 mt-0.5">${helperText}</span>
      `;
      preview.className = buffer < 0
        ? 'w-full border border-rose-100 bg-rose-50 rounded-xl px-3 py-2 shadow-inner'
        : 'w-full border border-emerald-100 bg-emerald-50/70 rounded-xl px-3 py-2 shadow-inner';
    }
  }

  function handlePlanEditSubmit(event) {
    event.preventDefault();
    sanitizeNumericInputsInForm_(event.target);

    const form = event.target;
    const payload = {
      expectedIncome: form.expectedIncome ? form.expectedIncome.value : 0,
      payMother: form.payMother ? form.payMother.value : 0,
      debtBills: form.debtBills ? form.debtBills.value : 0,
      savingsPlan: form.savingsPlan ? form.savingsPlan.value : 0,
      livingBudget: form.livingBudget ? form.livingBudget.value : 0,
      mainGoal: form.mainGoal ? form.mainGoal.value : '',
      note: form.note ? form.note.value : ''
    };

    if (!confirm('บันทึกการแก้แผนรอบเงินเดือนนี้?')) return;

    setPlanEditState_(true);

    apiPost_('updateCurrentPlan', payload)
      .then(res => {
        setPlanEditState_(false);
        if (res && res.status === 'success') {
          showToast(res.message || 'อัปเดตแผนเรียบร้อยแล้ว', 'success');
          if (res.summary) renderFinancialSummary(res.summary);
          else loadFinancialStatus();
        } else {
          showToast('อัปเดตแผนไม่สำเร็จ: ' + (res ? res.message : 'ไม่ทราบสาเหตุ'), 'error');
        }
      })
      .catch(err => {
        setPlanEditState_(false);
        console.error(err);
        showToast('อัปเดตแผนไม่สำเร็จ: ' + (err.message || err), 'error');
      });
  }

  function setPlanEditState_(isLoading) {
    const btn = document.getElementById('save-plan-button');
    if (!btn) return;
    btn.disabled = isLoading;
    btn.textContent = isLoading ? 'กำลังบันทึกแผน...' : 'บันทึกแผนรอบนี้';
    if (isLoading) btn.classList.add('opacity-70', 'cursor-not-allowed');
    else btn.classList.remove('opacity-70', 'cursor-not-allowed');
  }

  function renderArchiveStatus(data) {
    const badge = document.getElementById('archive-status-badge');
    const btn = document.getElementById('archive-cycle-button');
    const archived = !!(data && data.isCurrentCycleArchived);

    if (badge) {
      badge.textContent = archived ? 'บันทึกรอบนี้แล้ว' : 'ยังไม่บันทึก';
      badge.className = archived
        ? 'text-xs px-2.5 py-1 rounded-full font-medium bg-emerald-100 text-emerald-700'
        : 'text-xs px-2.5 py-1 rounded-full font-medium bg-slate-100 text-slate-600';
    }

    if (btn) {
      btn.textContent = archived ? 'Update Archive' : 'Archive';
    }
  }

  function renderHistoryInsight(insight) {
    insight = insight || {};
    const value = insight.trend || insight.status || 'No Data';
    const fallbackTitle = value === 'No Data' ? 'ยังไม่มีประวัติย้อนหลัง' : 'History Insight';
    const fallbackSummary = value === 'No Data'
      ? 'กด Archive เพื่อเริ่มเก็บประวัติรอบเงินเดือน แล้วระบบจะเริ่มวิเคราะห์แนวโน้มให้'
      : 'ยังไม่มีข้อมูลเพียงพอสำหรับวิเคราะห์แนวโน้ม';

    setText('history-insight-title', insight.title || fallbackTitle);
    setText('history-insight-summary', insight.summary || fallbackSummary);

    const trend = document.getElementById('history-insight-trend');
    if (trend) {
      trend.textContent = value;
      if (value === 'Improving') {
        trend.className = 'shrink-0 text-xs px-2.5 py-1 rounded-full font-medium bg-emerald-100 text-emerald-700';
      } else if (value === 'Declining') {
        trend.className = 'shrink-0 text-xs px-2.5 py-1 rounded-full font-medium bg-rose-100 text-rose-700';
      } else if (value === 'Stable') {
        trend.className = 'shrink-0 text-xs px-2.5 py-1 rounded-full font-medium bg-sky-100 text-sky-700';
      } else {
        trend.className = 'shrink-0 text-xs px-2.5 py-1 rounded-full font-medium bg-slate-100 text-slate-600';
      }
    }
  }

  function firstNumber_(...values) {
    for (const value of values) {
      const n = Number(value);
      if (isFinite(n)) return n;
    }
    return null;
  }

  function loadRecentTransactions() {
    const box = document.getElementById('recent-list');
    if (box) {
      box.innerHTML = `<div class="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 text-sm text-slate-500">กำลังโหลดรายการล่าสุด...</div>`;
    }
    apiGet_('getRecentTransactions', { limit: 10 })
      .then(rows => {
        rows = rows || [];
        renderRecentTransactions(rows);
        renderRecentMiniTransactions(rows);
      })
      .catch(err => {
        console.error(err);
        if (box) box.innerHTML = `<div class="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-4 text-sm text-rose-600">โหลดรายการล่าสุดไม่สำเร็จ กรุณากดโหลดใหม่อีกครั้ง</div>`;
      });
  }

  function renderRecentTransactions(rows) {
    const box = document.getElementById('recent-list');
    if (!box) return;
    rows = Array.isArray(rows) ? rows : [];
    box.innerHTML = '';

    if (!rows.length) {
      box.innerHTML = '<div class="text-xs text-slate-400">ยังไม่มีรายการ</div>';
      return;
    }

    rows.forEach(row => {
      box.appendChild(renderRecentTransactionItem_(row, {
        compact: false,
        showActions: true
      }));
    });
  }

  function renderRecentMiniTransactions(rows) {
    const box = document.getElementById('recent-mini-list');
    if (!box) return;
    rows = Array.isArray(rows) ? rows : [];
    box.innerHTML = '';

    if (!rows.length) {
      box.innerHTML = '<div class="text-xs text-slate-400 rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">ยังไม่มีรายการล่าสุด</div>';
      return;
    }

    rows.slice(0, 3).forEach(row => {
      box.appendChild(renderRecentTransactionItem_(row, {
        compact: true,
        showActions: false
      }));
    });
  }

  function renderRecentTransactionItem_(row, options) {
    row = row || {};
    options = options || {};
    const compact = !!options.compact;
    const showActions = !!options.showActions;
    const meta = getTypeMeta(row.type);
    const amountMeta = getRecentAmountMeta_(row, meta);

    const wrapper = document.createElement('div');
    wrapper.className = compact
      ? `rounded-xl border ${meta.border} ${meta.bg} px-3 py-2 flex items-center justify-between gap-3 active:scale-[0.995] transition`
      : `border ${meta.border} rounded-2xl p-3 ${meta.bg} active:scale-[0.995] transition`;

    const top = document.createElement('div');
    top.className = compact
      ? 'flex items-center justify-between gap-3 w-full min-w-0'
      : 'flex items-start justify-between gap-3';

    const leftWrap = document.createElement('div');
    leftWrap.className = compact ? 'min-w-0' : 'flex items-start gap-3 min-w-0';

    if (!compact) {
      const icon = document.createElement('div');
      icon.className = `shrink-0 w-9 h-9 rounded-2xl grid place-items-center text-base ${meta.iconBg}`;
      icon.textContent = amountMeta.icon || meta.icon;
      leftWrap.appendChild(icon);
    }

    const left = document.createElement('div');
    left.className = compact ? 'min-w-0' : 'min-w-0 pt-0.5';

    const title = document.createElement('div');
    title.className = compact
      ? 'text-xs font-semibold text-slate-800 truncate'
      : 'text-sm font-semibold text-slate-800 truncate';
    title.textContent = `${meta.label} • ${row.category || '-'}`;

    const sub = document.createElement('div');
    sub.className = compact
      ? 'text-[11px] text-slate-400 truncate mt-0.5'
      : 'text-xs text-slate-400 truncate mt-0.5';
    sub.textContent = getRecentSubtitle_(row, compact);

    left.appendChild(title);
    left.appendChild(sub);
    leftWrap.appendChild(left);

    const amount = document.createElement('div');
    amount.className = compact
      ? `shrink-0 text-xs font-bold ${amountMeta.color} whitespace-nowrap`
      : `text-sm font-bold ${amountMeta.color} whitespace-nowrap pt-1`;
    amount.textContent = `${amountMeta.sign}${formatMoney(row.amount)}`;

    top.appendChild(leftWrap);
    top.appendChild(amount);
    wrapper.appendChild(top);

    if (showActions && (row.transactionId || row.id)) {
      const actions = document.createElement('div');
      actions.className = 'flex justify-end gap-2 mt-3';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'text-xs px-3 py-1.5 rounded-xl bg-white/85 border border-slate-100 text-slate-600 active:scale-95 transition';
      editBtn.textContent = 'Edit';
      editBtn.onclick = () => openEditTransactionModal(row.transactionId || row.id);

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'text-xs px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 active:scale-95 transition';
      deleteBtn.textContent = 'Delete';
      deleteBtn.onclick = () => deleteTransactionById(row.transactionId || row.id);

      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);
      wrapper.appendChild(actions);
    }

    return wrapper;
  }

  function getRecentSubtitle_(row, compact) {
    row = row || {};
    const parts = [row.date || '-'];
    const action = normalizeActionText_(row.action);

    if (compact) {
      if (row.note) parts.push(row.note);
      else if (action && row.type !== 'Income' && row.type !== 'Expenses') parts.push(action);
      return parts.join(' • ');
    }

    if (row.note) parts.push(row.note);
    else if (row.item && row.item !== row.category) parts.push(row.item);
    else if (action && row.type !== 'Income' && row.type !== 'Expenses') parts.push(action);
    return parts.join(' • ');
  }

  function getRecentAmountMeta_(row, meta) {
    row = row || {};
    meta = meta || getTypeMeta(row.type);
    const action = normalizeActionText_(row.action);

    if (row.type === 'Income') {
      return { sign: '+', color: 'text-emerald-600', icon: '+' };
    }

    if (row.type === 'Expenses') {
      return { sign: '-', color: 'text-rose-600', icon: '-' };
    }

    if (row.type === 'Savings') {
      if (action === 'Withdrawal' || action === 'Withdraw') {
        return { sign: '-', color: 'text-rose-600', icon: '-' };
      }
      return { sign: '+', color: 'text-sky-600', icon: '+' };
    }

    if (row.type === 'Investments') {
      if (action === 'Sell' || action === 'Withdraw' || action === 'Withdrawal' || action === 'Dividend') {
        return { sign: '+', color: 'text-emerald-600', icon: '+' };
      }
      if (action === 'Fee') {
        return { sign: '-', color: 'text-rose-600', icon: '-' };
      }
      return { sign: '↗', color: 'text-violet-600', icon: '↗' };
    }

    return { sign: meta.sign || '', color: meta.color || 'text-slate-600', icon: meta.icon || '•' };
  }

  function normalizeActionText_(value) {
    return String(value || '').trim();
  }

  function getTypeMeta(type) {
    if (type === 'Income') {
      return { label: 'รายรับ', sign: '+', color: 'text-emerald-600', icon: '＋', iconBg: 'bg-emerald-100 text-emerald-700', bg: 'bg-emerald-50/40', border: 'border-emerald-100' };
    }
    if (type === 'Expenses') {
      return { label: 'รายจ่าย', sign: '-', color: 'text-rose-600', icon: '−', iconBg: 'bg-rose-100 text-rose-700', bg: 'bg-rose-50/40', border: 'border-rose-100' };
    }
    if (type === 'Savings') {
      return { label: 'เงินออม', sign: '+', color: 'text-sky-600', icon: '💰', iconBg: 'bg-sky-100 text-sky-700', bg: 'bg-sky-50/40', border: 'border-sky-100' };
    }
    if (type === 'Investments') {
      return { label: 'ลงทุน', sign: '↗', color: 'text-violet-600', icon: '📈', iconBg: 'bg-violet-100 text-violet-700', bg: 'bg-violet-50/40', border: 'border-violet-100' };
    }
    return { label: type || 'รายการ', sign: '', color: 'text-slate-600', icon: '•', iconBg: 'bg-slate-100 text-slate-600', bg: 'bg-slate-50/60', border: 'border-slate-100' };
  }


  function renderBudgetGuard(alerts, level, summary) {
    const list = document.getElementById('budget-guard-list');
    const badge = document.getElementById('budget-guard-badge');
    const summaryEl = document.getElementById('budget-guard-summary');
    alerts = Array.isArray(alerts) ? alerts : [];

    if (summaryEl) summaryEl.textContent = summary || 'ประเมินความเสี่ยงงบจากแผนและรายจ่ายจริง';

    const levelClass = {
      critical: 'bg-rose-100 text-rose-700',
      danger: 'bg-rose-100 text-rose-700',
      warning: 'bg-amber-100 text-amber-700',
      info: 'bg-sky-100 text-sky-700',
      success: 'bg-emerald-100 text-emerald-700',
      loading: 'bg-slate-100 text-slate-600'
    };

    if (badge) {
      const label = level === 'critical' || level === 'danger' ? 'เสี่ยงสูง'
        : level === 'warning' ? 'ควรระวัง'
        : level === 'info' ? 'กันเงินไว้'
        : level === 'success' ? 'ปลอดภัย'
        : 'รอข้อมูล';
      badge.textContent = label;
      badge.className = `text-xs px-2.5 py-1 rounded-full font-semibold text-center whitespace-nowrap ${levelClass[level] || levelClass.loading}`;
    }

    if (!list) return;
    list.innerHTML = '';
    if (!alerts.length) {
      list.innerHTML = '<div class="rounded-xl bg-white/75 border border-white/80 p-3 text-xs text-slate-400">ยังไม่มีข้อมูล Budget Guard</div>';
      return;
    }

    alerts.slice(0, 6).forEach(alert => {
      const cls = levelClass[alert.level] || levelClass.info;
      const item = document.createElement('div');
      item.className = 'rounded-xl bg-white/80 border border-white/80 p-3 shadow-sm';
      item.innerHTML = `
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="text-sm font-semibold text-slate-800">${escapeHtml_(alert.title || 'Budget Alert')}</div>
            <div class="text-xs text-slate-500 mt-1">${escapeHtml_(alert.message || '')}</div>
          </div>
          <span class="shrink-0 text-xs px-2 py-1 rounded-full font-medium ${cls}">${escapeHtml_(alert.level || 'info')}</span>
        </div>`;
      list.appendChild(item);
    });
  }

  function renderMonthlyPatternInsight(insight) {
    insight = insight || {
      title: 'Monthly Pattern Insight',
      trend: 'No Data',
      summary: 'ต้องมี Cycle History อย่างน้อย 2 รอบเพื่อวิเคราะห์แนวโน้มรายเดือนให้แม่นขึ้น',
      notes: []
    };

    setText('monthly-pattern-title', insight.title || 'Monthly Pattern Insight');
    setText('monthly-pattern-summary', insight.summary || 'ยังไม่มีข้อมูลเพียงพอ');

    const badge = document.getElementById('monthly-pattern-badge');
    if (badge) {
      const trend = insight.trend || 'No Data';
      const trendLabel = {
        Improving: 'ดีขึ้น',
        Declining: 'ควรระวัง',
        Watch: 'ติดตาม',
        Stable: 'คงที่',
        'Current Cycle': 'รอบนี้',
        'Need 2 Cycles': 'รอ 2 รอบ',
        'No Data': 'ยังไม่มีข้อมูล'
      }[trend] || trend;
      badge.textContent = trendLabel;
      if (trend === 'Improving') badge.className = 'text-xs px-2.5 py-1 rounded-full font-semibold bg-emerald-100 text-emerald-700 text-center whitespace-nowrap';
      else if (trend === 'Declining' || trend === 'Watch') badge.className = 'text-xs px-2.5 py-1 rounded-full font-semibold bg-amber-100 text-amber-700 text-center whitespace-nowrap';
      else if (trend === 'Stable') badge.className = 'text-xs px-2.5 py-1 rounded-full font-semibold bg-sky-100 text-sky-700 text-center whitespace-nowrap';
      else if (trend === 'Current Cycle') badge.className = 'text-xs px-2.5 py-1 rounded-full font-semibold bg-indigo-100 text-indigo-700 text-center whitespace-nowrap';
      else if (trend === 'Need 2 Cycles') badge.className = 'text-xs px-2.5 py-1 rounded-full font-semibold bg-slate-100 text-slate-600 text-center whitespace-nowrap';
      else badge.className = 'text-xs px-2.5 py-1 rounded-full font-semibold bg-slate-100 text-slate-600 text-center whitespace-nowrap';
    }

    const top = insight.topCategory;
    setText('monthly-pattern-top-category', top ? `Top flexible category: ${top.category} • ${formatMoney(top.amount)} • ${formatPercent(top.share)}` : 'ยังไม่มีหมวดรายจ่ายยืดหยุ่นเด่นในรอบนี้');

    const notesBox = document.getElementById('monthly-pattern-notes');
    if (!notesBox) return;
    const notes = Array.isArray(insight.notes) && insight.notes.length ? insight.notes : ['ยังไม่มีข้อมูลเชิงพฤติกรรมเพียงพอ'];
    notesBox.innerHTML = '';
    notes.slice(0, 5).forEach(note => {
      const div = document.createElement('div');
      div.className = 'rounded-lg bg-slate-50 border border-slate-100 px-3 py-2';
      div.textContent = '• ' + note;
      notesBox.appendChild(div);
    });
  }

  function escapeHtml_(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function openEditTransactionModal(transactionId) {
    if (!transactionId) {
      showToast('ไม่พบ Transaction ID ของรายการนี้', 'error');
      return;
    }
    const modal = document.getElementById('editTxModal');
    if (modal) modal.classList.remove('hidden');
    setText('editTxMeta', 'กำลังโหลดข้อมูลรายการ...');

    apiGet_('getTransactionById', { transactionId })
      .then(res => {
        if (!res || res.status === 'error') {
          closeEditTransactionModal();
          showToast('โหลดรายการไม่สำเร็จ: ' + (res ? res.message : 'ไม่ทราบสาเหตุ'), 'error');
          return;
        }
        fillEditTransactionForm_(res);
      })
      .catch(err => {
        closeEditTransactionModal();
        console.error(err);
        showToast('โหลดรายการไม่สำเร็จ: ' + (err.message || err), 'error');
      });
  }

  function fillEditTransactionForm_(tx) {
    const setValue = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.value = value === undefined || value === null ? '' : value;
    };
    setValue('editTxId', tx.transactionId || tx.id);
    setValue('editTxType', tx.type);
    setValue('editTxDate', tx.date);
    setValue('editTxAmount', tx.amount);
    setValue('editTxCategory', tx.category);
    setValue('editTxItem', tx.item || tx.goalName || tx.source || '');
    setValue('editTxAction', tx.action || '');
    setValue('editTxNote', tx.note || '');
    setText('editTxMeta', `${tx.type || '-'} • Row ${tx.rowNumber || '-'} • ${tx.date || '-'}`);
  }

  function closeEditTransactionModal() {
    const modal = document.getElementById('editTxModal');
    if (modal) modal.classList.add('hidden');
  }

  function populateEditTransactionOptions_(type, tx) {
    const actionSelect = document.getElementById('editTxAction');
    const itemList = document.getElementById('editTxItemOptions');
    const itemHint = document.getElementById('editTxItemHint');
    const actionHint = document.getElementById('editTxActionHint');

    const actionOptions = type === 'Savings'
      ? (systemCategories.savingsActions || ['Deposit', 'Withdrawal'])
      : type === 'Investments'
        ? (systemCategories.investmentActions || ['Buy', 'DCA', 'Sell', 'Withdraw', 'Dividend', 'Fee'])
        : [''];

    if (actionSelect) {
      actionSelect.innerHTML = '';
      actionOptions.forEach(value => {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = value || 'ไม่มี Action';
        actionSelect.appendChild(opt);
      });
      actionSelect.disabled = type === 'Income' || type === 'Expenses';
    }

    const itemOptions = type === 'Savings'
      ? (systemCategories.savingsGoals || [])
      : type === 'Investments'
        ? (systemCategories.Investments || [])
        : [];

    if (itemList) {
      itemList.innerHTML = '';
      itemOptions.forEach(value => {
        const opt = document.createElement('option');
        opt.value = value;
        itemList.appendChild(opt);
      });
    }
    if (itemHint) itemHint.textContent = type === 'Savings'
      ? 'ควรเลือก Goal ที่มีอยู่ใน Settings'
      : type === 'Investments'
        ? 'ควรเลือกสินทรัพย์ที่มีอยู่ใน Settings'
        : 'รายรับ/รายจ่ายพิมพ์ Item ได้อิสระ';
    if (actionHint) actionHint.textContent = type === 'Savings'
      ? 'Savings ใช้ได้เฉพาะ Deposit / Withdrawal'
      : type === 'Investments'
        ? 'Investment ใช้ Action ตามรายการที่ระบบรองรับ'
        : 'รายรับ/รายจ่ายไม่ต้องใช้ Action';
  }

  function normalizeActionForClient_(type, value) {
    const text = String(value || '').trim().toLowerCase();
    if (type === 'Savings') {
      if (['withdrawal', 'withdraw', 'ถอน', 'ถอนออก'].indexOf(text) !== -1) return 'Withdrawal';
      return 'Deposit';
    }
    if (type === 'Investments') {
      if (['sell', 'ขาย'].indexOf(text) !== -1) return 'Sell';
      if (['withdraw', 'withdrawal', 'ถอน'].indexOf(text) !== -1) return 'Withdraw';
      if (['dca'].indexOf(text) !== -1) return 'DCA';
      if (['dividend', 'ปันผล'].indexOf(text) !== -1) return 'Dividend';
      if (['fee', 'ค่าธรรมเนียม'].indexOf(text) !== -1) return 'Fee';
      return 'Buy';
    }
    return '';
  }

  function validateEditTransactionPayload_(type, payload) {
    const action = String(payload.action || '').trim();
    if (type === 'Savings') {
      const allowed = systemCategories.savingsActions && systemCategories.savingsActions.length ? systemCategories.savingsActions : ['Deposit', 'Withdrawal'];
      if (allowed.indexOf(action) === -1) return { ok: false, message: 'Action ของเงินออมต้องเป็น Deposit หรือ Withdrawal เท่านั้น' };
      const goals = systemCategories.savingsGoals || [];
      if (goals.length && payload.goalName && goals.indexOf(payload.goalName) === -1) {
        return { ok: false, message: 'ชื่อ Goal/Item ไม่ตรงกับรายการใน Settings กรุณาเลือกจากตัวเลือกที่ระบบมี' };
      }
    }
    if (type === 'Investments') {
      const allowed = systemCategories.investmentActions && systemCategories.investmentActions.length ? systemCategories.investmentActions : ['Buy', 'DCA', 'Sell', 'Withdraw', 'Dividend', 'Fee'];
      if (allowed.indexOf(action) === -1) return { ok: false, message: 'Action ของการลงทุนไม่ตรงกับรายการที่ระบบรองรับ' };
      const assets = systemCategories.Investments || [];
      if (assets.length && payload.item && assets.indexOf(payload.item) === -1) {
        return { ok: false, message: 'ชื่อสินทรัพย์ไม่ตรงกับรายการใน Settings กรุณาเลือกจากตัวเลือกที่ระบบมี' };
      }
    }
    return { ok: true };
  }

  function handleEditTransactionSubmit(event) {
    event.preventDefault();
    sanitizeNumericInputsInForm_(event.target);
    const form = event.target;
    const transactionId = form.transactionId.value;
    const type = form.type.value;
    const payload = {
      date: form.date.value,
      amount: form.amount.value,
      category: form.category.value,
      item: form.item.value,
      source: form.item.value,
      goalName: type === 'Savings' ? form.item.value : '',
      action: form.action.value,
      note: form.note.value
    };

    const validation = validateTransaction({ type, date: payload.date, amount: payload.amount, category: payload.category, goalName: type === 'Savings' ? (payload.goalName || payload.item) : 'ok' });
    if (!validation.ok) {
      showToast(validation.message, 'error');
      return;
    }

    const editValidation = validateEditTransactionPayload_(type, payload);
    if (!editValidation.ok) {
      showToast(editValidation.message, 'warning', 4200);
      return;
    }

    setEditTransactionState_(true);
    apiPost_('updateTransaction', { transactionId, data: payload })
      .then(res => {
        setEditTransactionState_(false);
        if (res && res.status === 'success') {
          closeEditTransactionModal();
          showToast(res.message || 'แก้ไขรายการเรียบร้อยแล้ว', 'success');
          if (res.summary) renderFinancialSummary(res.summary); else loadFinancialStatus();
          if (res.recent) { renderRecentTransactions(res.recent); renderRecentMiniTransactions(res.recent); } else loadRecentTransactions();
        } else {
          showToast('แก้ไขไม่สำเร็จ: ' + (res ? res.message : 'ไม่ทราบสาเหตุ'), 'error');
        }
      })
      .catch(err => {
        setEditTransactionState_(false);
        console.error(err);
        showToast('แก้ไขไม่สำเร็จ: ' + (err.message || err), 'error');
      });
  }

  function setEditTransactionState_(isLoading) {
    const btn = document.getElementById('editTxSaveButton');
    if (!btn) return;
    btn.disabled = isLoading;
    btn.textContent = isLoading ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข';
    if (isLoading) btn.classList.add('opacity-70', 'cursor-not-allowed');
    else btn.classList.remove('opacity-70', 'cursor-not-allowed');
  }

  function deleteTransactionById(transactionId) {
    if (!transactionId) {
      showToast('ไม่พบ Transaction ID ของรายการนี้', 'error');
      return;
    }
    if (!confirm('ลบรายการนี้ออกจาก Google Sheets? การลบแล้วกู้คืนไม่ได้จากหน้าเว็บนี้')) return;

    apiPost_('deleteTransaction', { transactionId })
      .then(res => {
        if (res && res.status === 'success') {
          showToast(res.message || 'ลบรายการเรียบร้อยแล้ว', 'success');
          if (res.summary) renderFinancialSummary(res.summary); else loadFinancialStatus();
          if (res.recent) { renderRecentTransactions(res.recent); renderRecentMiniTransactions(res.recent); } else loadRecentTransactions();
        } else {
          showToast('ลบไม่สำเร็จ: ' + (res ? res.message : 'ไม่ทราบสาเหตุ'), 'error');
        }
      })
      .catch(err => {
        console.error(err);
        showToast('ลบไม่สำเร็จ: ' + (err.message || err), 'error');
      });
  }

  function handleFormSubmit(event) {
    event.preventDefault();
    sanitizeNumericInputsInForm_(event.target);
    if (IS_SUBMITTING) return;

    const form = event.target;
    const type = getSelectedType();
    const data = {
      type,
      amount: form.amount ? form.amount.value : '',
      date: form.date ? form.date.value : '',
      category: form.category ? form.category.value : '',
      note: form.note ? form.note.value : ''
    };

    if (type === 'Savings') {
      data.goalName = form.goalName ? form.goalName.value : '';
      data.action = form.action ? form.action.value : 'Deposit';
    }

    if (type === 'Investments') {
      data.action = form.investmentAction ? form.investmentAction.value : 'Buy';
      data.item = form.assetName ? form.assetName.value : '';
      data.quantity = form.quantity ? form.quantity.value : '';
      data.price = form.price ? form.price.value : '';
    }

    const validation = validateTransaction(data);
    if (!validation.ok) {
      showToast(validation.message, 'error');
      return;
    }

    IS_SUBMITTING = true;
    setSubmitState(true);

    apiPost_('recordTransaction', data)
      .then(res => {
        IS_SUBMITTING = false;
        setSubmitState(false);
        if (res && res.status === 'success') {
          if (form.amount) form.amount.value = '';
          if (form.note) form.note.value = '';
          if (form.assetName) form.assetName.value = '';
          if (form.quantity) form.quantity.value = '';
          if (form.price) form.price.value = '';
          if (form.date && !ADD_DATE_LOCKED) form.date.value = getTodayLocalDateString();
          if (form.date && ADD_DATE_LOCKED) localStorage.setItem(DATE_LOCK_VALUE_KEY, form.date.value);
          updateDateLockHint_();
          showToast(res.message || 'บันทึกข้อมูลเรียบร้อยแล้ว', 'success');
          if (res.summary) renderFinancialSummary(res.summary); else loadFinancialStatus();
          if (res.recent) { renderRecentTransactions(res.recent); renderRecentMiniTransactions(res.recent); } else loadRecentTransactions();
        } else {
          showToast('เกิดข้อผิดพลาด: ' + (res ? res.message : 'ไม่ทราบสาเหตุ'), 'error');
        }
      })
      .catch(err => {
        IS_SUBMITTING = false;
        setSubmitState(false);
        console.error(err);
        showToast('บันทึกไม่สำเร็จ: ' + (err.message || err), 'error');
      });
  }

  function validateTransaction(data) {
    const allowed = ['Income', 'Expenses', 'Savings', 'Investments'];
    if (!data.type || allowed.indexOf(data.type) === -1) return { ok: false, message: 'กรุณาเลือกประเภทรายการ' };
    if (!data.date) return { ok: false, message: 'กรุณาระบุวันที่' };
    if (!data.category) return { ok: false, message: 'กรุณาเลือกหมวดหมู่' };
    const amount = normalizeNumericInput_(data.amount);
    data.amount = amount;
    if (!isFinite(amount) || amount <= 0) return { ok: false, message: 'กรุณาระบุจำนวนเงินให้ถูกต้อง' };
    if (data.type === 'Savings' && !data.goalName) return { ok: false, message: 'กรุณาเลือกเป้าหมายเงินออม' };
    return { ok: true };
  }

  function setSubmitState(isLoading) {
    const submitBtn = document.getElementById('submitBtn');
    if (!submitBtn) return;
    submitBtn.disabled = isLoading;
    submitBtn.textContent = isLoading ? 'กำลังบันทึกข้อมูล...' : 'บันทึกรายการ';
    if (isLoading) submitBtn.classList.add('opacity-70', 'cursor-not-allowed');
    else submitBtn.classList.remove('opacity-70', 'cursor-not-allowed');
  }

  function showToast(message, type, durationMs) {
    const toast = document.getElementById('toast');
    if (!toast) { alert(message); return; }

    if (TOAST_TIMER) {
      clearTimeout(TOAST_TIMER);
      TOAST_TIMER = null;
    }

    const toastType = type || 'error';
    const duration = Number(durationMs) || (toastType === 'error' ? 4500 : toastType === 'warning' ? 3600 : 2800);
    const baseClass = 'fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl text-white text-sm shadow-lg z-50 max-w-[90vw] text-center transition-opacity';

    toast.textContent = message || '';
    toast.className = baseClass + (toastType === 'success'
      ? ' bg-emerald-600'
      : toastType === 'warning'
        ? ' bg-amber-500'
        : ' bg-rose-600');

    TOAST_TIMER = setTimeout(() => {
      toast.classList.add('hidden');
      TOAST_TIMER = null;
    }, duration);
  }
