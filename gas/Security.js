/*******************************************************
 * Personal AI Finance OS v12.9 Split Backend
 * File: Security.gs
 * Google Apps Script shares global scope across .gs files.
 *******************************************************/

function setFinanceOsApiSecret_() {
  // เปลี่ยนรหัสด้านล่างก่อนกด Run ครั้งแรก แล้วอย่าเผยแพร่รหัสนี้ใน GitHub
  const secret = 'CHANGE_THIS_TO_YOUR_PRIVATE_FINANCE_OS_PIN';
  if (!secret || secret === 'CHANGE_THIS_TO_YOUR_PRIVATE_FINANCE_OS_PIN') {
    throw new Error('กรุณาแก้ค่า secret ใน setFinanceOsApiSecret_() ก่อนรัน');
  }
  PropertiesService.getScriptProperties().setProperty(API_SECURITY.SECRET_PROPERTY, secret);
  return 'FINANCE_OS_API_SECRET saved';
}

function getScriptSecret_(propertyName) {
  return PropertiesService.getScriptProperties().getProperty(propertyName) || '';
}

function getApiSecret_() {
  return getScriptSecret_(API_SECURITY.SECRET_PROPERTY);
}

function isPublicApiAction_(action) {
  return API_SECURITY.PUBLIC_ACTIONS.indexOf(String(action || '')) !== -1;
}

function getRequiredSecretPropertyForAction_(action) {
  const name = String(action || '');
  if (API_SECURITY.ADMIN_ACTIONS.indexOf(name) !== -1) return API_SECURITY.ADMIN_SECRET_PROPERTY;
  if (API_SECURITY.WRITE_ACTIONS.indexOf(name) !== -1) return API_SECURITY.WRITE_SECRET_PROPERTY;
  return API_SECURITY.READ_SECRET_PROPERTY;
}

function requireApiSecret_(providedSecret, action) {
  if (!API_SECURITY.ENABLED || isPublicApiAction_(action)) return true;

  const supplied = String(providedSecret || '');
  const legacySecret = getApiSecret_();
  const requiredProperty = getRequiredSecretPropertyForAction_(action);
  const scopedSecret = getScriptSecret_(requiredProperty);

  // If a scoped key exists, use it. Otherwise fall back to FINANCE_OS_API_SECRET
  // so the current script.js still works without breaking immediately.
  const allowedSecrets = [];
  if (scopedSecret) allowedSecrets.push(String(scopedSecret));
  if (legacySecret) allowedSecrets.push(String(legacySecret));

  if (!allowedSecrets.length) {
    throw new Error('API secret ยังไม่ได้ตั้งค่าใน Apps Script Script Properties');
  }

  if (allowedSecrets.indexOf(supplied) === -1) {
    throw new Error('Unauthorized: รหัสเข้าใช้งานไม่ถูกต้อง');
  }

  return true;
}

function logApiAccess_(action, method, status, message, e) {
  try {
    const ss = getSS_();
    let sh = ss.getSheetByName(API_SECURITY.LOG_SHEET);
    if (!sh) {
      sh = ss.insertSheet(API_SECURITY.LOG_SHEET);
      sh.getRange(1, 1, 1, API_LOG_HEADERS.length).setValues([API_LOG_HEADERS]);
      sh.setFrozenRows(1);
    }

    const userAgent = e && e.parameter && e.parameter.ua ? e.parameter.ua : '';
    const row = sh.getLastRow() + 1;
    sh.getRange(row, 1, 1, API_LOG_HEADERS.length).setValues([[
      Utilities.formatDate(new Date(), APP_CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss'),
      action || '',
      method || '',
      status || '',
      message || '',
      userAgent,
      'GitHub Pages API'
    ]]);
  } catch (err) {
    // ไม่ให้ logging ทำให้ API หลักพัง
  }
}
