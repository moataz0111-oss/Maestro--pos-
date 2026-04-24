/**
 * Maestro POS - Agent Update Checker v7
 * إشعار toast بسيط للمالك فقط عند توفر نسخة جديدة
 * - يظهر toast لمرة واحدة عند ظهور نسخة جديدة (يختفي تلقائياً بعد ~6 ثواني)
 * - الـbanner الدائم لم يعد موجوداً
 * - التحديث الفعلي يتم من Settings → الطابعات → "تحميل وسيط الطباعة"
 */
import { useEffect, useRef } from 'react';
import { API_URL } from './api';
import { toast } from 'sonner';

/** قراءة المستخدم الحالي من localStorage */
function getCurrentUserRole() {
  try {
    const userStr = localStorage.getItem('user');
    if (!userStr) return null;
    const u = JSON.parse(userStr);
    return u?.role || null;
  } catch {
    return null;
  }
}

export function AgentUpdateBanner({ t = (s) => s }) {
  const checkedRef = useRef(false);

  useEffect(() => {
    // المالك فقط
    const role = getCurrentUserRole();
    const isOwner = role === 'admin' || role === 'super_admin';
    if (!isOwner) return;
    if (checkedRef.current) return;
    checkedRef.current = true;

    const checkOnce = async () => {
      try {
        const r = await fetch(`${API_URL}/print-agent-version`);
        const d = await r.json();
        const reqV = d.version;
        if (!reqV) return;

        // هل سبق وعُرِض هذا الإصدار؟ → لا نُكرّر
        const shownKey = `agent_update_toast_shown_${reqV}`;
        if (localStorage.getItem(shownKey)) return;

        // عرض toast لمرة واحدة فقط
        toast.info(
          `${t('تحديث وسيط الطباعة متاح')} (v${reqV})`,
          {
            description: t('للتحديث: الإعدادات ← الطابعات ← تحميل وسيط الطباعة'),
            duration: 6000,
            id: `agent-update-${reqV}`
          }
        );
        localStorage.setItem(shownKey, '1');
      } catch {}
    };
    // تأخير 1.5 ثانية لنترك الصفحة تكتمل تحميل
    const tm = setTimeout(checkOnce, 1500);
    return () => clearTimeout(tm);
  }, [t]);

  // لا يُعرض شيء دائم على الشاشة
  return null;
}
