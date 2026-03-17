# Maestro POS - تطبيق سطح المكتب

## المتطلبات
- **Node.js v20 (LTS)** - مهم جداً! الإصدارات الأحدث قد تسبب مشاكل
- Yarn أو npm

### تثبيت Node.js v20 على Mac:
```bash
# باستخدام Homebrew
brew install node@20
export PATH="/usr/local/opt/node@20/bin:$PATH"

# أو باستخدام nvm
nvm install 20
nvm use 20
```

---

## 🚀 بناء التطبيق على Mac

### الطريقة السهلة (موصى بها):
```bash
cd desktop-app
chmod +x build-mac.sh
./build-mac.sh
```

سيقوم السكريبت تلقائياً بـ:
1. ✓ إنشاء أيقونة `.icns` من `icon.png`
2. ✓ تثبيت الاعتماديات
3. ✓ بناء ملف `.dmg`

### الطريقة اليدوية:

**الخطوة 1: إنشاء أيقونة Mac**
```bash
cd desktop-app
chmod +x create-mac-icon.sh
./create-mac-icon.sh
```

**الخطوة 2: تثبيت الاعتماديات**
```bash
yarn install
# أو
npm install
```

**الخطوة 3: بناء التطبيق**
```bash
yarn build:mac
# أو
npm run build:mac
```

**النتيجة:**
ملف `.dmg` في مجلد `dist/`

---

## 🪟 بناء التطبيق على Windows

```bash
cd desktop-app
build-win.bat
```

أو يدوياً:
```bash
npm install
npm run build:win
```

**النتيجة:**
ملف `.exe` في مجلد `dist/`

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
   
   # على Windows (PowerShell)
   $env:GH_TOKEN="your_github_token"
   npm run publish:win
   
   # على Windows (CMD)
   set GH_TOKEN=your_github_token
   npm run publish:win
   ```

5. **اذهب لـ GitHub Releases** وانشر الإصدار (Draft → Publish)

### كيف يعمل التحديث؟
- عند تشغيل التطبيق، يفحص التحديثات تلقائياً
- إذا وُجد تحديث، يُنبّه المستخدم
- المستخدم يختار "تحميل" أو "لاحقاً"
- بعد التحميل، يسأل عن إعادة التشغيل للتثبيت

---

## 🛠️ استكشاف الأخطاء

### ❌ خطأ "better-sqlite3" أثناء التثبيت
```
error: gyp ERR! build error
```
**الحل:**
```bash
# تأكد من استخدام Node.js v20
node -v  # يجب أن يكون v20.x.x

# على Mac، ثبت أدوات التطوير
xcode-select --install

# أعد تثبيت الاعتماديات
rm -rf node_modules
npm install
```

### ❌ أيقونة التطبيق لا تظهر
**الحل:**
```bash
# تأكد من وجود الأيقونة
ls assets/icon.icns

# إذا لم تكن موجودة، أنشئها
./create-mac-icon.sh
```

### ❌ خطأ "Cannot find module"
**الحل:**
```bash
rm -rf node_modules
rm package-lock.json
npm install
```

### ❌ التطبيق لا يعمل
```bash
# تشغيل مع السجلات
electron . --enable-logging
```

---

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

---

## هيكل الملفات

```
desktop-app/
├── main.js              # العملية الرئيسية
├── preload.js           # جسر الاتصال مع الواجهة
├── package.json         # الاعتماديات والإعدادات
├── build-mac.sh         # سكريبت بناء Mac
├── build-win.bat        # سكريبت بناء Windows
├── create-mac-icon.sh   # إنشاء أيقونة Mac
├── src/
│   ├── database.js      # قاعدة البيانات المحلية (SQLite)
│   ├── sync-manager.js  # إدارة المزامنة
│   ├── printer-manager.js # إدارة الطابعات
│   ├── license-manager.js # إدارة الترخيص
│   ├── barcode-scanner.js # قارئ الباركود
│   ├── auto-updater.js  # التحديث التلقائي
│   ├── zkteco-manager.js # جهاز البصمة (placeholder)
│   └── views/
│       ├── setup.html   # صفحة الإعداد
│       └── offline.html # صفحة عدم الاتصال
└── assets/
    ├── icon.png         # الأيقونة الأصلية
    ├── icon.icns        # أيقونة Mac (تُنشأ تلقائياً)
    └── icon.ico         # أيقونة Windows
```

---

## الإعداد الأولي

عند تشغيل التطبيق لأول مرة:
1. ستظهر صفحة الإعداد
2. أدخل رابط السيرفر (مثل: `https://maestro-pos-3.preview.emergentagent.com`)
3. سجل الدخول ببيانات حسابك
4. سيتم حفظ البيانات محلياً

---

## الدعم

للمساعدة أو الإبلاغ عن مشاكل، تواصل مع فريق الدعم.
