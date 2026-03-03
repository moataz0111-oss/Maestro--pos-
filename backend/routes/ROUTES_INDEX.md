"""
Routes Index - فهرس المسارات
============================

هذا الملف يوثق بنية الـ routes في التطبيق.

## الملفات الموجودة في /backend/routes/

### ✅ مفصولة ومستخدمة:
- sync_routes.py        - مسارات المزامنة Offline
- reports_routes.py     - مسارات التقارير
- drivers_routes.py     - مسارات السائقين
- payroll_routes.py     - مسارات الرواتب
- shifts_routes.py      - مسارات الورديات
- owner_wallet.py       - محفظة المالك
- external_branches.py  - الفروع الخارجية
- order_notifications.py - إشعارات الطلبات
- inventory_system.py   - نظام المخزون

### 📁 موجودة لكن غير مستخدمة (مكررة في server.py):
- auth_routes.py        - مصادقة
- branch_routes.py      - الفروع
- category_routes.py    - التصنيفات
- customer_routes.py    - العملاء
- expense_routes.py     - المصاريف
- product_routes.py     - المنتجات
- table_routes.py       - الطاولات
- user_routes.py        - المستخدمين

### 📄 ملفات مساعدة:
- shared.py             - الدوال المشتركة
- __init__.py           - فهرس الـ package

## الأقسام في server.py:

| القسم | السطر | الحالة |
|-------|-------|--------|
| AUTH ROUTES | 1808 | في server.py |
| USER ROUTES | 1957 | في server.py |
| BRANCH ROUTES | 2126 | في server.py |
| KITCHEN SECTIONS | 2216 | في server.py |
| CATEGORY ROUTES | 2280 | في server.py |
| PRODUCT ROUTES | 2324 | في server.py |
| INVENTORY ROUTES | 2388 | في server.py |
| PURCHASE ROUTES | 2449 | في server.py |
| EXPENSE ROUTES | 2498 | في server.py |
| OPERATING COST | 2594 | في server.py |
| HR ROUTES | 2616 | في server.py |
| COUPONS ROUTES | 3547 | في server.py |
| INVENTORY TRANSFER | 3824 | في server.py |
| PURCHASE REQUEST | 3990 | في server.py |
| TABLE ROUTES | 4083 | في server.py |
| CUSTOMER ROUTES | 4205 | في server.py |
| ORDER ROUTES | 4301 | في server.py |
| REFUND ROUTES | 4853 | في server.py |
| CASH REGISTER | 5786 | في server.py |
| SETTINGS ROUTES | 5933 | في server.py |
| FILE UPLOAD | 7327 | في server.py |
| PRINTER ROUTES | 7546 | في server.py |
| BIOMETRIC DEVICE | 11832 | في server.py |
| LOYALTY PROGRAM | 12065 | في server.py |
| RECIPES | 12377 | في server.py |
| INVOICE ROUTES | 12563 | في server.py |
| PUSH NOTIFICATIONS | 12874 | في server.py |
| DRIVER TRACKING | 14487 | في server.py |
| DRIVER APP | 14684 | في server.py |
| ADDRESS AUTOCOMPLETE | 15016 | في server.py |
| PAYMENT ROUTES | 15089 | في server.py |

## خطة إعادة الهيكلة المقترحة:

### المرحلة 1: فصل المسارات الكبيرة
1. ORDER ROUTES → orders_routes.py
2. HR ROUTES → hr_routes.py
3. SETTINGS ROUTES → settings_routes.py
4. CUSTOMER ROUTES → customer_routes.py (تحديث الموجود)

### المرحلة 2: فصل المسارات المتوسطة
5. INVENTORY ROUTES → inventory_routes.py
6. PRODUCT ROUTES → product_routes.py (تحديث الموجود)
7. EXPENSE ROUTES → expense_routes.py (تحديث الموجود)

### المرحلة 3: باقي المسارات
8-30. باقي الأقسام...

## ملاحظات مهمة:
- يجب اختبار كل مسار بعد فصله
- الاحتفاظ بنسخة احتياطية قبل أي تغيير
- server_backup.py يحتوي على النسخة الأصلية
"""

# This file is for documentation only
# الملفات الفعلية موجودة في server.py و routes/
