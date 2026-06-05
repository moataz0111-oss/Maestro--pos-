#!/usr/bin/env bash
# ============================================================================
# بوابة اختبارات الحسابات المالية الحرجة (Financial CI Gate)
# تُشغَّل في GitHub Actions قبل بناء/نشر التطبيق.
# إن فشل أي اختبار → تتوقف خطوة النشر تلقائياً (يمنع نشر كود يكسر الحسابات).
#
# لماذا كل ملف في عملية pytest منفصلة؟
# بعض الاختبارات تُرقِّع (mock) متغيّرات DB عامة على مستوى الوحدة، فتشغيلها معاً
# في نفس العملية يلوّث الحالة بين الملفات ويُنتج إخفاقات كاذبة. العزل يحلّ ذلك.
#
# يتطلّب: متغيّر البيئة MONGO_URL يشير إلى MongoDB قابل للوصول (خدمة CI).
# ============================================================================
set -u
cd "$(dirname "$0")/.." || exit 1

FILES=(
  test_server_import_smoke          # يضمن أن server.py وكل المسارات تُستورد بلا أخطاء
  test_enrich_unit_cost             # توحيد تكلفة الوحدة بين الصفحات
  test_reports_unified_cost_resolver # حلّال التكلفة الموحّد في التقارير
  test_piece_def_priority_yield     # أولوية تعريف القطعة في حساب العائد
  test_piece_definition_iter194     # تعريف القطعة يقود العائد والتكلفة
  test_production_yield_piece_def   # عائد الإنتاج حسب تعريف القطعة
  test_recipe_ingredient_model      # نموذج مكوّنات الوصفة
  test_ingredient_auto_resolve      # حلّ المكوّنات تلقائياً
  test_reset_quantity               # تصفير الكميات
  test_delete_purchase              # حذف فاتورة شراء وأثره على المخزون
  test_arabic_normalize             # تطبيع النص العربي (مطابقة الأسماء)
)

RC=0
PASS=0
FAIL=0
for f in "${FILES[@]}"; do
  echo "▶️  $f"
  if python3 -m pytest "tests/$f.py" -q --no-header; then
    echo "✅ $f"
    PASS=$((PASS+1))
  else
    echo "❌ $f FAILED"
    FAIL=$((FAIL+1))
    RC=1
  fi
done

echo ""
echo "================ النتيجة: نجح $PASS | فشل $FAIL ================"
if [ "$RC" -ne 0 ]; then
  echo "🛑 فشلت اختبارات الحسابات المالية — تم إيقاف النشر."
  exit 1
fi
echo "✅ كل اختبارات الحسابات نجحت — متابعة النشر."
