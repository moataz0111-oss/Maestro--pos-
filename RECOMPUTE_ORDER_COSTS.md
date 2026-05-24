# 🔧 إعادة حساب تكلفة الطلبات القديمة

> **متى تستخدم هذا؟** بعد نشر HOTFIX منطق التكلفة الموحَّد (24/05/2026)، الطلبات السابقة لا تزال تحمل قيم تكلفة محسوبة بالكود القديم الخاطئ. هذا endpoint يُعيد حسابها كلها.

## الاستخدام

### 1. تجربة بدون كتابة (Dry-run) — موصى به أولاً
يعرض الفروقات فقط دون لمس قاعدة البيانات:
```bash
TOKEN="<token-المسؤول>"
curl -X POST "https://your-domain.com/api/orders/recompute-costs?days=30&dry_run=true" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

### 2. التنفيذ الفعلي (يكتب على الـ DB)
بعد التأكد من نتائج الـ dry-run:
```bash
curl -X POST "https://your-domain.com/api/orders/recompute-costs?days=30&dry_run=false" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

## المخرجات
```json
{
  "examined": 1247,
  "updated": 892,
  "unchanged": 355,
  "total_old_cost": 12480000,
  "total_new_cost": 4350000,
  "total_cost_delta": -8130000,
  "samples": [
    {
      "order_id": "...",
      "created_at": "...",
      "old_total_cost": 18500,
      "new_total_cost": 2150,
      "delta": -16350
    }
  ],
  "dry_run": true
}
```

## الأمان
- يتطلب صلاحية `admin`, `owner`, `super_admin`, أو `manager`.
- يحترم `tenant_id` تلقائياً (متعدد المستأجرين).
- يحفظ علامة `cost_recomputed_at` على كل طلب مُعدَّل (للتتبع).

## المعايير
| Param | Type | افتراضي | الوصف |
|---|---|---|---|
| `days` | int | 30 | عدد الأيام الماضية |
| `dry_run` | bool | true | لو `false` يكتب فعلياً |

## ملاحظة
- الطلبات الأحدث من تاريخ HOTFIX (24/05/2026) تكون صحيحة أصلاً، فلن تتغير.
- يمكنك تشغيله على نطاق تواريخ مختلفة (`days=90` للربع، `days=365` للسنة).
