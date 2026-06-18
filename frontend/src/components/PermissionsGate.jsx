import React, { useEffect, useState } from 'react';
import { Bell, Mic, Volume2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { requestAllPermissions, getPermissionStatus, initAudioAutoUnlock } from '../lib/permissions';

/**
 * PermissionsGate — شريط يطلب صلاحيات الإشعارات والميكروفون والصوت.
 * يظهر مرة واحدة فقط؛ بعد المنح يُحفظ ولا يظهر مجدداً. يعمل بنقرة المستخدم (مطلوب على iPhone/Android).
 */
export const PermissionsGate = ({ withMic = true, compact = false }) => {
  const [status, setStatus] = useState(getPermissionStatus());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setStatus(getPermissionStatus());
    // فتح قفل الصوت تلقائياً عند أول لمسة (دون إظهار أي طلب) لمن سبق منحه الصلاحيات
    initAudioAutoUnlock();
  }, []);

  // مُنحت سابقاً ومحفوظة → لا نطلبها مرة أخرى أبداً
  const granted = status.notifications === 'granted' || status.saved;
  const unsupported = status.notifications === 'unsupported';

  const handleEnable = async () => {
    setBusy(true);
    const res = await requestAllPermissions({ withMic });
    setStatus(getPermissionStatus());
    setBusy(false);
    if (res.notifications === 'granted') {
      toast.success('✅ تم تفعيل الإشعارات والصوت (محفوظ، لن يُطلب مجدداً)');
    } else if (res.notifications === 'denied') {
      toast.error('تم رفض إذن الإشعارات. فعّله من إعدادات المتصفح/الهاتف.');
    } else if (res.notifications === 'unsupported') {
      toast.info('لتفعيل الإشعارات على آيفون: ثبّت التطبيق على الشاشة الرئيسية أولاً (مشاركة → إضافة إلى الشاشة الرئيسية).');
    }
  };

  if (granted || unsupported) return null;

  return (
    <div
      className="rounded-2xl p-4 mb-3 flex items-center gap-3"
      data-testid="permissions-gate"
      style={{ background: 'linear-gradient(160deg, #0c1a3d, #0a1430)', border: '1px solid rgba(246,166,35,0.4)' }}
    >
      <div className="flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center" style={{ background: 'rgba(246,166,35,0.15)' }}>
        <Bell className="w-5 h-5" style={{ color: '#f6a623' }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold" style={{ color: '#f6d488' }}>فعّل الإشعارات والمكالمات</p>
        {!compact && (
          <p className="text-xs mt-0.5 flex items-center gap-2 flex-wrap" style={{ color: '#aeb6cc' }}>
            <span className="inline-flex items-center gap-1"><Bell className="w-3 h-3" /> إشعارات</span>
            {withMic && <span className="inline-flex items-center gap-1"><Mic className="w-3 h-3" /> ميكروفون</span>}
            <span className="inline-flex items-center gap-1"><Volume2 className="w-3 h-3" /> رنين</span>
          </p>
        )}
      </div>
      <button
        onClick={handleEnable}
        disabled={busy}
        data-testid="enable-permissions-btn"
        className="flex-shrink-0 px-4 py-2.5 rounded-full text-sm font-extrabold transition-transform active:scale-95 disabled:opacity-60 inline-flex items-center gap-1.5"
        style={{ background: 'linear-gradient(160deg, #ffe08a, #f6a623)', color: '#08122e', boxShadow: '0 8px 20px rgba(246,166,35,0.35)' }}
      >
        {busy ? '...' : (<><CheckCircle2 className="w-4 h-4" /> تفعيل</>)}
      </button>
    </div>
  );
};

export default PermissionsGate;
