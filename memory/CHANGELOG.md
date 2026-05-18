# Maestro EGP - Changelog


## Session: Feb 17, 2026 — Fix: زر "مزامنة الوصفة" لا يطبّق أي تغيير فعلي

### المتطلب/البلاغ
المستخدم لاحظ أن toast يظهر "تمت مزامنة الوصفة بنجاح (1.0000x)" — العامل 1.0x يعني **لا تغيير**. الكميات والقيمة المالية لا تنخفض رغم وجود فرق واضح بين العائد المحسوب (496 حبة) والكمية المُصنّعة (200 حبة).

### السبب الجذري
دالة `syncRecipeToProducedQty` كانت تستخدم منطقاً قديماً لحساب `calcYield`:
- `_W` (خريطة الأوزان) لم تحوِ على وحدات قطعية (`علبة/كرتون/قطعة`)
- لم تكن تستخدم `pack_info` من المواد الخام
- النتيجة: `totalGrams` يتجاهل المكونات بـ "علبة" حتى مع تعريف pack → `calcYield = 200` (مساوية للكمية الفعلية) → `scale = 200/200 = 1.0x` → لا تغيير

**شريط العرض** كان يحسب 496 (بعد الإصلاح السابق) لكن **دالة المزامنة** كانت لا تزال تستخدم الـ logic القديم → عدم اتساق.

### الحل
**Frontend** — `/app/frontend/src/pages/WarehouseManufacturing.js`:
- إعادة كتابة `syncRecipeToProducedQty` لتستخدم نفس منطق شريط العرض:
  - توسيع `_W` ليشمل مل/لتر
  - إضافة `_COUNT` set + lookup من `rawMaterials` لـ pack_info للوحدات القطعية
- إضافة early-return ذكي: إذا `Math.abs(scale - 1.0) < 0.0001` → toast.info "الوصفة متطابقة — لا حاجة للمزامنة" (بدلاً من تطبيق scaling عديم الفائدة).

### الاختبار: ✅
محاكاة JS للسيناريو:
- وصفة بـ 7 مكونات (3 منها بـ علبة/قطعة مع pack_info) → `totalGrams = 11720غ` → `calcYield ≈ 390` → عند `targetQty = 200`: `scale = 0.5119x` (ليس 1.0).
- المكونات تُخفّض فعلياً: مثلاً موزاريلا من 2.4 → 1.23 كغم.

### الفائدة
- زر "مزامنة الوصفة" يعمل الآن بدقة: يُقلّص كل المكونات بنفس النسبة + الكلفة المالية تنخفض تلقائياً.
- إذا الوصفة متطابقة بالفعل → رسالة info واضحة (لا scaling زائف).
- اتساق كامل بين شريط العرض ودالة المزامنة.

---


## Session: Feb 17, 2026 — Critical Fix: Pack-aware Recipe Yield Calculation

### المتطلب/البلاغ
المستخدم لاحظ أن النظام يضرب كميات وصفته في ~2.4x تلقائياً عند إضافة كمية إنتاج. السبب: حساب `total_grams` كان يتجاهل العلب/الكراتين تماماً (حتى مع تعريف pack_info)، فيُحسب العائد بشكل أقل من الواقع، ثم الـ auto-scaling يضرب الكميات لتعويض الفرق → بيانات الوصفة الأصلية تُفقد.

### السبب الجذري
في `Produce` و `Add Stock` كان:
```python
_UNIT_WEIGHT = {"غرام": 1, "كغم": 1000, ...}  # لا يحوي علبة/كرتون/قطعة
for ing in recipe:
    f = _UNIT_WEIGHT.get(ing.get("unit"))
    if f: total_grams += quantity * f  # المكونات بـ علبة → تُتجاهل!
```
مثال المستخدم: 1 علبة فطر (1500غ) + 1 كغم موزاريلا + 1 كغم كريمي + 0.5 كغم بصل + 1 كغم بقصم = **5000غ**، لكن النظام كان يحسب 2500غ فقط (تجاهل الـ علبة) → 83 قطعة بدلاً من 166.

### الحل

**Backend** — `/app/backend/routes/inventory_system.py`:
- إضافة helpers موحّدة في رأس الملف:
  - `_UNIT_WEIGHT_MAP` (يشمل غرام/كغم/مل/لتر بمعاملاتها)
  - `_COUNT_UNITS = {"قطعة","حبة","علبة","كرتون","صحن","piece"}`
  - `_ingredient_weight_grams(db, ing)` async — يبحث عن pack_info للوحدات القطعية ويحوّل إلى غرام عبر `pack_quantity * pack_unit_factor`.
  - `_compute_recipe_total_grams(db, recipe)` async — يجمع وزن كل المكونات.
- استبدال logic `total_grams` في:
  - دالة `produce_manufactured_product` (احتساب calculated_yield)
  - دالة `add_stock_to_manufactured_product` (مزامنة الوصفة)

**Frontend** — `/app/frontend/src/pages/WarehouseManufacturing.js`:
- توسيع `_W` ليشمل مل/لتر.
- إضافة `_COUNT` set + lookup من `rawMaterials` لـ pack_info عند مواجهة وحدة قطعية.
- النتيجة: شريط "العائد المحسوب" يعرض الرقم الصحيح فوراً.

### الاختبار: ✅
ملف جديد `/app/backend/tests/test_recipe_total_grams_pack_aware.py`:
1. **سيناريو المستخدم بالضبط**: 1 علبة (1500غ) + 4×1كغم + 0.5 كغم = **5000غ** → 166.67 قطعة ✓
2. **مكوّن بدون pack_info**: يُرجع 0 (آمن، لا يكسر) ✓
3. **خلط 5 وحدات** (غرام/كغم/مل/لتر/علبة): جميعها تُحسب بدقة ✓

### الفائدة
- لا مزيد من auto-scaling غير المرغوب فيه: الوصفة تنتج الكمية الصحيحة من المرة الأولى.
- المستخدم يرى العائد الحقيقي (166 قطعة بدلاً من 83) فور تعريفه pack_info.
- بيانات الوصفة الأصلية تبقى محفوظة (لا تُغيَّر دون وعي المستخدم).
- التقارير المالية أدق (تكلفة الحبة = batch_cost / yield الحقيقي).

---


## Session: Feb 17, 2026 — Fix: Consistency Between Sales Report & Cash Close Report

### المتطلب/البلاغ
المستخدم لاحظ تناقضاً في تقارير فرع السيدية:
- **تقرير المبيعات**: يعرض "معلق: 5,000 IQD" تحت "حسب طريقة الدفع"
- **تقرير إغلاق الصندوق**: لا يعرض أي طلب معلق

السبب: "معلق" ليس طريقة دفع فعلية (الطلب لم يُدفع بعد). تقرير إغلاق الصندوق محقّ في استبعاده، لكن تقرير المبيعات كان يدمجه ضمن `by_payment_method`.

### الحل
**Backend** (`/app/backend/routes/reports_routes.py` + `/app/backend/server.py`):
- إزالة `by_payment["معلق"] = pending_total` من كلا endpoints:
  - `/api/reports/sales` (في `reports_routes.py`)
  - `/api/smart-reports/sales` (في `server.py`)
- إضافة حقل جديد منفصل في الاستجابة:
  ```json
  "pending_orders_summary": {"count": 9, "amount": 80000}
  ```
- النتيجة: `sum(by_payment_method.values()) == total_sales` (متطابق مع تقرير إغلاق الصندوق).

**Frontend** — `/app/frontend/src/pages/Reports.js`:
- إضافة بطاقة تنبيه (banner أصفر) داخل قسم "حسب طريقة الدفع" تعرض `pending_orders_summary.count` + `amount` فقط عند `count > 0`.
- العنصر بـ `data-testid="pending-orders-banner"`.
- النص: `⚠️ طلبات معلقة (لم تُحتسب كمبيعات): X — Y IQD`.

### الاختبار: ✅
- **Backend curl**: `/api/reports/sales` يُرجع الآن `{"by_payment_method": {"نقدي": 470210}, "pending_orders_summary": {"count": 9, "amount": 80000}, "total_sales": 470210}` ← المعلق منفصل + المجموع متطابق.
- **pytest**: `test_pending_orders_separated.py`:
  1. "معلق" غير موجود في by_payment_method ✓
  2. pending_orders_summary مُعبّأ صحيحاً ✓
  3. total_sales == sum(by_payment_method) ✓

### الفائدة
- التقريران الآن متطابقان تماماً في الحسابات.
- المالك يرى الطلبات المعلّقة بوضوح (banner مميّز) دون أن تُربك حسابات الدخل.
- "حسب طريقة الدفع" يعكس الآن فقط المبالغ المُحصَّلة فعلياً.

---


## Session: Feb 17, 2026 — Bugfix: علبة/كرتون مفقودة من _UNIT_GROUPS تمنع التحويل بـ pack info

### المتطلب/البلاغ
المستخدم عرّف "1 علبة فطر = 4 كغم" في pack info، لكن عند إضافة المكون للوصفة، النظام لم يقبل الإدخال بالكيلو/الغرام — كان يعرض "علبة" فقط كوحدة إدخال.

### السبب الجذري (Root Cause)
في `_UNIT_GROUPS.count` كان يحوي فقط `{قطعة, حبة, piece}`. الوحدات `علبة` و `كرتون` و `صحن` كانت **مفقودة**. النتيجة:
- `_findUnitGroup("علبة")` → يُرجع `null`
- `availableInputUnitsFor("علبة", "كغم")` → يدخل في فرع fallback ويُرجع `["علبة"]` فقط (الـ select لا يظهر)
- `convertWithPackInfo(..., 'علبة', ...)` يفشل لأن `_findUnitGroup` لم يميّز "علبة"

### الحل
**Frontend — `/app/frontend/src/pages/WarehouseManufacturing.js`**:
- إضافة `'علبة': 1, 'كرتون': 1, 'صحن': 1` إلى `_UNIT_GROUPS.count`.
- إضافة pack-info inline panel أيضاً في dialog **تعديل الوصفة** (`editNewIngredient`) — كان موجوداً فقط في dialog الإنشاء. الآن يظهر panel أصفر مع زر "حفظ" أو panel أخضر مع زر "تعديل" حسب وجود pack info.

### الاختبار: ✅
- ملف جديد `/app/frontend/src/__tests__/pack_unit_conversion.test.js` يختبر:
  1. `_findUnitGroup('علبة') === 'count'` ✓
  2. `_findUnitGroup('كرتون') === 'count'` ✓
  3. `availableInputUnitsFor('علبة', 'كغم')` تتضمن `غرام/كغم` ✓
  4. `2 كغم → 0.5 علبة` (pack=4كغم) ✓
  5. `500 غرام → 0.125 علبة` ✓
  6. `8 كغم → 2 علب` ✓
  7. `1 لتر → 0.5 علبة` (للسوائل) ✓
  8. عائلات مختلفة (كغم vs قطعة) → `null` ✓
- Lint: ✅ no issues.

### الفائدة
الآن المستخدم يستطيع:
1. تعريف "1 علبة فطر = 4 كغم" inline من شاشة الوصفة (الميزة المُضافة في الجلسة السابقة).
2. **الإدخال بالكيلو/الغرام** في الكمية والنظام يخصم الجزء المناسب من العلبة تلقائياً.

---


## Session: Feb 17, 2026 — Editable Names in Recipe & Raw Material Correction Dialogs

