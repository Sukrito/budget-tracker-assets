# Personal AI Finance OS v12.8 Polish

## ไฟล์ในชุดนี้
- `Code_v12_8.gs` ใช้แทน `Code.gs` ใน Apps Script
- `script_v12_8.js` ใช้แทน `script.js` บน GitHub Pages

## สิ่งที่ปรับ
- System Check wording ชัดขึ้น: แยก Login, API, Cache, Recent_Index, Sheets
- แก้การแสดง Read/Write/Admin key: ถ้าใช้ `FINANCE_OS_API_SECRET` fallback จะขึ้น OK (fallback) ไม่ขึ้น Missing แบบทำให้สับสน
- Sheet status icon ถูกต้องขึ้น โดยใช้ `headerOk / headersOk` ตรงกัน
- Cache UX แสดง Script Cache, Dashboard_Cache, Cached at, Expires at, TTL
- Recent_Index health แสดง count และรายการล่าสุด
- ปุ่ม Reset Login เปลี่ยนเป็น Lock App
- Add Transaction default เป็น Expenses ถ้ายังไม่ได้เลือกประเภท

## วิธีติดตั้ง
1. Apps Script: วาง `Code_v12_8.gs` แทน `Code.gs`
2. กด Save
3. Deploy > Manage deployments > Edit > Version: New version > Deploy
4. GitHub: วาง `script_v12_8.js` แทน `script.js` แล้ว Commit
5. เปิดเว็บด้วย `?v=1280`

## หมายเหตุ
ถ้าใช้เฉพาะ `FINANCE_OS_API_SECRET` ระบบยังทำงานได้ และ System Check จะแสดง `OK (fallback)` สำหรับ Read/Write/Admin
