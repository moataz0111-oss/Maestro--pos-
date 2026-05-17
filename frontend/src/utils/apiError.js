/**
 * Maestro EGP — Safe API Error Handling
 * يمنع React Error #31 الناتج عن تمرير كائنات Pydantic ValidationError إلى toast.
 * يعرض رسالة مختصرة في toast مع زر "عرض التفاصيل" يفتح modal به جدول الحقول/الأخطاء.
 */

import { toast } from 'sonner';

const EVENT_NAME = 'maestro:show-api-error-details';

/**
 * يستخرج رسالة نصية واحدة من خطأ axios/FastAPI بدون مخاطر crash.
 */
export function safeErrorMessage(error, fallback = 'حدث خطأ') {
  const d = error?.response?.data?.detail;
  if (!d) return fallback;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) {
    const msgs = d
      .map((e) => (typeof e === 'string' ? e : e?.msg || ''))
      .filter(Boolean);
    return msgs.join(' · ') || fallback;
  }
  if (typeof d === 'object') {
    return d.msg || d.message || fallback;
  }
  return String(d) || fallback;
}

/**
 * يبني صفّاً واحداً لكل خطأ validation:
 *  { field: 'body.name', msg: 'Field required', type: 'missing', input: ... }
 */
function normalizeValidationErrors(error) {
  const d = error?.response?.data?.detail;
  if (!d) return [];
  if (typeof d === 'string') {
    return [{ field: '-', msg: d, type: 'error' }];
  }
  if (Array.isArray(d)) {
    return d.map((e) => {
      if (typeof e === 'string') {
        return { field: '-', msg: e, type: 'error' };
      }
      // Pydantic v2: {type, loc, msg, input, url}
      const loc = Array.isArray(e?.loc) ? e.loc.filter((x) => x !== 'body').join('.') : (e?.loc || '-');
      return {
        field: loc || '-',
        msg: e?.msg || e?.message || '-',
        type: e?.type || 'validation',
        input: e?.input,
      };
    });
  }
  if (typeof d === 'object') {
    if (Array.isArray(d.insufficient_materials)) {
      return d.insufficient_materials.map((m) => ({
        field: m.name || '-',
        msg: `مطلوب ${m.needed} ${m.unit || ''} — متوفر ${m.available} ${m.unit || ''}`,
        type: 'مواد غير كافية',
      }));
    }
    return [{ field: '-', msg: d.msg || d.message || JSON.stringify(d), type: 'error' }];
  }
  return [];
}

/**
 * Toast مختصر + زر "عرض التفاصيل" يفتح modal كامل.
 * استخدمها في كل catch block بدلاً من toast.error(error.response?.data?.detail || ...).
 */
export function showApiError(error, fallback = 'حدث خطأ') {
  const rows = normalizeValidationErrors(error);
  const status = error?.response?.status;
  const headline = safeErrorMessage(error, fallback);

  const hasDetails = rows.length > 0 && !(rows.length === 1 && rows[0].field === '-');

  if (hasDetails) {
    toast.error(headline, {
      duration: 7000,
      action: {
        label: 'عرض التفاصيل',
        onClick: () => {
          window.dispatchEvent(
            new CustomEvent(EVENT_NAME, {
              detail: {
                title: fallback,
                status,
                rows,
                rawDetail: error?.response?.data?.detail,
              },
            })
          );
        },
      },
    });
  } else {
    toast.error(headline, { duration: 5000 });
  }
}

export const API_ERROR_EVENT = EVENT_NAME;
