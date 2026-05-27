# Personal AI Finance OS v12.7

## เป้าหมาย
แก้ปัญหา Home และ Recent โหลดช้า โดยเพิ่ม:

1. `Recent_Index` sheet
   - หน้าเว็บอ่านรายการล่าสุดจากชีต index โดยตรง
   - ไม่ต้อง scan `Income`, `Expenses`, `Savings`, `Investments` ทุกครั้ง
   - หลังบันทึกรายการใหม่ ระบบ prepend รายการเข้า `Recent_Index`
   - หลังแก้/ลบรายการ ระบบ rebuild index ใหม่

2. Fast Dashboard Cache
   - ใช้ `CacheService` ก่อน
   - เพิ่ม `Dashboard_Cache` sheet เป็น persistent cache 5 นาที
   - ช่วยให้ Home โหลดเร็วขึ้นเมื่อ Apps Script cache หมดแต่ cache sheet ยังไม่หมดอายุ

3. System Check เพิ่มเติม
   - ตรวจ `Recent_Index`
   - ตรวจ `Dashboard_Cache`
   - ปุ่ม `Rebuild Recent`
   - ปุ่ม `Clear Cache` จะ refresh เฉพาะ Dashboard ไม่โหลดทุกอย่างพร้อมกัน

## วิธีติดตั้ง

### Apps Script
1. เปิด Apps Script
2. แทนที่ `Code.gs` ด้วย `Code_v12_7.gs`
3. กด Save
4. Deploy > Manage deployments > Edit
5. Version: New version
6. Deploy

### GitHub
1. แทนที่ `script.js` ด้วย `script_v12_7.js`
2. ตรวจว่า `APPS_SCRIPT_API_URL` เป็น `/exec` URL ล่าสุด
3. Commit changes
4. เปิดเว็บด้วย query ใหม่ เช่น `?v=1270`

## หลังติดตั้ง
1. เข้า More / Settings
2. กด Run Check
3. กด Rebuild Recent หนึ่งครั้ง
4. กด Full Refresh

## หมายเหตุ
- ถ้าข้อมูล Home ครั้งแรกยังช้า ให้กดครั้งถัดไปใหม่ จะใช้ cache 5 นาที
- ถ้าแก้ข้อมูลใน Google Sheets โดยตรง ไม่ผ่านหน้าเว็บ ให้กด Rebuild Recent เพื่อซิงก์ index
- ถ้าข้อมูล Dashboard ไม่อัปเดต ให้กด Clear Cache
