// تاريخ محلي YYYY-MM-DD حسب توقيت جهاز المستخدم (العراق) — وليس UTC.
// toISOString() يُرجع تاريخ UTC فيُزيح اليوم للخلف لمستخدمي +3 → خطأ فلاتر التقارير.
export const localDate = (d = new Date()) => {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};
