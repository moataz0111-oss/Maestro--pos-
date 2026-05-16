# Maestro EGP - Changelog

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