### المتطلب
في dialogs التعديل، الاسم كان للقراءة فقط (يظهر في العنوان). المطلوب إضافة حقل قابل للتعديل في:
1. Dialog "تعديل وصفة منتج مصنّع"
2. Dialog "تصحيح إداري — مادة خام"

### الحل

**Backend**:
- `/app/backend/routes/inventory_system.py`:
  - `ManufacturedProductRecipeUpdate` model: أضفت حقلَي `name` و `name_en` (اختياريَين).
  - `update_manufactured_product_recipe`: إذا أُرسل `name` (مع `.strip()` ≠ فارغ) → يُحدّث `update_fields["name"]`. مماثل لـ `name_en`.
  - `admin_correct_raw_material`: أضفت `_set_if("name", ...)` و `_set_if("name_en", ...)` → يُسجَّل التغيير في `diff_log` لسجل المراجعة.

**Frontend** — `/app/frontend/src/pages/WarehouseManufacturing.js`:
- `editRecipeForm` state: أضفت `name` و `name_en` كقيم افتراضية فارغة.
- `openEditRecipe(product)`: pre-fill يأخذ `product.name` و `product.name_en`.
- `handleUpdateRecipe`: payload يرسل `name` و `name_en` (مع `undefined` لو فارغ كي لا يكسر validation).
- Dialog UI: أضفت grid من حقلين (الاسم العربي/الإنجليزي) أعلى نموذج الوزن.
- `setAdminCorrection({...})`: pre-fill يأخذ `material.name` و `material.name_en`.
- Admin correction dialog UI: أضفت grid مماثل (الاسم العربي/الإنجليزي) أسفل التحذير.
- POST لـ admin-correct: يرسل `name` و `name_en` (مع `.trim() || undefined`).

### الاختبار: ✅ Backend curl
- `POST /api/raw-materials-new/{id}/admin-correct` مع `name: "اختبار_تعديل_اسم"` → نجح + `diff_log` يحفظ `{old, new}`.
- `PATCH /api/manufactured-products/{id}/recipe` مع `name: "اختبار_تعديل_وصفة"` → نجح + المنتج تحدّث اسمه.
- إعادة الأسماء الأصلية بعد الاختبار.
- Lint: ✅ no issues على الـ Python و JS.

### الفوائد
- المستخدم يستطيع تصحيح أخطاء التسمية مباشرة من dialog التعديل (بدلاً من فتح نموذج تعديل المادة الكامل).
- كل تغيير في اسم المادة يُسجَّل في `diff_log` لـ audit trail.

---


## Session: Feb 17, 2026 — Inline Pack Info Editor (تعريف محتوى العلبة/الكرتون)

### المتطلب
عند إضافة مادة خام للوصفة بوحدة "علبة" (مثل جبن شيدر = 6 علب)، المستخدم لا يستطيع إدخال الكمية بالغرام لأن النظام لا يعرف محتوى العلبة. يحتاج تعريف "1 علبة = X غرام" ثم يحول النظام تلقائياً.

### الحل

**Backend — `/app/backend/server.py`**:
- توسيع `allowed_fields` في endpoint `PUT /api/raw-materials/{material_id}` لقبول `pack_quantity`, `pack_unit`, `waste_percentage`. هذا يسمح بتحديث معلومات التعبئة inline من شاشة الوصفة دون فتح نموذج تعديل المادة الكامل.

**Frontend — `/app/frontend/src/pages/WarehouseManufacturing.js`**:
- إضافة state جديد `packInfoEdit` لإدارة بيانات تحرير محتوى العلبة.
- إضافة دالة `savePackInfo()` تستدعي `PUT /raw-materials/{id}` ثم تعيد جلب البيانات لتحديث الوحدات المتاحة.
- إضافة inline panel أصفر في قسم الوصفة يظهر تلقائياً عند اختيار مادة وحدتها "علبة" أو "كرتون":
  - إذا كان pack info موجوداً → يعرض `✓ 1 علبة = 500 غرام` مع زر "تعديل"
  - إذا كان pack info مفقوداً → يعرض إدخال: `1 علبة = [قيمة] [غرام/كغم/مل/لتر/قطعة]` + زر "حفظ"
- بعد الحفظ، تظهر تلقائياً وحدات الإدخال الإضافية (غرام/كغم/مل/لتر) في select وحدة المكون → المستخدم يستطيع إدخال "200 غرام" والنظام يحول تلقائياً إلى 0.4 علبة عند الخصم.
- استيراد الأيقونات الجديدة: `Edit`, `Check`, `AlertCircle` من lucide-react.

### الفائدة
- المستخدم يستطيع الآن تعريف محتوى أي علبة/كرتون **inline** بدون مغادرة شاشة الوصفة.
- الإدخال يصبح بأي وحدة منطقية (غرام/كيلو/مل/لتر/قطعة) والتحويل يحدث تلقائياً.
- مثال عملي: جبن شيدر (6 علب)، تعريف 1 علبة = 500 غرام → في الوصفة يمكن إدخال "200 غرام جبن" وسيخصم 0.4 علبة عند التصنيع.

### الاختبار: ✅
- Lint passed.
- Backend tested via curl: `PUT /raw-materials/{id}` مع `pack_quantity:500, pack_unit:"غرام"` → استجابة 200 + الحقول محفوظة.
- Screenshot Verified: dialog "إضافة منتج مصنع" يفتح بسلاسة، قسم الوصفة جاهز لاستقبال المواد وعرض pack panel.

---


## Session: Feb 16, 2026 — Global Safe Error Handler + Clickable Details Modal

### المتطلبات
1. **Bug Critical المستمر**: حتى بعد إصلاح `WarehouseManufacturing.js`، الـ React Error #31 ظهر مجدداً في صفحات أخرى لأن نمط `toast.error(error.response?.data?.detail || ...)` كان مستخدماً في **22+ ملف**.
2. **Enhancement (Suggestion implementation)**: المستخدم وافق على المقترح: toast مع زر "عرض التفاصيل" يفتح modal يعرض الحقول الناقصة بصيغة منظمة.

### الحل

**`/app/frontend/src/utils/apiError.js`** (جديد):
- `safeErrorMessage(error, fallback)`: يستخرج نصاً واحداً من خطأ axios/FastAPI:
  - string detail → return as-is
  - array (Pydantic v2) → join `.msg` strings
  - object → extract `.msg` or `.message`
  - else → fallback
- `showApiError(error, fallback)`: يعرض toast.error مع زر action "عرض التفاصيل":
  - يطلق `CustomEvent('maestro:show-api-error-details')` مع `{title, status, rows, rawDetail}`
  - rows: مصفوفة مُسوّاة `{field, msg, type, input}` لكل خطأ Pydantic
  - يتعامل مع `insufficient_materials` أيضاً (تنسيق خاص: مطلوب X — متوفر Y)
- إذا لم تتوفر تفاصيل (نص مفرد فقط) → يعرض toast بدون زر تفاصيل

**`/app/frontend/src/components/ApiErrorModal.jsx`** (جديد):
- يستمع للحدث ويفتح Dialog عند استلامه
- يعرض جدول RTL: **الحقل | الخطأ | النوع** بألوان (الحقل أصفر mono، النوع رمادي صغير)
- شارة HTTP status (مثل: HTTP 422) بجانب العنوان
- قسم قابل للطي "عرض البيانات الخام (JSON)" للمطوّرين
- زر "نسخ التفاصيل" (Clipboard API) مع feedback بصري
- زر "إغلاق"

**`/app/frontend/src/App.js`**:
- استيراد `ApiErrorModal` ووضعه في شجرة المكونات (بجانب `PostLoginSplash` و `StartupSplash`).

**الاستبدال الشامل في 22 ملف**:
- سكريبت Python يستبدل جميع `toast.error(error.response?.data?.detail || t('...'))` و variants (err., err?.) بـ `showApiError(error, ...)`.
- يضيف `import { showApiError } from '...utils/apiError'` تلقائياً (مع إصلاح multi-line imports).
- الملفات المعدّلة: Purchasing, Dashboard, CustomerMenu, OwnerWallet, Orders, BranchOrders, Coupons, HR, PriceIncreaseReport, SystemAdmin, Delivery, Inventory, ExternalBranchesManagement, WarehouseTransfers, PurchasesPage, Settings, Loyalty, POS, Tables, Expenses, WarehouseManufacturing, BiometricDevices, ImageUploader.

### الاختبار: ✅ Screenshot Verified
- اختبار 1: dispatchEvent يدوياً للـ Modal بـ 3 أخطاء Pydantic v2 (`name=missing`, `piece_weight=value_error`, `recipe.0.quantity=greater_than`) → Modal يظهر مع جدول كامل مرتّب.
- اختبار 2: SplashScreen + Login + الـ Modal كلها تعمل بدون أي compilation error.
- Lint: ✅ No issues على كل من `pages/` و `components/`.

### الفوائد
- **لا مزيد من React Error #31** على أي صفحة في التطبيق (حماية شاملة).
- **UX احترافي**: الكاشير يرى رسالة مختصرة + زر "عرض التفاصيل" يكشف بالضبط أي حقل فشل ولماذا.
- **Debugging سريع**: زر "نسخ التفاصيل" ينسخ JSON الخام لإرساله للدعم.
- **توحيد**: نمط واحد للأخطاء عبر التطبيق كله، سهل الصيانة.

---


## Session: Feb 16, 2026 — Fix React Crash #31 + Gram/Portion UX

### المتطلبات
1. **Bug Critical**: عند إنشاء منتج مُصنّع بوحدة "غرام" + إدخال مواد، الصفحة كانت تنهار مع `React Error #31` (الكائن `{type, loc, msg, input, url}` يُمرَّر كطفل React).
2. **UX**: عند اختيار وحدة "غرام" (أو أي وحدة)، يجب على النظام إظهار:
   - "وزن البورشن الواحد كم غرام"
   - حساب فوري: "الكيلو = X بورشن"

### الحل

**Bug Fix — `WarehouseManufacturing.js`**:
- إضافة helper `safeDetail(error, fallback)` يستخرج رسالة الخطأ بأمان من استجابة FastAPI:
  - إذا كان `detail` نصاً → يُعيده مباشرة
  - إذا كان مصفوفة Pydantic v2 errors → يستخرج `.msg` من كل عنصر ويدمجها
  - إذا كان كائناً → يقرأ `.msg` أو `.message`
- استبدال **21 استدعاء** unsafe لـ `toast.error(error.response?.data?.detail || ...)` بـ `safeDetail()`.
- استبدال **3 استدعاءات** `toast.error(detail || ...)` بنفس الـ helper.
- النتيجة: لا مزيد من crashes عند رد الـ Backend بأخطاء validation.

**UX Enhancement — حقل وزن البورشن لكل الوحدات**:
- إعادة كتابة قسم "وزن القطعة" ليعمل مع **كل** الوحدات (قطعة/حبة/صحن/غرام/كغم/مل/لتر) بدلاً من 3 فقط.
- تسميات ذكية حسب نوع الوحدة:
  - وحدات قطعية → "وزن القطعة الواحدة (اختياري)"
  - وحدات وزنية → "وزن البورشن الواحد"
  - وحدات حجمية → "حجم البورشن الواحد"
- **عرض فوري** أسفل الحقل: `⭐ الكيلو = X بورشن` (أو اللتر للحجوم) — يُحدَّث مباشرة عند الكتابة.
- نفس التحسين طُبّق على dialog تعديل الوصفة (`editRecipeForm`).

