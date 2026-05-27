# Personal AI Finance OS - GitHub Pages Migration

ไฟล์ในชุดนี้:

- `Code.gs` — วางใน Google Apps Script เดิม เพื่อทำหน้าที่เป็น backend/API อ่านเขียน Google Sheets
- `index.html` — วางใน GitHub Pages เป็นหน้าเว็บหลัก
- `styles.css` — CSS ที่แยกออกจาก Index
- `script.js` — JavaScript frontend ที่เปลี่ยนจาก `google.script.run` เป็น `fetch()` แล้ว
- `icon.png` — icon สำหรับ Add to Home Screen

## ขั้นตอนติดตั้ง

1. เปิด Google Apps Script เดิม แล้วแทนที่ไฟล์ `Code.gs` ด้วยไฟล์ `Code.gs` ในชุดนี้
2. Deploy Apps Script เป็น Web App:
   - Deploy > New deployment
   - Type: Web app
   - Execute as: Me
   - Who has access: Anyone
   - Deploy
3. คัดลอก Web App URL ที่ลงท้ายด้วย `/exec`
4. เปิด `script.js` แล้วแก้บรรทัดนี้:

```js
const APPS_SCRIPT_API_URL = 'PASTE_YOUR_APPS_SCRIPT_WEB_APP_EXEC_URL_HERE';
```

ให้เป็น URL `/exec` ของคุณ เช่น:

```js
const APPS_SCRIPT_API_URL = 'https://script.google.com/macros/s/XXXX/exec';
```

5. สร้าง GitHub repo เช่น `budget-tracker-app`
6. Upload ไฟล์ `index.html`, `styles.css`, `script.js`, `icon.png`
7. เปิด GitHub Pages:
   - Settings > Pages
   - Source: Deploy from a branch
   - Branch: main / root
8. เปิด URL GitHub Pages บน Safari แล้ว Add to Home Screen ใหม่

## เช็กว่า API ใช้งานได้ไหม

เปิด URL นี้ใน browser:

```text
YOUR_APPS_SCRIPT_WEB_APP_URL?action=health
```

ควรได้ JSON ประมาณ:

```json
{"status":"success","app":"Personal AI Finance OS API"}
```

ถ้า Dashboard โหลดไม่ได้ ให้เช็กก่อนว่า `APPS_SCRIPT_API_URL` ใน `script.js` เป็น URL `/exec` ของ deployment ล่าสุดหรือไม่
