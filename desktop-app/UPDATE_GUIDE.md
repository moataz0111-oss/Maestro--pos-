# 🔄 كيفية تحديث تطبيق Maestro POS

## الطريقة 1: التحديث التلقائي (إذا كان مُفعّل)

عند تشغيل التطبيق، سيفحص التحديثات تلقائياً وسيظهر لك إشعار إذا وُجد تحديث جديد.

---

## الطريقة 2: التحديث اليدوي (موصى به حالياً)

### على Mac:

```bash
# 1. أغلق التطبيق تماماً
# 2. احذف الإصدار القديم
rm -rf "/Applications/Maestro POS.app"

# 3. حمّل الكود الجديد
cd ~/Desktop
git clone https://github.com/YOUR_USERNAME/maestro-pos-desktop.git
# أو قم بتنزيل ملف ZIP من emergent

# 4. ادخل مجلد desktop-app
cd maestro-pos-desktop/desktop-app
# أو
cd /path/to/downloaded/desktop-app

# 5. ابنِ التطبيق الجديد
chmod +x build-mac.sh
./build-mac.sh

# 6. ثبّت الإصدار الجديد
open dist/Maestro\ POS-*.dmg
# ثم اسحب التطبيق إلى Applications
```

### على Windows:

```powershell
# 1. أغلق التطبيق تماماً
# 2. من Control Panel > Programs > Uninstall: احذف Maestro POS

# 3. حمّل الكود الجديد
cd C:\Users\YourName\Desktop
git clone https://github.com/YOUR_USERNAME/maestro-pos-desktop.git
# أو قم بتنزيل ملف ZIP

# 4. ادخل مجلد desktop-app
cd maestro-pos-desktop\desktop-app

# 5. ابنِ التطبيق الجديد
build-win.bat

# 6. ثبّت الإصدار الجديد
# شغّل ملف .exe من مجلد dist
```

---

## الطريقة 3: مسح Cache التطبيق (لحل مشكلة الشاشة البيضاء)

إذا كنت تواجه مشكلة الشاشة البيضاء، جرّب مسح البيانات المحلية:

### على Mac:
```bash
# 1. أغلق التطبيق
# 2. احذف بيانات التطبيق
rm -rf ~/Library/Application\ Support/maestro-pos-desktop
rm -rf ~/Library/Caches/maestro-pos-desktop

# 3. أعد تشغيل التطبيق
```

### على Windows:
```powershell
# 1. أغلق التطبيق
# 2. احذف بيانات التطبيق
rmdir /s "%APPDATA%\maestro-pos-desktop"
rmdir /s "%LOCALAPPDATA%\maestro-pos-desktop"

# 3. أعد تشغيل التطبيق
```

---

## إعداد التحديث التلقائي عبر GitHub

لتفعيل التحديث التلقائي، اتبع الخطوات التالية:

### 1. أنشئ مستودع GitHub
- اذهب إلى https://github.com/new
- اسم المستودع: `maestro-pos-desktop`
- اجعله Public

### 2. عدّل package.json
افتح الملف `/desktop-app/package.json` وغيّر:
```json
"publish": {
  "provider": "github",
  "owner": "اسم_المستخدم_الخاص_بك",  // ← غيّر هذا
  "repo": "maestro-pos-desktop"
}
```

### 3. أنشئ GitHub Token
- اذهب إلى: https://github.com/settings/tokens
- انقر "Generate new token (classic)"
- اختر صلاحيات: `repo` و `write:packages`
- احفظ الـ Token في مكان آمن

### 4. انشر التحديث
```bash
# على Mac/Linux
export GH_TOKEN=your_github_token_here
npm run publish:mac

# على Windows (PowerShell)
$env:GH_TOKEN="your_github_token_here"
npm run publish:win
```

### 5. انشر الـ Release
- اذهب إلى GitHub > Releases
- سترى draft release جديد
- انقر "Edit" ثم "Publish release"

### 6. بعد النشر
عندما يفتح المستخدمون التطبيق، سيظهر لهم إشعار بوجود تحديث جديد!

---

## استكشاف مشكلة الشاشة البيضاء

### الأسباب المحتملة:
1. **بيانات قديمة في IndexedDB**: امسح Cache التطبيق
2. **عدم تطابق category_id**: تم إصلاحه في الكود الجديد
3. **منتجات بدون فئة صحيحة**: تحقق من البيانات

### الحل:
1. حدّث التطبيق بآخر نسخة من الكود
2. امسح بيانات التطبيق المحلية
3. سجّل الدخول من جديد

---

## ملاحظة مهمة
الكود الجديد يتضمن:
- ✅ زر "عرض الكل" لإظهار جميع المنتجات
- ✅ مقارنة مرنة لـ category_id
- ✅ Debug logging في Console لتشخيص المشاكل