### الاختبار: ✅
- Lint passed.
- Screenshot Verified: الصفحة الآن تُحمّل بدون أي crash بعد التعديلات.

### الفوائد
- لا يمكن للصفحة أن تنهار بسبب أخطاء validation من الـ Backend.
- المستخدم يفهم العلاقة بين وحدات القياس بصرياً (1 كيلو = 10 بورشن من 100 غرام).
- تحويل تلقائي بين أنظمة القياس (غرام↔كغم، مل↔لتر).

---


## Session: Feb 16, 2026 — Multi-Mfg-Link + Receipt Branding Overhaul

### المتطلبات
1. **ربط متعدد للمنتجات المُصنّعة**: المنتج الواحد (مثل برجر) كان يقبل ربط منتج مُصنّع واحد فقط. المطلوب دعم ربط أكثر من منتج مُصنّع (لحم + خبز + صوص) مع كميات استهلاك مستقلّة لكل واحد.
2. **تحديث الفاتورة المطبوعة**: استبدال الشعار القديم بشعار M السداسي الجديد + خط ذهبي تحت اسم النظام + تكبير QR Code (كان غير قابل للمسح).

### الحل

**Backend — `/app/backend/server.py`**:
- إضافة حقل `manufactured_links: List[Dict[str, Any]]` على نموذجَي `ProductCreate` و `ProductResponse`. كل عنصر: `{manufactured_product_id, consumption_qty, ...}`.
- تحديث منطق احتساب التكلفة في `create_order` ليجمع تكاليف **كل** المنتجات المُصنّعة المربوطة (sum of `unit_cost × consumption_qty`).
- تحديث منطق خصم المخزون في `create_order` ليخصم من **كل** منتج مُصنّع بكميته المحددة.
- تحديث الـ cost recompute في endpoint تعديل الطلب بنفس المنطق.
- **Backward compatibility**: إذا لم يكن `manufactured_links` موجوداً، يستخدم الحقل القديم `manufactured_product_id` تلقائياً (لا يكسر بيانات قديمة).

**Frontend — `/app/frontend/src/pages/Settings.js`**:
- مكوّن جديد `MfgLinksEditor` (داخل Settings) — يعرض قائمة الروابط مع:
  - Select لاختيار المنتج المُصنّع (يخفي المنتجات المرتبطة مسبقاً لتجنّب التكرار)
  - Input للكمية المستهلكة لكل بيع
  - عرض تكلفة الوحدة + تكلفة هذا المكوّن (مباشرة)
  - زر حذف لكل صفّ
  - صفّ "إجمالي تكلفة المنتج النهائي" (مجموع كل المكونات)
  - زر **"+ إضافة منتج مُصنّع آخر"** يضيف صفّاً جديداً
- استبدال القسم القديم (single-link) بـ `<MfgLinksEditor>` في نموذجَي **الإضافة** و **التعديل**.
- مزامنة `manufactured_product_id` القديم تلقائياً للحفاظ على التوافق مع الـ Backend.

**Frontend — `/app/frontend/src/utils/receiptBitmap.js`**:
- دالة جديدة `drawMaestroHexLogo(ctx, cx, cy, size)` ترسم شعار M السداسي مباشرة على Canvas (vector-style، أبيض/أسود قابل للطباعة الحرارية).
- استبدال تحميل `system_logo_url` القديم بهذه الدالة → الفاتورة تعرض الشعار الجديد دائماً (بدون اعتماد على شعار مرفوع من المالك).
- إضافة خط أسود رفيع (180×2 px) تحت "Maestro EGP" — يطبع كخط ذهبي مرئي.
- زيادة حجم QR من 80px إلى **160px** وعرض التوليد من 100 إلى **240** مع `errorCorrectionLevel: 'H'` للحصول على QR قابل للمسح بوضوح.
- حذف تحميل `sysLogo` غير المستخدم (تنظيف).

### الاختبار: ✅ pytest passed
- جديد: `test_multi_mfg_links.py` — يختبر:
  1. حساب التكلفة كمجموع كل الروابط (برجر = لحم 1pc + خبز 1pc + صوص 50g → 950 IQD)
  2. التوافق العكسي مع `manufactured_product_id` القديم
  3. منتج بلا روابط لا يضيف تكلفة مُصنّع
- Screenshot Verified: نموذج إضافة المنتج يعرض الآن قسم "ربط بمنتجات مُصنّعة" مع زر بنفسجي بارز.

### الفوائد
- يمكن للمستخدم الآن بناء منتجات معقّدة (برجر = لحم + خبز + صوص + ...) بدلاً من ربط واحد فقط.
- التكلفة الإجمالية تُحسب تلقائياً مع تحديث فوري في الواجهة.
- الفاتورة المطبوعة الآن تعرض هوية بصرية موحّدة (Maestro EGP) مع QR يُمسح بسهولة من الكاميرا.
- QR Code يفتح `/contact` (الصفحة موجودة في `App.js` route).

---


## Session: Feb 16, 2026 — تحديث تصميم صفحة Login لمطابقة SplashScreen

### المتطلب
المستخدم لاحظ أن صفحة تسجيل الدخول قبل المصادقة لا تزال تعرض التصميم القديم (خلفية سوداء مع شعار دائري بسيط)، بينما شاشة البداية الجديدة بعد الدخول تستخدم تصميماً فاخراً (شعار M سداسي ذهبي متحرك). المطلوب توحيد الجمالية البصرية.

