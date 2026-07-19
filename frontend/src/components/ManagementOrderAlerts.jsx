/**
 * ManagementOrderAlerts — تنبيهات للإدارة (مالك/مدير/مدير عام/مشرف).
 * تظهر عندما لا يوافق الكاشير على طلب خلال 5 دقائق (تأخير) أو عند رفض الكاشير للطلب.
 * قابلة للطي إلى شارة صغيرة لتجنّب حجب أزرار الواجهة (خصوصاً في /coupons و /settings).
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { API_URL } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { AlertTriangle, X, MapPin, User, Banknote, Package, Store, ChevronDown, ChevronUp } from 'lucide-react';

const API = API_URL;
const MANAGEMENT_ROLES = ['admin', 'general_manager', 'manager', 'owner', 'super_admin', 'supervisor', 'branch_manager'];

export const ManagementOrderAlerts = () => {
  const { user, isAuthenticated } = useAuth();
  const [alerts, setAlerts] = useState([]);
  // افتراضياً مطوية لتجنّب حجب أزرار الواجهة — المستخدم يفتحها بالنقر على الشارة
  const [collapsed, setCollapsed] = useState(true);
  const dismissedRef = useRef(new Set());

  const branchId = user?.branch_id || null;
  const enabled = isAuthenticated && MANAGEMENT_ROLES.includes(user?.role);

  const poll = useCallback(async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    try {
      const params = new URLSearchParams();
      if (branchId) params.append('branch_id', branchId);
      const res = await axios.get(`${API}/order-notifications/escalations?${params.toString()}`);
      const list = (res.data?.escalations || []).filter((a) => !dismissedRef.current.has(a.id));
      setAlerts(list);
      // عند وصول أول تنبيه من دفعة جديدة، افتحها تلقائياً لجذب انتباه المدير
      if (list.length > 0 && collapsed && !localStorage.getItem('mgmt_alerts_manual_collapse')) {
        setCollapsed(false);
      }
    } catch (e) { /* noop */ }
  }, [branchId, collapsed]);

  useEffect(() => {
    if (!enabled) return;
    poll();
    const iv = setInterval(poll, 8000);
    return () => clearInterval(iv);
  }, [enabled, poll]);

  const dismiss = async (a) => {
    dismissedRef.current.add(a.id);
    setAlerts((prev) => prev.filter((x) => x.id !== a.id));
    try { await axios.put(`${API}/order-notifications/${a.id}/read`); } catch (e) { /* noop */ }
  };

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    // حفظ اختيار المستخدم اليدوي في نفس الجلسة
    if (next) localStorage.setItem('mgmt_alerts_manual_collapse', '1');
    else localStorage.removeItem('mgmt_alerts_manual_collapse');
  };

  if (!enabled || alerts.length === 0) return null;

  const hasRejected = alerts.some((a) => a.alert_kind === 'rejected');
  const badgeColor = hasRejected ? 'bg-red-600' : 'bg-amber-600';
  const badgeBorder = hasRejected ? 'border-red-400/50' : 'border-amber-400/50';

  // ===== الحالة المطويّة: شارة عائمة صغيرة لا تحجب أزرار الواجهة =====
  if (collapsed) {
    return createPortal((
      <button
        onClick={toggleCollapse}
        data-testid="management-alerts-collapsed-badge"
        className={`fixed bottom-4 left-4 z-[9998] flex items-center gap-2 rounded-full ${badgeColor} ${badgeBorder} border-2 text-white shadow-2xl px-4 py-2 hover:scale-105 transition-transform`}
        title="عرض تنبيهات الإدارة"
      >
        <AlertTriangle className="h-4 w-4 animate-pulse" />
        <span className="font-bold text-sm">{alerts.length}</span>
        <ChevronUp className="h-4 w-4" />
      </button>
    ), document.body);
  }

  // ===== الحالة الموسّعة: البطاقات الكاملة =====
  return createPortal((
    <div className="fixed bottom-4 left-4 z-[9998] flex flex-col gap-3 max-w-sm w-full pointer-events-none" data-testid="management-order-alerts">
      {/* شريط التحكم: زر الطي في الأعلى */}
      <div className="pointer-events-auto flex justify-start">
        <button
          onClick={toggleCollapse}
          data-testid="management-alerts-collapse-btn"
          className="flex items-center gap-1 rounded-full bg-slate-800/90 border border-slate-600 text-slate-200 shadow-lg px-3 py-1 hover:bg-slate-700 text-xs"
          title="طيّ التنبيهات"
        >
          <ChevronDown className="h-3.5 w-3.5" />
          <span>طيّ</span>
        </button>
      </div>
      {alerts.slice(0, 3).map((a) => {
        const isRejected = a.alert_kind === 'rejected';
        return (
          <div
            key={a.id}
            data-testid={`management-alert-${a.order_id}`}
            className={`pointer-events-auto rounded-2xl shadow-2xl border overflow-hidden text-white animate-in slide-in-from-left-4 ${isRejected ? 'bg-gradient-to-b from-red-900 to-red-800 border-red-500/40' : 'bg-gradient-to-b from-amber-900 to-amber-800 border-amber-500/40'}`}
          >
            <div className="flex items-center justify-between px-4 py-2 bg-black/20">
              <span className="flex items-center gap-2 text-sm font-bold">
                <AlertTriangle className={`h-4 w-4 ${isRejected ? 'text-red-300' : 'text-amber-300'}`} />
                {isRejected ? 'طلب مرفوض من الكاشير' : 'طلب لم يوافق عليه الكاشير'}
              </span>
              <button onClick={() => dismiss(a)} data-testid={`dismiss-alert-${a.order_id}`} className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="p-4 space-y-1.5 text-sm">
              <p className="text-base font-extrabold">#{a.order_number}</p>
              <p className="flex items-center gap-2"><Store className="h-4 w-4 opacity-80" /> <span className="opacity-80">الفرع:</span> <span className="font-semibold">{a.branch_name || 'غير محدد'}</span></p>
              <p className="flex items-center gap-2"><User className="h-4 w-4 opacity-80" /> <span className="opacity-80">الكاشير:</span> <span className="font-semibold">{a.cashier_name || 'غير معروف'}</span></p>
              <p className="flex items-center gap-2"><User className="h-4 w-4 opacity-80" /> <span className="opacity-80">الزبون:</span> <span className="font-semibold">{a.customer_name || '—'}</span></p>
              {a.delivery_address && (
                <p className="flex items-start gap-2"><MapPin className="h-4 w-4 opacity-80 mt-0.5" /> <span className="opacity-80">العنوان:</span> <span className="font-semibold">{a.delivery_address}</span></p>
              )}
              <p className="flex items-center gap-2"><Package className="h-4 w-4 opacity-80" /> <span className="opacity-80">الأصناف:</span> <span className="font-semibold">{a.items_count || 0}</span></p>
              <p className="flex items-center gap-2"><Banknote className="h-4 w-4 opacity-80" /> <span className="opacity-80">المبلغ:</span> <span className="font-semibold">{Number(a.total_amount || 0).toLocaleString()} IQD</span></p>
              {a.reason && <p className="text-xs opacity-80 mt-1">{a.reason}</p>}
            </div>
          </div>
        );
      })}
    </div>
  ), document.body);
};

export default ManagementOrderAlerts;
