# Maestro POS - تطبيق سطح المكتب

## المتطلبات
- Node.js v20 (LTS)
- Yarn أو npm

## التثبيت

```bash
cd desktop-app
npm install
```

## التشغيل (وضع التطوير)

```bash
npm start
```

## بناء ملفات التثبيت

### Windows (يتطلب تشغيل على Windows)
```bash
npm run build:win
```
سينتج ملف `.exe` في مجلد `dist/`

### Mac (يتطلب تشغيل على macOS)
```bash
npm run build:mac
```
سينتج ملف `.dmg` في مجلد `dist/`

### Linux
```bash
npm run build:linux
```
سينتج ملف `.AppImage` في مجلد `dist/`

---

## 🔄 التحديث التلقائي

### إعداد التحديث التلقائي عبر GitHub:

1. **أنشئ مستودع GitHub جديد** باسم `maestro-pos-desktop`

2. **عدّل `package.json`** وغيّر:
   ```json
   "publish": {
     "provider": "github",
     "owner": "YOUR_GITHUB_USERNAME",  ← ضع اسم المستخدم هنا
     "repo": "maestro-pos-desktop"
   }
   ```

3. **أنشئ GitHub Token:**
   - اذهب إلى: https://github.com/settings/tokens
   - انقر "Generate new token (classic)"
   - اختر صلاحيات: `repo`, `write:packages`
   - انسخ الـ Token

4. **انشر تحديث جديد:**
   ```bash
   # على Mac/Linux
   export GH_TOKEN=your_github_token
   npm run publish:mac
   
   # على Windows
   set GH_TOKEN=your_github_token
   npm run publish:win
   ```

5. **اذهب لـ GitHub Releases** وانشر الإصدار

### كيف يعمل التحديث؟
- عند تشغيل التطبيق، يفحص التحديثات تلقائياً
- إذا وُجد تحديث، يُنبّه المستخدم
- المستخدم يختار "تحميل" أو "لاحقاً"
- بعد التحميل، يسأل عن إعادة التشغيل للتثبيت

---

## الإعداد الأولي

عند تشغيل التطبيق لأول مرة:
1. ستظهر صفحة الإعداد
2. أدخل رابط السيرفر (مثل: `https://your-domain.com`)
3. سجل الدخول ببيانات حسابك
4. سيتم حفظ البيانات محلياً

## الميزات

### ✅ العمل بدون إنترنت
- حفظ الطلبات محلياً
- مزامنة تلقائية عند عودة الاتصال
- عرض البيانات المخزنة محلياً

### ✅ قارئ الباركود
- دعم قارئات USB HID
- يعمل تلقائياً بدون إعداد
- إضافة المنتج للطلب فوراً

### ✅ الطباعة
- طباعة الفواتير
- طباعة طلبات المطبخ
- دعم طابعات متعددة

### ✅ نظام الترخيص
- التحقق عند بدء التشغيل
- فترة سماح 24 ساعة للعمل offline
- إدارة الأجهزة من Super Admin

### ✅ التحديث التلقائي
- فحص التحديثات عند التشغيل
- تحميل التحديثات في الخلفية
- تثبيت سهل بضغطة زر

## هيكل الملفات

```
desktop-app/
├── main.js              # العملية الرئيسية
├── preload.js           # جسر الاتصال مع الواجهة
├── package.json         # الاعتماديات والإعدادات
├── src/
│   ├── database.js      # قاعدة البيانات المحلية (SQLite)
│   ├── sync-manager.js  # إدارة المزامنة
│   ├── printer-manager.js # إدارة الطابعات
│   ├── license-manager.js # إدارة الترخيص
│   ├── barcode-scanner.js # قارئ الباركود
│   ├── auto-updater.js  # التحديث التلقائي
│   ├── zkteco-manager.js # جهاز البصمة
│   └── views/
│       ├── setup.html   # صفحة الإعداد
│       └── offline.html # صفحة عدم الاتصال
└── assets/
    └── icon.*           # أيقونات التطبيق
```

## استكشاف الأخطاء

### التطبيق لا يعمل
```bash
electron . --enable-logging
```

### مشاكل التحديث
- تأكد من وجود `GH_TOKEN` صحيح
- تأكد من نشر الإصدار على GitHub Releases
- تحقق من اتصال الإنترنت

## الدعم

للمساعدة أو الإبلاغ عن مشاكل، تواصل مع فريق الدعم.