### الحل
**Frontend — `/app/frontend/src/pages/Login.js`**:
- استبدال شعار الدائرة القديم (96×96 rounded-full بحرف M) بشعار SVG سداسي ذهبي متطابق مع SplashScreen:
  - خاتم خارجي يدور (linear gradient ذهبي #ffe7a0 → #ffd166 → #f59e0b)
  - مضلع سداسي يُرسم تدريجياً (stroke-dashoffset animation)
  - حرف M يُرسم بعد السداسي
  - نقطة مركزية تنبض
  - تأثير glow ذهبي عبر SVG filter
- تحديث عنوان "Maestro EGP" مع gradient ذهبي على كلمة EGP فقط + text-shadow ذهبي
- إضافة خط ذهبي رفيع يُرسم تحت العنوان (login-underline animation)
- تحديث الخلفية الاحتياطية من gradient بنفسجي إلى gradient داكن أزرق-نيلي (#1a1a2e → #16213e → #0f0f1e) مع كرات متوهجة ذهبية
- تعميق glass-effect ليصبح rgba(15,15,30,0.55) مع backdrop-blur 22px وحواف ذهبية
- إذا كان `logo_url` مخصصاً من Settings، يُعرض هذا الشعار بدلاً من SVG (لدعم الـ branding المُخصّص)

### الاختبار: ✅ Screenshot Verified
- صفحة /login تعرض الآن:
  - شعار M سداسي ذهبي متحرك بالكامل
  - "Maestro EGP" بنفس styling الـ SplashScreen
  - خلفية المطعم + طبقة تعتيم + بطاقة زجاجية داكنة
  - تجربة بصرية موحدة قبل وبعد تسجيل الدخول

---

## Session: May 17, 2026 — Auto-Sync Recipe on Manual Stock Add

### المتطلب
"مزامنة تلقائية عند كل إنتاج/إضافة كمية يدوية بدون الحاجة لزر" — لا يحتاج المستخدم لضغط زر "مزامنة" يدوياً، النظام يقوم بها تلقائياً.

### الحل
**Backend — `inventory_system.py` (POST `/manufactured-products/{id}/add-stock`)**:
- بعد زيادة `quantity` يدوياً، يتم احتساب `calc_yield` من الوصفة.
- إذا كان `|calc_yield - new_quantity| >= 0.5`، تُحجَّم الوصفة تلقائياً بنفس الـ logic المستخدم في `/produce`.
- تُسجَّل العملية في `inventory_movements` بإشعار `+ مزامنة الوصفة ×X.XXXX`.
- الاستجابة تتضمن `recipe_scaled` و `scale_factor`.

**Frontend — `WarehouseManufacturing.js`**:
- `handleAddStock` يقرأ `recipe_scaled` ويُظهر Toast واضحاً عند المزامنة:
  `تم زيادة الكمية بنجاح · تمت مزامنة الوصفة تلقائياً (×1.2)`

### الاختبار: ✅ 7/7 pytest
- جديد: `test_add_stock_auto_sync.py` — إضافة 10 حبات لمنتج يُنتج 8.333 ⇒ scale=1.2، الوصفة تُحدَّث إلى 1200g، quantity=10.
- بقية الاختبارات (6) لا تزال تمر.

### الفوائد
- الوصفة دائماً متزامنة مع الكمية المُصنّعة.
- زر "مزامنة الوصفة" اليدوي لا يزال موجوداً للحالات الاستثنائية (الكمية تأتت من قبل النظام الجديد).
- المستخدم لا يحتاج لتذكّر المزامنة — كل عملية إنتاج/إضافة كمية تُحجّم الوصفة تلقائياً.

---


## Session: May 17, 2026 — Sync Recipe with Produced Quantity

### المتطلب
"٥٠٠ حبة وسعر المكونات والاوزان تبقى على سعر المكونات ٤٩٧ حبة هذا خطاء" — عندما يكون عدد القطع المُصنّعة (مثلاً 500) أكبر من العائد المحسوب من الوصفة (مثلاً 486.667)، يجب أن يُحجَّم محتوى الوصفة (المواد الخام بكمياتها وأسعارها) ليطابق الكمية الفعلية المُصنّعة.

### الحل (Frontend — `WarehouseManufacturing.js`)
- **دالة `syncRecipeToProducedQty(product)`** جديدة:
  - تحسب `scale = product.quantity / calc_yield`.
  - تُحجّم كل مكوّن في الوصفة بنفس النسبة (`quantity *= scale`).
  - تستدعي `PATCH /api/manufactured-products/{id}/recipe` لتحديث الوصفة والتكاليف.
  - تُحدّث `audit_logs` تلقائياً (عبر الـ endpoint المُحدَّث سابقاً).
- **زر "🔧 مزامنة الوصفة مع N حبة"** يظهر تلقائياً في شريط العائد المحسوب فقط عندما يكون الفرق بين `calc_yield` و `storedQty` ≥ 0.5.
- اللون البرتقالي للتنبيه عند عدم التزامن، والأصفر العادي عند التزامن.
- يظهر نص التوضيح: `العائد المحسوب 486.667 حبة · إجمالي 58400 غرام · وزن القطعة 120` ثم زر المزامنة.

### الفوائد
- المستخدم يضغط زراً واحداً → الوصفة كلها تتحدّث لتُطابق عدد القطع الفعلي.
- التكاليف الجديدة تُعاد احتسابها (قبل/بعد الهدر، هامش الربح، تكلفة كل حبة).
- سجل تدقيق يُحفظ كل عملية مزامنة.

### الاختبار: ✅ Smoke UI + Lint
- المنتجات المتزامنة (calc_yield ≈ storedQty) لا يظهر فيها زر المزامنة.
- المنتجات غير المتزامنة (لحم برغر: 486.667 vs 500) يظهر زر برتقالي مع رسالة واضحة.

---


## Session: May 16, 2026 — Per-Piece Cost Display on Manufactured Product Cards

### المشكلة
بطاقة المنتج المصنّع كانت تعرض **تكلفة الدفعة** فقط (734,633 IQD مثلاً) بدون توضيح تكلفة الحبة الواحدة، مع سعر بيع 0 وهامش ربح سلبي ضخم. هذا يُربك صاحب المطعم في التسعير.

### الحل (Frontend — `WarehouseManufacturing.js`)
- **شريط العائد المحسوب**: قبل كروت التكلفة، شريط أصفر يعرض:
  `📐 العائد المحسوب من الوصفة: 8.333 حبة · وزن القطعة 120 غرام · إجمالي الوصفة 1000 غرام`
- **كروت التكلفة المُحسّنة**: كل كرت يعرض الآن قيمتين:
  - القيمة الكبيرة (تكلفة الدفعة): كما هي
  - تحتها سطر صغير: **"لكل حبة: X IQD"** (= batch_cost ÷ denom حيث denom = calc_yield || product.quantity || 1)
- **هامش الربح**: يحسب الآن لكل حبة (`selling_price - unit_cost_after_waste`) بدلاً من (`selling_price - batch_cost`) الذي كان يُعطي قيماً سلبية كبيرة جداً.
- تلوين هامش الربح: أخضر إيجابي / أحمر سلبي.

### الاختبار: ✅ Smoke UI End-to-End
- "تشيز برجر" يعرض الآن: الدفعة 1,410 IQD · لكل قطعة **39 IQD** · هامش الربح 3,461 IQD (لكل قطعة).
- "TEST_burger_ed0a93": دفعة 10,000 IQD، quantity=0، fallback denom=1 ⇒ لكل حبة 10,000 (لا يوجد yield ولا quantity مخزّن، طبيعي).

---


## Session: May 16, 2026 — Fix: Linked Product Cost = Per-Piece (Not Batch)

### المشكلة الحرجة
عند ربط منتج (مثل "كلاسيك برجر") بمنتج مصنّع (مثل "لحم برغر")، كانت **تكلفة الحبة الواحدة تظهر كتكلفة الدفعة الكاملة** (مثلاً 734,633 IQD بدلاً من ~1,509 IQD). هذا خطأ جسيم يُربك التسعير والمحاسبة.

### السبب الجذري
الكود كان يقرأ `raw_material_cost_after_waste` (وهو مجموع تكلفة كل الوصفة/الدفعة) ويستخدمه مباشرةً كتكلفة وحدة واحدة. لم يُقَسَّم على عدد القطع الناتجة.

### الحل
**Frontend — `Settings.js`**:
- إضافة دالة مساعدة `_computeMfgUnitCost(mp)`:
  - تحسب العائد من الوصفة (`calc_yield = totalGrams / pieceGrams`).
  - تُقسّم `batch_cost ÷ (calc_yield || mp.quantity || 1)`.
  - ترجع **تكلفة حبة واحدة فقط**.
- استخدامها في 4 مواقع (Add Product / Edit Product · onValueChange + summary box).

**Backend — `server.py` (`validate_and_calculate_costs`)**:
- استبدال `unit_cost = batch_cost` بـ `unit_cost = batch_cost / denom` حيث `denom = calculated_yield || product.quantity || 1`.
- يُستخدم `piece_weight` و`piece_weight_unit` و`recipe` للحساب الدقيق.

### الاختبار: ✅ 11/11 pytest
- جديد: `test_linked_product_per_unit_cost.py` — يُنشئ batch_cost=10,000 (1000g × 10) مع yield=8.333 ⇒ unit_cost ≈ 1,200. يتحقق أن تكلفة الطلب < 5,000 (لو كان الخطأ موجوداً لكانت ~10,000).
- بقية الاختبارات (10): جميعها لا تزال تمر.

### الأثر
مثال "كلاسيك برجر" + "لحم برغر" (734,633 IQD ÷ 486.667 حبة):
- قبل الإصلاح: التكلفة لحبة واحدة = 734,633 ❌
- بعد الإصلاح: التكلفة لحبة واحدة = **1,509 IQD** ✅

---


## Session: May 16, 2026 — Eliminate Dashboard Flicker Before Splash

### المتطلب
"اريدها تظهر هذه الشاشة بعد تسجيل الدخول وقبل ان يظهر الداش للنظام" — منع أي وميض للداشبورد قبل ظهور Splash.

### السبب الجذري
كان `PostLoginSplash` يستخدم `setInterval(200ms)` للتحقق من sessionStorage. هذا يسمح بـ ~200ms من ظهور الداش قبل أن يكتشف الـ flag.

### الحل
- **`App.js → PostLoginSplash`**: استبدال polling بـ `window.addEventListener('show-splash')` للاستجابة الفورية.
- **`Login.js`**:
  - عند نجاح login: `sessionStorage.setItem` + `window.dispatchEvent(new Event('show-splash'))` + `setTimeout(navigate, 50ms)`.
  - التأخير 50ms يضمن أن React يفرغ تحديث `show=true` ويرسم Splash قبل أن يبدأ التنقل والـ mounting للدashboard.
- **`SplashScreen.jsx`**: رفع `z-index` إلى `2147483647` (أقصى قيمة 32-bit signed) لضمان تغطية أي مكوّن آخر (Toaster، modals، popups).

### الاختبار: ✅ Smoke UI
- لقطة عند 150ms بعد click: شاشة Login (API لا يزال في تنفيذ).
- لقطة عند 2.1s: Splash كامل يغطّي كل شيء، URL = `/`.
- لقطة عند 4.6s: Splash اختفى، Dashboard يظهر بسلاسة.
- **لا توجد لحظة يظهر فيها الداش بدون Splash** بعد نجاح login.

---


## Session: May 16, 2026 — Animated Logo + Animated Text in Splash

### المتطلب
"اسم النظام وشعار النظام والاسم متحرك والشعار متحرك" — إضافة شعار للنظام مع تحريكه بشكل مستقل عن النص.

### الحل
**`SplashScreen.jsx`**:
- إضافة شعار SVG هندسي ذهبي مكوّن من:
  - حلقة خارجية متقطعة تدور 360° (6 ثوانٍ loop).
  - سداسي رئيسي (hexagon) يُرسم تدريجياً (stroke-dasharray draw 1.4s).
  - حرف **M** يُرسم بعد السداسي (0.8s delay، 1.2s draw).
  - نقطة مركزية تنبض (2s loop).
  - تدرّج ذهبي + glow filter.
- حركة الشعار:
  - دخول: scale من 0.4 + rotate -90° → 1.0 (1.1s easeOutExpo).
  - تعويم مستمر: ±6px (3.6s ease-in-out).
- النص "Maestro EGP" يدخل بعد بدء الشعار بـ 1.2s (blur + scale + letter-spacing animation).
- تأخيرات الخط الذهبي وشريط التحميل أُعيد ترتيبها لتنسجم مع التتابع.

**`public/index.html`** (initial splash قبل تشغيل React):
- نسخة مطابقة من الشعار + النص بـ CSS-only animations.
- نفس التتابع: ring spin، hex draw، M draw، dot pulse.

### الاختبار: ✅ Smoke UI End-to-End
- اللقطة عند 0.6s: حلقة ذهبية تبدأ في الرسم.
- اللقطة عند 1.5s: الشعار مكتمل + نص ظاهر + خط ذهبي.
- اللقطة عند 2.3s: استمرار الحركات المتزامنة (الشعار يعوم، الحلقة تدور، النقطة تنبض).

---


## Session: May 16, 2026 — Maestro EGP Splash Screen

### المتطلب
- شاشة بداية أنيقة بعد تسجيل الدخول مدتها 4 ثوانٍ تعرض اسم النظام "Maestro EGP".
- خلفية مطاعم قابلة للتخصيص من لوحة المالك.
- استبدال الخلفية السوداء + الدائرة عند تحميل الصفحات بنفس التصميم.

### الحلول
**جديد — `/app/frontend/src/components/SplashScreen.jsx`**:
- مكوّن قابل لإعادة الاستخدام (`durationMs` افتراضي 4000، `onComplete` callback).
- يجلب خلفية عشوائية من `/api/login-backgrounds` (active) ويُخزّنها في sessionStorage cache.
- "Maestro EGP" بحجم متجاوب (clamp 48px → 140px) — "Maestro" أبيض ساطع، "EGP" بتدرّج ذهبي.
- أنيميشن: fade-in + scale + blur → 900ms (cubic-bezier easeOutExpo). خط ذهبي يتمدد تحت العنوان (1200ms بعد 600ms). شريط تحميل صغير (يبدأ بعد 1200ms).
- طبقة تعتيم قابلة للتخصيص + glow ناعم.

**`Login.js`**:
- بعد تسجيل الدخول الناجح (مالك + سوبر أدمن): `sessionStorage.setItem('show_post_login_splash', '1')` ثم `navigate(...)`.

**`App.js`**:
- إضافة مكوّن `PostLoginSplash` عالمي داخل `BrowserRouter` — يراقب علامة `show_post_login_splash` ويعرض SplashScreen لـ 4 ثوانٍ ثم يحذف العلامة.
- استبدال `PageLoader` بـ `FullSplash` في حالتيْن: ProtectedRoute Initial Loading + PublicRoute Initial Loading (تحلّ محل الخلفية السوداء).

**`index.html`**:
- إضافة `#initial-splash` CSS-only يظهر فوراً عند تحميل الصفحة (قبل تشغيل React) ليطابق نفس التصميم — يُزال تلقائياً عند mount.

**`index.js`**:
- توسعة `hideLoader` لإزالة `#initial-splash` أيضاً عند نجاح render.

### الاختبار: ✅ Smoke UI End-to-End
- شاشة Splash تظهر مدة ~3.5 ثانية ثم تُخفى وتنتقل إلى `/`.
- الخلفية مطعم حقيقي (مأخوذة من إعدادات `login_backgrounds`).
- التحميل الأولي للتطبيق يعرض نفس التصميم بدل الشاشة السوداء + الدائرة.

---


## Session: May 16, 2026 — Batch Mode: Auto-Scale Recipe on Produce

### المتطلب
"يقبل الزيادة ويزيد الكميات للوصفة أو المكونات ليعادل الرقم 500" — المستخدم يريد أنه إذا طلب تصنيع كمية أكبر من العائد الحقيقي للوصفة، يقبل النظام الطلب ويُحجّم كميات المكونات تلقائياً لتُنتج بالضبط الكمية المطلوبة (الوصفة دفعة batch وليست per-unit).

### الحلول
**Backend — `inventory_system.py` (POST `/manufactured-products/{id}/produce`)**:
- اكتشاف "نمط الدفعة" تلقائياً: إذا كان `piece_weight` مُحدداً والوصفة تحتوي على مواد وزنية ⇒ `calculated_yield = total_grams / piece_grams`.
- إذا كان `quantity > calculated_yield` (أو ≠) ⇒ يُحجَّم كل مكون بـ `scale_factor = quantity / calculated_yield`، وتُحفظ الوصفة المُحجَّمة في DB، وتُعاد احتساب التكاليف (قبل/بعد الهدر، هامش الربح).
- استهلاك المواد الخام **مرة واحدة** (multiplier=1) لأن الوصفة تمثل الدفعة كاملة.
- يُسجَّل في `audit_logs` (action: `recipe_auto_scaled_on_produce`) — تاريخ، عامل التحجيم، العائد قبل التحجيم.
- في حال عدم وجود `piece_weight` ⇒ يعمل بالنمط القديم (per-unit، multiplier = quantity) — توافق رجعي كامل.
- إصلاح ثانوي: `piece_weight` و`piece_weight_unit` لم يكونا يُحفظان عند إنشاء المنتج المصنّع — أُصلِح.
- الاستجابة تتضمن الآن: `recipe_scaled`, `scale_factor`, `calculated_yield_before`, `batch_mode`.

**Backend — `inventory_system.py` (POST `/manufactured-products`)**:
- إضافة `piece_weight` و`piece_weight_unit` لـ `product_doc` (كانا مفقوديْن — هذا سبب فشل اكتشاف Batch Mode في الكثير من السيناريوهات).

**Frontend — `WarehouseManufacturing.js`**:
- حوار التصنيع يحسب الآن نفس `calc_yield` و`scale_factor`، يعرض بانر معلوماتي: `سيتم تعديل الوصفة تلقائياً بنسبة ×X.XXXX لتُنتج بالضبط N حبة`.
- "مطلوب/متوفر" لكل مادة يستخدم `multiplier=scale` في batch mode (بدل ضرب الكمية × عدد الحبات الذي يُعطي أرقاماً خيالية).
- Toast النجاح يُظهر عامل التحجيم عند تصنيع كميات تختلف عن العائد الأصلي.

### الاختبار: ✅ 10/10 pytest
- جديد: `test_produce_batch_scaling.py` — يُنشئ منتجاً بـ piece_weight=120 وغرام=1000، يطلب تصنيع 10، يتحقق:
  - `scale_factor ≈ 1.2`
  - الوصفة في DB → 1200g
  - مخزون التصنيع نقص بـ ~1200g (وليس 10000g)
  - المنتج المصنّع زاد بـ 10 وحدات

---


## Session: May 16, 2026 — Simplify Product↔Manufactured Link (Show Pieces, Not Raw Materials)

### المشكلتان
1. شاشة "ربط منتج بمنتج مصنع" في Settings كانت تعرض **مكونات المواد الخام** (لحم، لية، ...) — وهذا مُربك ولا يعكس منطق الخصم الفعلي (الذي يخصم من مخزون المنتج المصنع وليس من المواد الخام).
2. الكميات في القائمة المنسدلة كانت تظهر `mp.quantity` المخزّن (الذي قد يكون مغلوطاً مثل 500 بدل 497.233 الحقيقي).

### الحلول
**Frontend — `Settings.js`**:
- إزالة جدول "المكونات وكمياتها" بالكامل من حواري إضافة/تعديل المنتج.
- استبداله بـ **صندوق مبسّط** (`mfg-link-summary` / `edit-mfg-link-summary`):
  - اسم المنتج المصنع + Input لـ **عدد الوحدات المُستهلَكة** (`manufactured_consumption_qty`، افتراضي 1).
  - عرض `تكلفة الإنتاج للوحدة` و `التكلفة لهذا المنتج` (= consumption × production_cost).
  - وحدة "حبة/قطعة" تظهر بوضوح.
- في القائمة المنسدلة: حساب **العائد الحقيقي للوصفة** (`totalGrams / pieceWeightGrams`) وعرضه بجوار الكمية المخزّنة. مثال: `لحم برغر (500 حبة) · القطعة: 120 غرام · عائد: 497.233 حبة`.

**Backend — `server.py`**:
- إضافة حقل جديد `manufactured_consumption_qty: float = 1.0` إلى `ProductCreate` و `ProductResponse`.
- منطق احتساب التكلفة (`validate_and_calculate_costs`): `unit_cost × consumption_qty + operating_cost`. يفضّل `raw_material_cost_after_waste` على `raw_material_cost`.
- منطق خصم المخزون عند البيع: `branch_inventory.quantity -= consumption_qty × item.quantity` (بدل 1:1).

### الاختبار: ✅ 9/9 pytest
- جديد: `test_manufactured_consumption_qty.py` — يتحقّق من إنشاء منتج بـ `manufactured_consumption_qty=2.5` ويستمر.
- 4 اختبارات وصفة المنتج المصنع + 2 فحص branch_id للمرتجع + 2 صلاحية credit = جميعها تمر.

---


## Session: May 16, 2026 — Critical POS Fixes (Credit Bypass + Refund Branch Scoping)

### المشكلة 1: خرق سياسة "آجل"
سيناريو: المستخدم يختار "توصيل" + شركة → "آجل" يصبح متاحاً → ثم يرجع لـ "داخلي/سفري" → "آجل" يبقى مفعّلاً ويُقبل (خرق صارخ للسياسة).

**الحل (Frontend — `POS.js`)**:
- عند تغيير `orderType` بعيداً عن `delivery` (قبل الحفظ):
  - تُمسح تلقائياً: `deliveryApp`, `selectedDriver`, `deliveryAddress` مع Toast إعلامي.
  - إذا كان `paymentMethod === 'credit'` يُلغى ويُجبر المستخدم على إعادة اختيار طريقة الدفع (حتى للمالك/المدير — لمنع الخرق).
- شرط فلتر زر "آجل" أصبح أكثر صرامة: `orderType === 'delivery' && deliveryApp` معاً (بدل `deliveryApp` لوحده الذي قد يبقى ملوّثاً من حالة سابقة).
- زر تغيير نوع الطلب يبقى `disabled` بعد الحفظ (`editingOrder.order_type !== type.id`).

### المشكلة 2: بحث المرتجع يُرجع طلباً غير صحيح
سيناريو: في فرع الجادرية، البحث عن فاتورة #8 يُرجع فاتورة من فرع آخر برقم #8 لأن الترقيم يتكرر عبر الفروع.

**الحل (Backend — `server.py`)**:
- `GET /api/orders/{order_id}/refund-status` يقبل الآن `branch_id` كـ query param.
- يُفلتر الاستعلام بـ `branch_id` (يأتي من المعامل أو من `current_user.branch_id`).
- رسالة الخطأ أوضح: "الطلب غير موجود في هذا الفرع".

**الحل (Frontend — `POS.js`)**:
- `searchOrderForRefund` يُمرّر `branch_id` تلقائياً من `getBranchIdForApi()` أو `user.branch_id`.

### الاختبار: ✅ 8/8 pytest
- `test_refund_branch_scoping.py`: branch_id مقبول، 404 لطلب غير موجود في الفرع.
- `test_manufactured_recipe_edit.py`: 4/4 سليمة.
- `test_credit_permission_gate.py`: 2/2 سليمة.

---


## Session: May 16, 2026 — Notification Bell Replaces Disruptive Toasts

### المشكلة
كان النظام يُطلق toast منبثقاً تلقائياً عند كل إشعار "تحويل جزئي من المخزن"، وفي بعض الشاشات يظهر بشكل مشوّه (الكتابة عمودية في زاوية ضيقة بسبب تضارب CSS). المستخدم أراد إلغاء هذا الشكل المزعج في كل المكونات (المخزن/التصنيع/أي مكان).

### الحل (Frontend — `WarehouseManufacturing.js`)
- **إزالة `toast()` المنبثق** من `fetchMfgNotifications`. الآن يُجلب الإشعارات بصمت إلى state `mfgNotifications`.
- **إضافة جرس إشعارات** (`Bell`) في الـ header مع:
  - شارة حمراء بعدد الإشعارات غير المقروءة (`mfg-notif-badge`)
  - فتح `Popover` مخصص (`w-96`, max-height 70vh) يحتوي على:
    - عنوان "إشعارات التصنيع · N غير مقروء"
    - لكل إشعار: رقم التحويل، اسم المُرسل، الملاحظة، جدول مدمج (`اسم المادة · مرسل/مطلوب`)، زرّا **اعتمد واستخدم فوراً** و **انتظر اكتمال الطلب**.
  - حالة فارغة عند انعدام الإشعارات.
- زر `accept`/`wait` يستدعي `/api/manufacturing-notifications/{id}/ack` ثم يحذف العنصر من القائمة محلياً + يُحدّث `fetchData`.

### الفوائد
- لا توستات منبثقة مزعجة (لا تظهر فجأة ولا تُغطّي محتوى).
- المستخدم يرى عداد الإشعارات في كل وقت ويفتحها عند الراحة.
- التصميم يطابق نمط منشآت SaaS الحديثة (Bell + Dropdown).

### الاختبار: ✅ Smoke UI
- الجرس يعرض شارة **19** إشعار، الـ Popover يفتح بقائمة منظّمة، أزرار الاعتماد/الانتظار تعمل.

---


## Session: May 16, 2026 — Produce Dialog Shortfall Details + Recipe Cost Breakdown

### المشاكل
1. عند الضغط على "تصنيع" يظهر فقط `مواد غير كافية` دون توضيح أيّ مادة ناقصة وكم.
2. كروت التكلفة (الكلفة قبل/بعد الهدر، هامش الربح) تعرض أرقاماً إجمالية فقط — لا يوجد تفصيل لكل مكوّن.

### الحلول (Frontend — `WarehouseManufacturing.js`)
- **حوار التصنيع**:
  - كل مكوّن يعرض الآن صفًا منفصلاً مع: اسم المادة، شارة `ناقص` حمراء عند النقص، `مطلوب: X غرام/قطعة`، `متوفر: Y`.
  - الصفوف الناقصة بخلفية حمراء واضحة (`bg-red-500/10`).
  - تذييل: `⚠️ N مادة ناقصة — اطلب تحويلها من المخزن قبل التصنيع`.
- **Toast الخطأ**: يعرض قائمة بالمواد الناقصة (المطلوب vs المتوفر) لمدة 10 ثوانٍ بدلاً من رسالة عامة.
- **توسيع الوصفة في البطاقة**: جدول من 4 أعمدة (المكوّن · الكمية · سعر/وحدة · التكلفة) لكل مكوّن مع شارة الهدر، وإجمالي في الأسفل (`بعد الهدر`).

### الاختبار: ✅ Smoke UI End-to-End
- حوار تصنيع `لحم برغر` يعرض 3 مواد ناقصة بالأحمر مع المطلوب/المتوفر لكل واحدة.
- جدول وصفة `تشيز برجر`: لحم بقري 100غ × 8 = 800، خبز 1 × 250 = 250، جبن 30غ × 12 = 360 → إجمالي 1,410 IQD.
- ✅ 4/4 pytest في `test_manufactured_recipe_edit.py`.

---


## Session: May 16, 2026 — Fix Floating-Point Display & Add Unit to Stats

### المشاكل
1. كميات المكونات في عرض الوصفة كانت تظهر بشكل: `0.17500000000000002 كغم` (floating-point noise).
2. إحصائيات البطاقة (إجمالي المُصنّع/المحول/المتبقي) لم تكن تعرض الوحدة (حبة/قطعة/كغم).

### الحلول (Frontend — `WarehouseManufacturing.js`)
- **`formatRecipeQuantity(qty, unit)`**: دالة عرض ذكية:
  - تحوّل تلقائياً للوحدة الأنسب: `0.175 كغم → 175 غرام`، `0.5 لتر → 500 مل`.
  - تحذف floating-point noise بتقريب لـ 3 خانات عشرية وإزالة الأصفار اللاحقة.
  - تُستخدم في: عرض الوصفة المختصرة بالبطاقة، حوار التصنيع (المواد المطلوبة والمواد المخصومة).
- إضافة `Math.round(... × 1e6) / 1e6` في `convertQuantityToMaterialUnit` و `convertWithPackInfo` لتنظيف القيم المحوَّلة قبل تخزينها.
- إحصائيات البطاقة (`stat-total-produced`, `stat-transferred`, `stat-remaining`) أصبحت تعرض القيمة + الوحدة (`product.unit`) بشكل واضح.
- Add Stock dialog أيضاً يعرض الوحدة الآن.

### الحلول (Backend — `inventory_system.py`)
- في `PATCH /api/manufactured-products/{id}/recipe`: تقريب `quantity` و`cost_per_unit` لكل مكون قبل الحفظ (6 خانات عشرية) لمنع كتابة floating-point noise في قاعدة البيانات.

### الاختبار: ✅ Smoke UI + 4/4 pytest
- إحصائيات `لحم برغر`: 41 قطعة / 5 قطعة / 36 قطعة (واضحة بالوحدة).
- وصفة `تشيز برجر`: 100 غرام / 1 قطعة / 30 غرام (بدون floating noise).

---


## Session: May 16, 2026 — Pack-Based Unit Input for Count-Unit Raw Materials

### المشكلة
عند اختيار مادة خام وحدتها قطعية (قطعة/علبة/كرتون) لكنها تحتوي على وزن/حجم داخلي (مثل: علبة باربكيو صوص = 4.5 كغم)، كان منتقي وحدة الإدخال يعرض **قطعة/حبة فقط**، ولا يسمح للمستخدم بإدخال الكمية بالغرام/الكغم/الـمل/اللتر.

### الحل (frontend فقط — `WarehouseManufacturing.js`)
- **`availableInputUnitsFor(materialUnit, packUnit)`**: عند تمرير `packUnit` لمادة قطعية، يضيف وحدات عائلة `pack_unit` (وزن أو حجم) للقائمة.
- **`_packInfoFor(materialId)`**: يجلب `pack_quantity` + `pack_unit` من قائمة المواد الخام الرئيسية.
- **`convertWithPackInfo(qty, inputUnit, materialUnit, packInfo)`**: يحوّل كمية بوحدة وزن/حجم إلى عدد قطع باستخدام معلومات التعبئة. مثال: 9 كغم ÷ 4.5 كغم/قطعة = 2 قطعة.
- تحديث منتقي الوحدات في **حواري إنشاء الوصفة** و **تعديل الوصفة** ليمررا `packInfo.pack_unit`.
- تحديث منطق إضافة المكون (Add / Edit) ليُجرّب التحويل عبر `pack_info` عندما تختلف العائلات.
- إضافة معلومة التعبئة في dropdown اختيار المادة (`كل قطعة = 4.5 كغم`).
- Toast التحويل أصبح يُظهر مُعامل التحويل مثل `(4.5 كغم/قطعة)`.

### الاختبار: ✅ Smoke UI End-to-End
- إنشاء مادة خام وحدتها قطعة + pack_quantity=4.5 pack_unit=كغم.
- تحويل 2 قطعة إلى التصنيع.
- في حوار "تعديل الوصفة": منتقي الوحدة عرض `['قطعة','حبة','غرام','كغم','كيلو','كجم']`.
- إدخال 9 كغم → التحويل لـ 2 قطعة بنجاح + Toast واضح.
- العملية لا تكسر أي اختبارات pytest قائمة (4/4 من `test_manufactured_recipe_edit.py` تمر).

---


## Session: May 15, 2026 — Edit Existing Manufactured Product Recipes

### الميزة الجديدة
السماح بتعديل وصفة منتج مصنّع موجود (إضافة/حذف/تعديل المكونات والكميات) مع إعادة احتساب تكلفة الإنتاج (قبل/بعد الهدر) وهامش الربح تلقائياً.

### الباك إند (`/app/backend/routes/inventory_system.py`)
- **PATCH `/api/manufactured-products/{product_id}/recipe`**: نقطة جديدة تتلقى `recipe[]` (RecipeIngredient)، `piece_weight`, `piece_weight_unit`, `reason`.
- تعيد احتساب: `raw_material_cost`, `cost_before_waste`, `raw_material_cost_after_waste`, `production_cost`, `profit_margin`، مع تحديث `last_updated`.
- ترفض الوصفة الفارغة (400) وتعيد 404 لمنتج غير موجود.
- تسجّل عملية التعديل في `audit_logs` (السبب، عدد المكونات قبل/بعد، التكلفة قبل/بعد، المستخدم).

### الواجهة الأمامية (`/app/frontend/src/pages/WarehouseManufacturing.js`)
- زر **"تعديل الوصفة"** على بطاقة كل منتج مصنّع (بجوار "تصنيع" و "زيادة الكمية").
- **Dialog مخصص** (`edit-recipe-dialog`): يُعبّأ مسبقاً بالمكونات الحالية، يدعم:
  - تعديل كمية أي مكوّن inline
  - حذف مكوّن
  - إضافة مكوّن جديد من مخزون التصنيع (مع تحويل الوحدات تلقائياً)
  - وزن القطعة + الوحدة (لإعادة احتساب عدد القطع)
  - حقل سبب التعديل (للسجل)
  - عرض الإجمالي قبل/بعد الهدر (يُحدَّث لحظياً)
  - تحذير واضح بأن التعديل لن يؤثر على الكميات المُنتجة سابقاً

### الاختبار: ✅ 4/4 pytest + smoke UI
- `/app/backend/tests/test_manufactured_recipe_edit.py`: 404، رفض الوصفة الفارغة، إعادة احتساب التكلفة (200×10 + هدر 20% = 2500)، استمرار التعديلات في GET.

---


## Session: Apr 29, 2026 - Customer-Bound Coupons (Auto-Apply at POS)

### الميزة الجديدة
كوبونات مرتبطة باسم العميل، تظهر وتُخصم تلقائياً في POS بمجرد إدخال الاسم، مع تقييد الفرع والوقت اليومي.

### الباك إند (`server.py`)
- **`CouponCreate`**: إضافة `branch_ids: List[str]`, `daily_start_time: HH:MM`, `daily_end_time: HH:MM`, `customer_name`.
- **`OrderCreate` / `OrderResponse`**: إضافة `coupon_id, coupon_code, coupon_name, coupon_discount`.
- **GET `/api/coupons/lookup-by-customer`**: مسار جديد يبحث بـ `customer_name` (case-insensitive) ويفلتر على الفرع الحالي والوقت الحالي وتاريخ الصلاحية وحد الاستخدام، ويُرجع أعلى خصم منطبق.
- **POST `/api/coupons/validate`**: التحقق الآن يفرض `customer_name` و `branch_id` والنطاق الزمني اليومي.
- **POST `/api/coupons/{id}/use`**: يخزّن `tenant_id, branch_id, cashier_id, cashier_name, customer_name, coupon_name, coupon_code, shift_id` في `coupon_usage` لتقارير الإغلاق.

### إغلاق الوردية (`shifts_routes.py`)
- يجمع `coupons_summary[]` (لكل كوبون: العدد، الإجمالي المخصوم، الكاشير، أسماء العملاء) و `total_coupon_discount` من `coupon_usage` ضمن نطاق الوردية (tenant + branch + cashier + الفترة).
- يُحفظ في `shifts.update_data` و `cash_register_closings`.

### الواجهة الأمامية
- **`Coupons.js`**: حقول جديدة في الديالوج — اسم العميل المرتبط، الفروع المسموح بها (مع "جميع الفروع")، وقت بدء/انتهاء يومي.
- **`POS.js`**:
  - `useEffect` ببحث Debounced 350ms على `customer_name` يستدعي `/coupons/lookup-by-customer` ويطبّق الخصم تلقائياً.
  - عرض في السلة: المجموع الفرعي → سطر "🎟️ كوبون <الاسم> (X%)" بخط أخضر → الإجمالي.
  - الخصم الكلي = خصم يدوي + خصم الكوبون (يُخصم من النقد المتوقع تلقائياً).
  - يُسجَّل الاستخدام عبر `/coupons/{id}/use` بعد إنشاء الطلب.
- **`receiptBitmap.js`**: 
  - فاتورة العميل تعرض سطر "كوبون <الاسم>: -<قيمة>" قبل سطر الخصم اليدوي.
  - إيصال الإغلاق: قسم "الكوبونات المستخدمة" مع كل كوبون (×عدد المرات، الكاشير، أسماء العملاء، الإجمالي).

### الاختبار: ✅ 18/18 pytest
- `/app/backend/tests/test_coupons_customer_iter170.py`: 8 سيناريوهات (إنشاء، lookup case-insensitive، رفض اسم خاطئ/فارغ/فرع خاطئ/وقت خارج النطاق، use tracking كامل).
- `/app/backend/tests/test_cancel_item_iter169.py`: 10 لا regressions.


## Session: Apr 28, 2026 - Role Guard on Item Cancellation

### Cashier Cannot Delete/Reduce Items After Sending to Kitchen
- **توضيح المتطلب:** الكاشير ممنوع تماماً من حذف أو تقليل صنف مُرسَل للمطبخ. فقط مالك المطعم (Admin) أو المدير العام (Manager) أو Super Admin يقدر.
- **الواجهة الأمامية (`POS.js`):**
  - `updateQuantity`: يفحص `user.role` — إذا كاشير ومحاولة تقليل صنف `_sentToKitchen` → رسالة "غير مسموح — فقط مالك المطعم أو المدير العام يستطيع تعديل صنف مُرسَل للمطبخ".
  - `removeFromCart`: نفس الفحص — يرفض الحذف من الكاشير قبل المتابعة لطباعة المطبخ والتسجيل.
- **الباك إند (`server.py > cancel_order_item`):**
  - يتحقق من `current_user.role ∈ [admin, manager, super_admin]`.
  - الكاشير يحصل على HTTP 403 مع رسالة "غير مسموح — فقط مالك المطعم أو المدير العام يستطيع حذف/تعديل صنف مُرسَل للمطبخ".
- **الاختبار:** ✅ 10/10 pytest passed (أُضيف `TestRoleGuard` يُنشئ كاشير مؤقت ويتأكد من 403، ثم يتحقق أن Admin يبقى مسموح).


## Session: Apr 28, 2026 - Partial Item Cancellation Audit Trail

### New: `POST /api/orders/{order_id}/cancel-item`
- يُسجِّل إلغاء صنف منفرد (أو جزء من كميته) على طلب محفوظ مُرسَل للمطبخ.
- يحفظ الإدخال في:
  - مصفوفة `orders.cancelled_items` (سجل تدقيق على الطلب نفسه)
  - مجموعة `item_cancellations` (لتقارير الإلغاءات) مع `tenant_id`, `branch_id`, `order_id`, `order_number`, `order_status`, `product_id`, `product_name`, `quantity`, `price`, `total_value`, `reason`, `cancelled_by`, `cancelled_at`.
- محمي بـ `get_current_user` + `build_tenant_query` (عزل بيانات صارم بين العملاء).
- التحقق: 404 إذا لم يوجد الطلب، 400 إذا الكمية ≤ 0.
- الواجهة الأمامية `POS.js > removeFromCart` كانت تستدعي هذا المسار مسبقاً + تطبع إيصال إلغاء للمطبخ — الآن أصبح المسار الخلفي مكتملاً.
- اختبار شامل: 8/8 pytest passed (`/app/backend/tests/test_cancel_item_iter169.py`).
- إضافة `cancelled_items` لـ `OrderResponse` لإظهار سجل التدقيق عبر `GET /api/orders/{id}`.



## Session: Feb 23, 2026 - Print Agent v6.4.0 (Long-Polling - INSTANT Print)

### THE ULTIMATE FIX: Long-Polling Eliminates Polling Delay
- `PRINT_AGENT_VERSION: 6.3.3 → 6.4.0`
- **Backend `/api/print-queue/pending`**: يدعم `?wait=25` — الـrequest يبقى مفتوحاً حتى 25 ثانية يترقب أي job. بمجرد ما يظهر job، يُرجِعه فوراً. الفحص الداخلي كل 100ms.
- **Agent PowerShell**: يرسل `wait=25&TimeoutSec=30` — اتصال دائم مع السيرفر. عند وصول job، يُرجَع خلال <200ms.
- **اختُبر**: حقن job في 1000ms، الـpoll رد في 1149ms → job التُقِط خلال **149ms**
- **النتيجة**: click → print خلال ~200-400ms بدلاً من 500-1500ms سابقاً
- ✨ بدون polling overhead (كان الوكيل يطلب كل 500ms → ~172 طلب/دقيقة. الآن ~2-3 طلبات/دقيقة فقط بنفس الاستجابة الفورية)

## Session: Feb 23, 2026 - Auto Cleanup Duplicates Migration

### Startup Migration: Remove Duplicate Expenses
- أُضيفت migration `cleanup_duplicate_expenses_v1` في `startup_event`:
  - تكتشف المصاريف المكررة: نفس `(tenant_id, branch_id, created_by, amount, description)` خلال **60 ثانية** = تكرار
  - تحتفظ بالأقدم، تحذف النُسَخ
  - تعيد حساب `total_expenses` و `expected_cash` لكل وردية متأثرة تلقائياً
  - تُنفَّذ **مرة واحدة فقط** (محفوظة في `system_migrations` collection)
- تم التحقق من الـsyntax والتنفيذ السليم على preview

### ⚠️ ملاحظة للمستخدم
- على preview env: 0 مكررات (قاعدة بيانات نظيفة)
- عند النشر (Deploy) على production: ستكتشف وتحذف مصروف الغاز المكرر + أي مكررات أخرى + تُعيد حساب تقرير إغلاق الصندوق

## Session: Feb 23, 2026 - Print Agent v6.3.3 + Fixes (Stability & Duplicates & undefined)

### Print Agent v6.3.3 - Bulletproof Polling
- `PRINT_AGENT_VERSION: 6.3.2 → 6.3.3` (بعد اكتشاف أن الـ Start-Job ينهار بصمت كل ~دقيقة)
- **حلقة خارجية (OUTER loop)** حول حلقة polling الرئيسية: لو حصل exception فادح خارج الـinner try/catch، يُسجَّل في agent.log ويُعاد تشغيل الحلقة فوراً (بدون انتظار watchdog الدقيقي). هذا يحل عطل Al Yarmouk v6.3.1 الذي كان يُظهر "آخر اتصال: 1د منذ".
- Polling الفعلي: 500ms خامل / 50ms نشط (أسرع ردّ ممكن).

### Duplicate Expenses Fix
- **Backend dedup window** (10 ثواني) في `POST /api/expenses`: لو نفس المستخدم + الفرع + المبلغ + الوصف تم إرسالهم خلال 10 ثواني، نُعيد المصروف الموجود بدل إنشاء نسخة مكررة. يحمي ضد: double-click, network retry, React re-render.
- **Frontend `submitting` state** في Expenses.js: زر الحفظ يُعطَّل فوراً عند الضغط (منع multi-click).
- ✅ تم الاختبار: استدعاء `/api/expenses` مرتين بنفس البيانات يُرجع نفس الـID.

### Kitchen Cancel Receipt "undefined" Fix
- `handleCancelOrder` في POS.js: defensive name lookup مع fallback متعدد: `product_name → name → productName → products.find(p=>p.id===item.product_id).name → 'صنف'`. لن يظهر "[تم حذف] undefined" بعد الآن.

## Session: Feb 23, 2026 - Print Agent v6.3.2 (Ultra-Fast Test Print)

### Eliminated Test Print Delay (10s → ~1s)
- Version bumped **6.3.1 → 6.3.2**
- **Agent polling**: 1000ms idle → **500ms idle**, 100ms active → **50ms active** (guaranteed ≤500ms pickup latency)
- **Frontend `sendTestPrint`**: Added 5s timeout to axios post (catches hangs)
- **Settings `handleTestPrinter`**: Removed blocking `checkAgentStatus()` before queueing test (was adding 300-500ms extra round-trip). Print job is queued directly — if agent is offline, POS still queues safely and prints when agent comes back. Also unified USB + network flow (no duplicate code paths).

### Total perceived time for Test Print
- **Before**: ~10 seconds (user report)
- **After**: ~1 second (queue POST ≈ 150ms + agent pickup ≤ 500ms + USB print ≈ 300ms)

## Session: Feb 23, 2026 - Print Agent v6.3.1 (Stability + Per-Branch Version Check)

### Hotfixes for v6.3.0
- Version bumped **6.3.0 → 6.3.1** (forces reinstall on Al Yarmouk where v6.3.0 polling loop stopped after ~60s)
- **PowerShell compatibility fix**: replaced ternary-style `$x = if() {} else {}` with PowerShell 2.0-safe two-line form (`$jobCount=0; if(...) { $jobCount=... }`) — root cause of 57s-stale heartbeats on older Windows
- **Per-branch version check**: `checkAgentStatus()` and `checkAgentVersionMatch()` in printService.js now pass `branch_id` to `/api/print-queue/agent-status`, so each cashier sees **their own branch's** agent version, not "any recent heartbeat". Fixes false "يحتاج تحديث 6.2.0→6.3.1" on already-updated branches.

## Session: Feb 23, 2026 - Print Agent v6.3.0 (Fast Multi-Branch)

### Print Agent Performance + Multi-Branch Reliability
- Version bumped 6.2.0 → **6.3.0** (forces all branches to auto-update via existing checker)
- Polling interval: 3s → **1s** (idle) / **100ms** (queue active) — ~20x faster receipt dispatch
- Polling limit: 10 → **20 jobs/poll** (burst draining)
- Web request timeout: 10s → 8s (faster error recovery)
- `$jobCount` properly initialized before try-block
- **printService.js**: new `resolveBranchId()` fallback chain (printer.branch_id → localStorage.selectedBranchId → user.branch_id) — guarantees every queued print job carries a valid branch_id even when printer config is missing it (root cause of new-branch invoices not dispatching)
- Backend endpoints verified via curl: queue/pending/heartbeat all working for both new (branch-isolated) and old (cross-branch) agents


## Session: April 17-19, 2026

### Print Agent (v6.1.1)
- Real heartbeat mechanism (agent_version + device_id in polling URL)
- USB print fix in Start-Job (compiles JobRawPrinter + JobReceiptRenderer C#)
- Test print shows printer name, IP, connection type
- Version comparison for update notifications
- Watchdog VBScript wrapper (no blue PowerShell flash)
- Download button always visible for multi-branch

### Receipts & Printing
- Closing receipt: real restaurant logo (async loadImg), name, branch name
- Print Bill always shows "غير مدفوعة" for pending orders
- Kitchen receipt quantity font enlarged (20→28)
- Printer settings now execute: show_prices, print_all_orders, auto_print
- routeOrderToPrinters respects print_individual_items and auto_print_on_order

### Multi-Branch Support
- POS fetches printers per branch (GET /printers?branch_id=xxx)
- Branch filter tabs in Settings printer list
- Product printer linking grouped by branch name
- Print Queue sends branch_id with jobs
- Owner releases from cashier when switching branches (/shifts/current?branch_id)
- Cashier selection filtered by branch with branch name shown
- Cash register closing follows selected branch
- POST /shifts/open for owner to open shift on any branch

### Reports & Closing
- Individual shift view with toggle (individual/combined)
- Active shifts show with real-time data from /shifts/active-shift-details
- Delivery app sales separated from credit ("آجل") in shift details
- GET /reports/expenses endpoint (excludes refunds)
- Refunds excluded from expenses everywhere (API + frontend + closing report)
- Expenses filtered by date field (not created_at)
- Closing report fallback query includes branch_id

### Permissions & Security
- Cashier cannot delete items after order saved (owner only)
- pos_discount permission enforced (field hidden if disabled)
- pos_cancel permission enforced (error message if disabled)
- pos_refund uses hasPermission() consistently
- Cashier sees only own expenses for today only
- Manager/owner sees all expenses with full filters

### Orders
- "Save and Send" saves payment_method: 'pending' (not counted as sale until paid)

### Offline
- OfflineBanner: position fixed + z-index 99999 (visible on all systems)
- Connection check every 10 seconds (was 30)
- 4 states: connected/disconnected/syncing/success

### Data Fixes
- ShiftResponse model: branch_id, opening_cash, started_at made optional
- Fallback for old shifts: opening_balance→opening_cash, opened_at→started_at
- Cleaned 9 refund expenses from DB

## 2026-04-22 — business_date (اليوم التشغيلي) + Refund-exclusion fix (75K IQD discrepancy)
### Problem
- مصاريف صفحة "المصاريف اليومية" = 339,000 د.ع
- مصاريف "إغلاق الصندوق/التقارير" = 414,000 د.ع
- فرق 75,000 د.ع ناتج عن:
  1. المرتجعات (category=refund) كانت تُحسب ضمن مصاريف الوردية عند الإغلاق (لا يجب)
  2. الورديات التي تتجاوز منتصف الليل كانت تُسجَّل تحت اليوم الجديد في التقارير

### Fix
- Added `business_date` field (YYYY-MM-DD بتوقيت العراق) to:
  - `shifts` (مُحسب من started_at عند فتح الوردية)
  - `orders`, `expenses`, `advances`, `deductions`, `bonuses`, `overtime_requests` (تُرَث من الوردية المفتوحة)
- Auto-migration on backend startup (idempotent): يُضيف business_date للسجلات القديمة + يُعيد حساب total_expenses للورديات المُغلقة مع استبعاد المرتجعات
- Helper: `iraq_date_from_utc(iso_str)` و `_resolve_business_date(tenant, branch)`
- Endpoints updated to filter by business_date (مع fallback للـ created_at/date للسجلات القديمة):
  - GET /api/expenses
  - GET /api/break-even/daily, /api/break-even/daily-range
  - GET /api/reports/cash-register-closing
  - GET /api/shifts (أضيف date_from/date_to/date)
- 5 مواقع في shifts_routes.py تستبعد الآن category=refund من total_expenses
- OrderResponse + ShiftResponse models: added business_date field
- Migration endpoint: POST /api/admin/migrate-business-dates (صلاحية مالك فقط، آمن لإعادة التشغيل)
- Frontend Reports.js: filter shifts by business_date عند توفره

### Testing
- 14/15 pytest tests PASS (1 skipped — no open shift)
- 32 historical closed shifts had total_expenses recomputed on startup
- Migration verified idempotent (second run = 0 updates)

## 2026-04-22 (المتابعة) — فلاتر وتحسينات التقارير + احتساب الرواتب بالجملة

### Comprehensive Report UX Fix
- استبدال حقلي التاريخ اليدوية في "التقرير الشامل" بـ dropdown "الفترة" (مثل "التقرير الذكي"):
  - اليوم، أمس، هذا الأسبوع، هذا الشهر، الشهر السابق، 6 أشهر، سنة، مخصص
  - حساب النطاق تلقائياً عند تغيير الفترة (JavaScript client-side)
  - عند اختيار "مخصص" تظهر حقول التاريخ اليدوية

### Smart Report — New Period Options
- إضافة 3 خيارات جديدة للـ Smart Report: الشهر السابق، 6 أشهر، سنة (مضافة لليوم وأمس والأسبوع والشهر القائمة)
- Backend `/api/smart-reports/sales` & `/api/smart-reports/products`:
  - `yesterday`: يوم أمس (00:00 → 23:59 UTC)
  - `last_month`: الشهر الميلادي السابق كاملاً
  - `six_months`: 180 يوم
  - `year`: 365 يوم

### Expenses Report — Cashier Filter (P1)
- Backend `/api/reports/expenses` يقبل `cashier_id` جديد (يفلتر حسب `created_by`)
- Frontend: dropdown لاختيار الكاشير فوق تبويب المصاريف

### Bulk Payroll Calculation (P1)
- زر "احتساب الرواتب بالجملة" في تبويب الرواتب بـ HR
- يحتسب ويحفظ كشف راتب لكل موظف لا يملك واحداً في الشهر الحالي
- مع toast نتيجة (نجاح/فشل لكل موظف)

### business_date Filter Extension
- `/api/reports/sales, /purchases, /products, /expenses, /profit-loss, /delivery-credits` الآن تفلتر بـ `business_date` مع fallback لـ `created_at`/`date` للسجلات القديمة
- Helper مشترك: `_apply_business_date_filter(query, start_date, end_date)`

### Testing
- 36/36 pytest tests PASS (iteration 167)
- جميع الـ endpoints الـ 9 المحدّثة تعمل بدون أخطاء MongoDB $or/$and conflicts
- Migration تبقى idempotent


## 2026-04-22 (متابعة ثانية) — حذف المصاريف + تصحيح شامل لـ business_date

### المشاكل المبلّغ عنها من العميل:
- مصروف "صيانة قلاية بطاطا 75,000 د.ع" ظهر خطأً في يوم 21 (سجل قديم من إعادة تصفير النظام — لم يُحذف)
- طلبات ما بعد منتصف الليل (يوم 22) كانت تظهر تحت يوم 22 رغم أنها تتبع شفت 21
- إغلاق الصندوق يقرأ 414,000 د.ع بدل 339,000 د.ع الصحيحة

### الإصلاحات (8/8 اختبار نجح)
**1. إضافة حذف المصاريف**
- NEW `DELETE /api/expenses/{expense_id}` — صلاحية المالك/المدير فقط
- يحذف المصروف ثم **يُعيد احتساب `total_expenses` و `expected_cash`** لأي وردية يقع ضمن فترتها (مستثنيةً category=refund)
- زر حذف 🗑️ (يظهر عند hover) لكل مصروف في "مصاريف كل موظف" بتقرير المصاريف
- `toast` يؤكد إعادة احتساب الوردية

**2. business_date في جميع مسارات إنشاء الطلبات**
- `POST /api/customer/orders` (طلبات العميل عبر قائمة QR) — الآن تُضيف business_date من الوردية المفتوحة
- `POST /api/sync/orders` (مزامنة الطلبات Offline) — business_date مضاف
- `POST /api/customer/orders` (sandbox) — business_date مضاف

**3. Auto-migration v2 (تصحيحي)**
- عند إقلاع backend، يُشغَّل تصحيح تلقائي لـ **الطلبات التي تم ترحيلها سابقاً بـ business_date خاطئ**
- يستخدم `shift_id` أولاً، وإلا branch+time matching لإيجاد الوردية الصحيحة
- يُخزن flag في `system_flags` لمنع التكرار

**4. Force migration param**
- `POST /api/admin/migrate-business-dates?force=true` — إعادة احتساب business_date لجميع السجلات حتى الموجودة
- يُعدّ فقط التغييرات الفعلية في stats (idempotent)

**5. POST /api/expenses: live shift total update**
- عند إضافة مصروف جديد، يُحدَّث `total_expenses` و `expected_cash` للوردية المفتوحة فوراً
- متناغم مع منطق الحذف — النظام الآن متسق 100%

### النتيجة للعميل:
1. يستطيع الآن حذف أي مصروف خاطئ من الواجهة (يتم إعادة احتساب الوردية تلقائياً)
2. جميع الطلبات بعد منتصف الليل ستبقى مرتبطة بـ شفت 21 (business_date = 21)
3. إغلاق الصندوق سيُظهر القيمة الصحيحة بعد حذف المصروف اليتيم

## 2026-04-22 (متابعة) — دعم Multi-Branch للوسيط + إصلاحات Settings

### المشاكل المُبلَّغة:
- عند إضافة فرع ثالث: الوسيط يتأخر في الطباعة ويفقد الاتصال
- خطأ `TypeError: undefined.length` عند تعديل إعدادات الطابعة
- خطأ `422` عند حفظ إعدادات الطابعة
- الوسيط يسحب أوامر من كل الفروع بدون عزل (conflict)

### الإصلاحات:
**1. عزل الوسيط لكل فرع (Multi-Branch Safe)**
- `GET /api/print-queue/pending` يتطلب الآن **`branch_id`** صارماً
- كل agent يُحمَّل بـ `branch_id` محقون في ملف ps1 عبر `{{BRANCH_ID}}`
- `heartbeat` منفصل لكل `(device_id, branch_id)` — لا تتداخل حالات الفروع
- يعمل مع **100+ فرع** دون تعارض

**2. حوار اختيار الفرع قبل تحميل الوسيط**
- زر "تحميل الوسيط" يُظهر dialog لاختيار الفرع المستهدف
- `/download-print-agent?branch_id=X` — الرابط يتضمن معرّف الفرع
- لو فرع واحد فقط: تحميل مباشر بدون سؤال

**3. إصلاح TypeError في Settings**
- `listAgentPrinters()` الآن يُرجع object `{agentOffline, needsUpdate, printers: []}` (بدل مصفوفة فارغة)
- لا مزيد من crash عند قراءة `result.printers.length`

**4. إصلاح 422 على PUT /api/printers/{id}**
- حذفت تعريف `PrinterCreate` المكرر في السطر 15873 → أُعيد تسميته `InvoicePrinterCreate`
- الآن الـ endpoint يستخدم الـ model الصحيح (يشمل usb_printer_name, print_mode, show_prices, ...)

**5. إصلاح 500 على GET /api/branches**
- `BranchResponse`: الحقول `address, phone, created_at` أصبحت اختيارية (لتدعم فروع قديمة ناقصة البيانات)

**6. bump version: 6.1.2 → 6.2.0**
- الإجبار على إعادة تحميل الوسيط على جميع الفروع مع branch_id المحقون

### الاختبارات (PASS):
- ✅ `/print-agent-script?branch_id=X` يحقن الـ ID في ps1
- ✅ `/print-queue/pending` بدون branch_id يُرجع `{warning: "branch_id required"}`
- ✅ `/print-queue/pending?branch_id=X` يُرجع فقط أوامر ذلك الفرع
- ✅ الواجهة لا تعطي TypeError بعد إصلاح listAgentPrinters

### ملاحظة للنشر:
بعد تحديث production، **يجب إعادة تحميل الوسيط على كل فرع** لحقن `branch_id` الخاص به.

## 2026-04-22 (تحسين) — لوحة مراقبة الوسطاء (Agents Monitor)

### الميزة الجديدة
أضيفت لوحة مراقبة مباشرة في **Settings → الطابعات** تعرض حالة وسيط الطباعة في كل فرع.

### الميزات:
- ✅ عرض كل فرع مع حالته: `متصل` / `بطيء` / `غير متصل` / `غير مثبّت`
- ✅ نسخة الوسيط لكل فرع (v6.2.0)
- ✅ آخر heartbeat (منذ كم ثانية/دقيقة/ساعة)
- ✅ شريط ملخص بأعداد الفروع في كل حالة
- ✅ **تحديث تلقائي كل 15 ثانية** (يعمل في الخلفية)
- ✅ مؤشر نابض 💚 للوسطاء الشغّالة، ⚠️ للبطيئة، ✖ للمنقطعة
- ✅ قابل للطي/التوسيع لتوفير المساحة
- ✅ alert تلقائي لحظة انقطاع أي فرع

### Backend (`/api/print-queue/agents-monitor`):
- يجلب `agent_heartbeats` من آخر 24 ساعة
- يطابق كل heartbeat بالفرع المرتبط به
- يُضيف الفروع بدون وسيط كـ `not_installed`
- يعيد summary فيه: total, online, offline, warning, not_installed

### حالات الـ agent:
| Status | المدة منذ آخر heartbeat |
|---|---|
| `online` ● | < 30 ثانية |
| `warning` ⚠️ | 30ث - 5 دقائق |
| `offline` ✖ | > 5 دقائق |
| `not_installed` ○ | لا يوجد heartbeat |

### مزايا للعميل مع 10+ فروع:
- يعرف فوراً عند انقطاع أي فرع (بدل اكتشافها بعد توقف الطباعة)
- يرى نسخة كل وسيط (لمعرفة إذا يحتاج تحديث)
- لا حاجة لدخول كل فرع للتحقق
- UX احترافي مع ألوان واضحة وتحديث حي

## 2026-04-22 (إصلاحات حرجة للفروع 2 و 3) — الطباعة وبطء الفحص

### المشاكل المُبلَّغة:
- فحص الطابعة يتأخر 30-40 ثانية قبل ظهور النتيجة
- "فشل في إرسال الأمر للمطبخ" عند حفظ الطلب رغم أن الوسيط يظهر متصل
- 422 عند حفظ إعدادات الطابعة
- الفرع الأول يعمل، الفروع 2 و 3 لا تعمل

### الإصلاحات الجذرية:

**1. 🐌 بطء 30-40 ثانية (Chrome Private Network Access block)**
- السبب: `AgentUpdateChecker` كان يستدعي `http://localhost:9999/status` كل 30 ثانية
- Chrome يحجب HTTPS → localhost بسياسة PNA → الاستدعاء يبقى معلقاً 10-20ث قبل الفشل
- تراكم ذلك يسبب 30-40ث تأخير في كل عملية UI
- ✅ **الحل**: استبدال الاستدعاء المباشر بـ `GET /api/print-queue/agent-status` (backend heartbeat) — لا CORS ولا PNA، سرعة فورية

**2. 📨 "فشل إرسال الأمر للمطبخ"**
- السبب: print jobs كانت تُنشأ بـ `branch_id=""` فارغ
- الوسيط يطلب `?branch_id=X` — لا يجد أوامر → يبدو "فشل"
- ✅ **الحل**: POST `/api/print-queue` الآن يأخذ `branch_id` من المستخدم الحالي تلقائياً إذا لم يُرسل
- يضمن كل أمر يصل لوسيط الفرع الصحيح حتى لو نسي frontend إرساله

**3. 🚫 422 على PUT /api/printers/{id}**
- السبب: `PrinterCreate` model كان يتطلب `branch_id: str` صارماً
- ✅ **الحل**:
  - `branch_id: Optional[str] = ""` (اختياري)
  - `model_config = ConfigDict(extra="ignore")` (يتجاهل حقول إضافية)
  - لا مزيد من 422 عند تحديث طابعة

### النتيجة:
- ⚡ الواجهة سريعة (لا تعليق 30-40ث)
- ✅ الطباعة تعمل في كل فرع بمعزل عن الآخر
- ✅ حفظ/تحديث إعدادات الطابعة بدون أخطاء

### اختبارات تمت:
- `POST /api/print-queue` بدون branch_id → يستخدم branch_id المستخدم ✅
- `PUT /api/printers/{id}` بحقول جزئية → 200 OK ✅
- Frontend lint → No issues ✅
