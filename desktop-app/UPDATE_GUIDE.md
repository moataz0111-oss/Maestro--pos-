# 🔄 دليل تحديث Maestro POS Desktop

## إصلاح مشكلة الشاشة البيضاء

### الطريقة 1: من داخل التطبيق (الأسهل)

**على Mac:**
1. افتح التطبيق
2. من شريط القوائم: **Maestro POS** → **🧹 مسح البيانات المؤقتة**
3. أو اضغط: `Cmd + Shift + Delete`

**على Windows:**
1. افتح التطبيق
2. من شريط القوائم: **Maestro POS** → **🧹 مسح البيانات المؤقتة**
3. أو اضغط: `Ctrl + Shift + Delete`

**من أيقونة System Tray:**
1. انقر بزر الماوس الأيمن على أيقونة التطبيق في شريط المهام
2. اختر **🧹 مسح البيانات المؤقتة**

---

### الطريقة 2: مسح البيانات يدوياً

**على Mac:**
```bash
# 1. أغلق التطبيق تماماً

# 2. احذف بيانات التطبيق
rm -rf ~/Library/Application\ Support/maestro-pos-desktop
rm -rf ~/Library/Caches/maestro-pos-desktop

# 3. أعد فتح التطبيق
```

**على Windows (PowerShell):**
```powershell
# 1. أغلق التطبيق تماماً

# 2. احذف بيانات التطبيق
Remove-Item -Recurse -Force "$env:APPDATA\maestro-pos-desktop"
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\maestro-pos-desktop"

# 3. أعد فتح التطبيق
```

**على Windows (CMD):**
```cmd
:: 1. أغلق التطبيق تماماً

:: 2. احذف بيانات التطبيق
rmdir /s /q "%APPDATA%\maestro-pos-desktop"
rmdir /s /q "%LOCALAPPDATA%\maestro-pos-desktop"

:: 3. أعد فتح التطبيق
```

---

### الطريقة 3: تحديث التطبيق بالكامل

**الخطوات:**
1. حمّل الكود الجديد من Emergent (زر Download)
2. فك الضغط عن الملف
3. ادخل مجلد `desktop-app`

**على Mac:**
```bash
cd desktop-app
chmod +x build-mac.sh
./build-mac.sh
```

**على Windows:**
```cmd
cd desktop-app
build-win.bat
```

4. ثبّت التطبيق الجديد من مجلد `dist/`

---

## 🚀 التحديث التلقائي عبر GitHub

### إعداد لمرة واحدة:

**1. أنشئ مستودع GitHub:**
- اذهب إلى: https://github.com/new
- اسم المستودع: `maestro-pos-desktop`
- اجعله **Public**

**2. عدّل `package.json`:**
```json
"publish": {
  "provider": "github",
  "owner": "اسم_المستخدم_الخاص_بك",  // ← غيّر هذا
  "repo": "maestro-pos-desktop"
}
```

**3. أنشئ GitHub Token:**
- اذهب إلى: https://github.com/settings/tokens
- انقر **Generate new token (classic)**
- اختر صلاحيات: `repo` و `write:packages`
- احفظ الـ Token

### نشر تحديث جديد:

**على Mac/Linux:**
```bash
export GH_TOKEN=your_github_token_here
npm run publish:mac
```

**على Windows (PowerShell):**
```powershell
$env:GH_TOKEN="your_github_token_here"
npm run publish:win
```

**بعد النشر:**
1. اذهب إلى GitHub → Releases
2. سترى draft release جديد
3. انقر **Edit** ثم **Publish release**

### كيف يعمل التحديث؟
- عند فتح التطبيق، يفحص التحديثات تلقائياً
- إذا وُجد تحديث، يظهر إشعار للمستخدم
- المستخدم يختار "تحميل" أو "لاحقاً"
- بعد التحميل، يسأل عن إعادة التشغيل

---

## ⚠️ استكشاف الأخطاء

### مشكلة: الشاشة البيضاء عند اختيار الفئات
**السبب:** بيانات قديمة في IndexedDB
**الحل:** استخدم أي من طرق مسح البيانات أعلاه

### مشكلة: التطبيق لا يفتح
**الحل:**
```bash
# على Mac
rm -rf ~/Library/Application\ Support/maestro-pos-desktop

# على Windows
rmdir /s /q "%APPDATA%\maestro-pos-desktop"
```

### مشكلة: أيقونة التطبيق غير صحيحة
**الحل:** أعد بناء التطبيق بالكامل

---

## 📱 اختصارات لوحة المفاتيح

| الاختصار | الوظيفة |
|---------|---------|
| `Cmd/Ctrl + R` | إعادة تحميل الصفحة |
| `Cmd/Ctrl + Shift + Delete` | مسح البيانات المؤقتة |
| `Cmd/Ctrl + Shift + I` | أدوات المطور |
| `Cmd/Ctrl + +` | تكبير |
| `Cmd/Ctrl + -` | تصغير |
| `Cmd/Ctrl + 0` | حجم افتراضي |
| `F11` / `Cmd + Ctrl + F` | ملء الشاشة |
