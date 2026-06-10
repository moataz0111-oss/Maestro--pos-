/**
 * IncomingOrderCall — إشعار طلب جديد للكاشير على شكل "مكالمة واردة" (صوت + ملء الشاشة).
 * عند القبول: تُعرض تفاصيل الطلب (اسم/هاتف/عنوان الزبون) مع إسناد سائق.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { API_URL } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';
import { toast } from 'sonner';
import { Phone, PhoneOff, MapPin, User, Banknote, Package, Bike, X, CheckCircle } from 'lucide-react';

const API = API_URL;
const ALLOWED_ROLES = ['cashier', 'admin', 'manager', 'owner', 'super_admin'];

export const IncomingOrderCall = () => {
  const { user, isAuthenticated } = useAuth();
  const [call, setCall] = useState(null);          // الإشعار الوارد المعروض الآن
  const [accepted, setAccepted] = useState(false); // بعد القبول نعرض التفاصيل
  const [order, setOrder] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [assigning, setAssigning] = useState(false);
  const [deliveryFee, setDeliveryFee] = useState('');
  const [feeHint, setFeeHint] = useState(null);
  const handledRef = useRef(new Set());
  const ringRef = useRef(null);

  const branchId = user?.branch_id || null;
  const enabled = isAuthenticated && ALLOWED_ROLES.includes(user?.role);

  // نغمة رنين متكررة عبر Web Audio (بدون ملف صوتي)
  const startRing = useCallback(() => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const ring = () => {
        [0, 0.4].forEach((offset) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.type = 'sine';
          osc.frequency.value = 480 + offset * 200;
          gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
          gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + offset + 0.05);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.35);
          osc.start(ctx.currentTime + offset);
          osc.stop(ctx.currentTime + offset + 0.36);
        });
      };
      ring();
      const iv = setInterval(ring, 2000);
      ringRef.current = { ctx, iv };
    } catch (e) { /* noop */ }
  }, []);

  const stopRing = useCallback(() => {
    if (ringRef.current) {
      clearInterval(ringRef.current.iv);
      try { ringRef.current.ctx.close(); } catch (e) { /* noop */ }
      ringRef.current = null;
    }
  }, []);

  // Polling لإشعارات الكاشير الجديدة
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const poll = async () => {
      try {
        const params = new URLSearchParams({ notification_type: 'new_order_cashier', unread_only: 'true' });
        if (branchId) params.append('branch_id', branchId);
        const res = await axios.get(`${API}/order-notifications?${params.toString()}`);
        const list = res.data?.notifications || [];
        if (!active) return;
        // أول إشعار غير معالَج
        const next = list.find((n) => !handledRef.current.has(n.id));
        if (next && !call) {
          setCall(next);
          setAccepted(false);
          startRing();
        }
      } catch (e) { /* noop */ }
    };
    poll();
    const iv = setInterval(poll, 4000);
    return () => { active = false; clearInterval(iv); };
  }, [enabled, branchId, call, startRing]);

  useEffect(() => () => stopRing(), [stopRing]);

  const dismiss = async (markRead = true) => {
    stopRing();
    if (call) {
      handledRef.current.add(call.id);
      if (markRead) {
        try { await axios.put(`${API}/order-notifications/${call.id}/read`); } catch (e) { /* noop */ }
      }
    }
    setCall(null); setAccepted(false); setOrder(null); setDrivers([]); setDeliveryFee(''); setFeeHint(null);
  };

  const reject = () => dismiss(true);

  const accept = async () => {
    stopRing();
    setAccepted(true);
    try { await axios.put(`${API}/order-notifications/${call.id}/read`); } catch (e) { /* noop */ }
    try {
      const res = await axios.get(`${API}/orders/${call.order_id}`);
      setOrder(res.data);
    } catch (e) { setOrder(null); }
    if (call.order_type === 'delivery') {
      try {
        const dparams = branchId ? `?branch_id=${branchId}` : '';
        const dres = await axios.get(`${API}/drivers${dparams}`);
        setDrivers((dres.data || []).filter((d) => d.is_active !== false));
      } catch (e) { /* noop */ }
      // اقتراح أجور التوصيل تلقائياً حسب المسافة
      try {
        const sres = await axios.get(`${API}/delivery-fee/suggest`, { params: { order_id: call.order_id } });
        if (sres.data?.suggested_fee != null) {
          setDeliveryFee(String(sres.data.suggested_fee));
          setFeeHint(sres.data.out_of_range
            ? `⚠️ ${sres.data.reason || 'الزبون خارج نطاق التوصيل'}`
            : `🗺️ محسوبة تلقائياً حسب المسافة (${sres.data.distance_km} كم)`);
        } else if (sres.data?.enabled && sres.data?.reason) {
          setFeeHint(`ℹ️ ${sres.data.reason}`);
        }
      } catch (e) { /* noop */ }
    }
  };

  const assignDriver = async (driverId, force = false) => {
    setAssigning(true);
    try {
      const feeVal = Number(deliveryFee) || 0;
      await axios.put(`${API}/drivers/${driverId}/assign?order_id=${call.order_id}${force ? '&force=true' : ''}${feeVal > 0 ? `&delivery_fee=${feeVal}` : ''}`);
      toast.success(feeVal > 0 ? `تم إسناد السائق + أجور توصيل ${feeVal.toLocaleString()} IQD` : 'تم إسناد السائق للطلب');
      dismiss(false);
    } catch (e) {
      const status = e?.response?.status;
      const detail = e?.response?.data?.detail || 'تعذّر إسناد السائق';
      if (status === 409) {
        // السائق غادر والطلب بعيد — اعرض خيار الإضافة الإجبارية
        if (window.confirm(`${detail}\n\nهل تريد إضافته إجبارياً على هذا السائق؟`)) {
          await assignDriver(driverId, true);
          return;
        }
      } else {
        toast.error(detail);
      }
    } finally { setAssigning(false); }
  };

  if (!call) return null;

  const typeLabel = { delivery: '🚗 توصيل', takeaway: '🛍️ سفري', dine_in: '🍽️ داخلي' }[call.order_type] || call.order_type;

  return createPortal((
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm" style={{ pointerEvents: 'auto' }} data-testid="incoming-order-call">
      <div className="w-full max-w-md mx-4 rounded-3xl bg-gradient-to-b from-slate-900 to-slate-800 text-white shadow-2xl overflow-hidden border border-white/10">
        {!accepted ? (
          <div className="p-8 text-center">
            <p className="text-sm text-slate-300 mb-1">طلب جديد وارد</p>
            <div className="mx-auto my-5 w-24 h-24 rounded-full bg-green-500/20 flex items-center justify-center animate-pulse">
              <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center">
                <Phone className="h-8 w-8" />
              </div>
            </div>
            <h2 className="text-2xl font-extrabold mb-1" data-testid="incoming-order-number">#{call.order_number}</h2>
            <p className="text-lg text-slate-200">{call.customer_name || 'زبون'}</p>
            <p className="text-sm text-slate-400 mt-1">{typeLabel} • {call.items_count} أصناف • {Number(call.total_amount || 0).toLocaleString()} IQD</p>
            {call.delivery_address && (
              <p className="text-sm text-slate-400 mt-1 flex items-center justify-center gap-1"><MapPin className="h-4 w-4" /> {call.delivery_address}</p>
            )}
            <div className="flex items-center justify-center gap-10 mt-8">
              <button onClick={reject} data-testid="reject-order-call" className="flex flex-col items-center gap-2">
                <span className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg transition-transform hover:scale-110"><PhoneOff className="h-7 w-7" /></span>
                <span className="text-sm text-slate-300">رفض</span>
              </button>
              <button onClick={accept} data-testid="accept-order-call" className="flex flex-col items-center gap-2">
                <span className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center shadow-lg transition-transform hover:scale-110"><Phone className="h-7 w-7" /></span>
                <span className="text-sm text-slate-300">قبول</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold flex items-center gap-2"><CheckCircle className="h-5 w-5 text-green-400" /> طلب #{call.order_number}</h2>
              <button onClick={() => dismiss(false)} data-testid="close-order-call" className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-2 bg-white/5 rounded-xl p-4 mb-4">
              <p className="flex items-center gap-2"><User className="h-4 w-4 text-blue-400" /> <span className="text-slate-300">الزبون:</span> <span className="font-semibold">{order?.customer_name || call.customer_name || '—'}</span></p>
              <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-green-400" /> <span className="text-slate-300">الهاتف:</span> <a href={`tel:${order?.customer_phone || call.customer_phone}`} className="font-semibold underline">{order?.customer_phone || call.customer_phone || '—'}</a></p>
              <p className="flex items-start gap-2"><MapPin className="h-4 w-4 text-red-400 mt-1" /> <span className="text-slate-300">العنوان:</span> <span className="font-semibold">{order?.delivery_address || call.delivery_address || '—'}</span></p>
              <p className="flex items-center gap-2"><Banknote className="h-4 w-4 text-amber-400" /> <span className="text-slate-300">المبلغ:</span> <span className="font-semibold">{Number(order?.total_amount || order?.total || call.total_amount || 0).toLocaleString()} IQD</span></p>
              <p className="flex items-center gap-2"><Package className="h-4 w-4 text-purple-400" /> <span className="text-slate-300">الأصناف:</span> <span className="font-semibold">{order?.items?.length || call.items_count || 0}</span></p>
            </div>

            {call.order_type === 'delivery' ? (
              <div>
                {/* أجور التوصيل — تُضاف للفاتورة وتظهر للزبون */}
                <div className="mb-3">
                  <p className="text-sm text-slate-300 mb-1 flex items-center gap-2"><Banknote className="h-4 w-4 text-amber-400" /> أجور التوصيل (تُضاف للفاتورة):</p>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={deliveryFee}
                    onChange={(e) => setDeliveryFee(e.target.value)}
                    placeholder="0"
                    data-testid="call-delivery-fee-input"
                    className="w-full rounded-xl bg-white/10 border border-white/15 px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                  />
                  {feeHint && (
                    <p className="text-xs text-amber-300 mt-1" data-testid="call-fee-hint">{feeHint}</p>
                  )}
                  <div className="flex flex-wrap gap-2 mt-2">
                    {[1000, 2000, 3000, 5000].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setDeliveryFee(String(v))}
                        data-testid={`call-fee-quick-${v}`}
                        className={`px-3 py-1 rounded-full text-xs border transition-colors ${Number(deliveryFee) === v ? 'bg-amber-500 text-black border-amber-500' : 'bg-white/5 border-white/15 text-slate-300 hover:bg-white/10'}`}
                      >
                        {v.toLocaleString()}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-sm text-slate-300 mb-2 flex items-center gap-2"><Bike className="h-4 w-4" /> إسناد سائق:</p>
                {drivers.length === 0 ? (
                  <p className="text-sm text-slate-400">لا يوجد سائقون متاحون لهذا الفرع</p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 max-h-52 overflow-y-auto">
                    {drivers.map((d) => (
                      <button
                        key={d.id}
                        disabled={assigning}
                        onClick={() => assignDriver(d.id)}
                        data-testid={`assign-driver-${d.id}`}
                        className="flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors text-right disabled:opacity-50"
                      >
                        <span className="flex items-center gap-2">
                          <span className="w-9 h-9 rounded-full bg-blue-500/30 flex items-center justify-center font-bold">{d.name?.[0] || '🛵'}</span>
                          <span>
                            <span className="block font-semibold">{d.name}</span>
                            <span className="block text-xs text-slate-400">{d.phone}</span>
                          </span>
                        </span>
                        <span className={`text-xs px-2 py-1 rounded-full ${d.is_available ? 'bg-green-500/20 text-green-300' : 'bg-amber-500/20 text-amber-300'}`}>
                          {d.is_available ? 'متاح' : 'مشغول'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <Button variant="outline" className="w-full mt-3 bg-transparent text-white border-white/20 hover:bg-white/10" onClick={() => dismiss(false)} data-testid="finish-without-driver">
                  لاحقاً
                </Button>
              </div>
            ) : (
              <Button className="w-full bg-green-600 hover:bg-green-700" onClick={() => dismiss(false)} data-testid="confirm-order-accept">
                تم استلام الطلب
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  ), document.body);
};

export default IncomingOrderCall;
