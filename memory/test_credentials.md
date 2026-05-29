# Test Credentials

> NOTE: This is a FORKED environment that started with a FRESH/EMPTY database.
> The previous tenant account (hanialdujaili@gmail.com) does NOT exist here.
> The backend auto-seeds the accounts below on startup.

## Admin (Tenant: default)
- Email: admin@maestroegp.com
- Password: admin123

## Super Admin (System Owner, tenant: system)
- Email: owner@maestroegp.com
- Password: owner123
- Secret Key: 271018

## Seeded Test Data (Delivery Report)
- Branch: "الفرع الرئيسي" (id: 76f56acc-6948-4a2f-bbf4-feccbddea88f), tenant=default
- delivery_app_settings: توترز (15%), طلبات (18%)
- 3 delivery orders (#1001, #1002 توترز; #1003 طلبات) with items
- Re-seed with: `cd /app/backend && python3 seed_delivery_test_data.py`

## Notes
- Backend runs WITHOUT --reload; restart with `sudo supervisorctl restart backend` after backend code changes.
- MongoDB (mongod) is started manually: `mongod --dbpath /data/db --bind_ip 0.0.0.0 --port 27017 --fork --logpath /var/log/mongod.log`
- Local Print Agent (http://localhost:9999) is NOT available in the test environment. Biometric/print should show "Not Connected" — expected.
