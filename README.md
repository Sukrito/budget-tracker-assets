# Finance OS v12.6

ชุดนี้ต่อจาก v12.5 โดยใช้โครง stability/performance ล่าสุด:

- ใช้ Apps Script เป็น backend API
- ใช้ GitHub Pages เป็น frontend
- รองรับ session secret ผ่าน browser session
- มี Reset Login / Full Refresh / Clear Cache / System Check ตามโครง v12.5
- ใช้ smart recent + cache summary ตาม v12.4/v12.5

## วิธีใช้

1. เอา `Code_v12_6.gs` ไปแทน `Code.gs` ใน Apps Script
2. Save
3. Deploy > Manage deployments > Edit > New version > Deploy
4. เอา `script_v12_6.js` ไปแทน `script.js` บน GitHub
5. Commit changes
6. เปิดเว็บด้วย query ใหม่ เช่น `?v=126`

## Script Properties ที่ควรมี

ใช้รหัสเดียวกันก่อนได้:

- FINANCE_OS_API_SECRET
- FINANCE_OS_READ_SECRET
- FINANCE_OS_WRITE_SECRET
- FINANCE_OS_ADMIN_SECRET

## หมายเหตุ

ถ้าเว็บยังใช้ไฟล์เก่า ให้เปิดด้วย `?v=1260` หรือ Private mode บน iPhone/Safari
