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
import { Phone, MapPin, User, Banknote, Package, Bike, X, CheckCircle, Clock } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { printSavedOrder } from '../utils/printService';

const API = API_URL;
// المكالمة تظهر للكاشير فقط (طلب المستخدم). الإدارة تتلقى تنبيهات التأخير/الرفض بدلاً منها.
const ALLOWED_ROLES = ['cashier'];

export const IncomingOrderCall = () => {
  const { user, isAuthenticated } = useAuth();
  const [call, setCall] = useState(null);          // الإشعار الوارد المعروض الآن
  const [queueCount, setQueueCount] = useState(0); // عدد الطلبات الإضافية المنتظرة في الطابور
  const [accepted, setAccepted] = useState(false); // بعد القبول نعرض التفاصيل
  const [order, setOrder] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [assigning, setAssigning] = useState(false);
  const [deliveryFee, setDeliveryFee] = useState('');
  const [feeHint, setFeeHint] = useState(null);
  const [selectedDriverId, setSelectedDriverId] = useState(null);
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
        const list = (res.data?.notifications || []).slice()
          .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)); // FIFO: الأقدم أولاً (الطلبات المسبقة بالترتيب)
        if (!active) return;
        // عدد الطلبات غير المعالَجة المنتظرة في الطابور
        const unhandled = list.filter((n) => !handledRef.current.has(n.id));
        // أول إشعار غير معالَج (الأقدم) — يظهر التالي تلقائياً بعد قبول/رفض الحالي
        const next = unhandled[0];
        // العدد الإضافي بانتظار الكاشير (باستثناء المعروض حالياً)
        setQueueCount(Math.max(0, unhandled.length - 1));
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
    setCall(null); setAccepted(false); setOrder(null); setDrivers([]); setDeliveryFee(''); setFeeHint(null); setSelectedDriverId(null);
  };

  const reject = async () => {
    if (!window.confirm('هل تريد رفض هذا الطلب؟ سيُسجَّل كطلب مرفوض ويُبلَّغ الزبون.')) return;
    stopRing();
    try {
      await axios.put(`${API}/orders/${call.order_id}/reject`);
      toast.success('تم رفض الطلب وتسجيله كطلب مرفوض');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'تعذّر رفض الطلب');
    }
    dismiss(true);
  };

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
      let feeSet = false;
      try {
        const sres = await axios.get(`${API}/delivery-fee/suggest`, { params: { order_id: call.order_id } });
        if (sres.data?.suggested_fee != null) {
          setDeliveryFee(String(sres.data.suggested_fee));
          feeSet = true;
          setFeeHint(sres.data.out_of_range
            ? `⚠️ ${sres.data.reason || 'الزبون خارج نطاق التوصيل'}`
            : `🗺️ محسوبة تلقائياً حسب المسافة (${sres.data.distance_km} كم)`);
        } else if (sres.data?.enabled && sres.data?.reason) {
          setFeeHint(`ℹ️ ${sres.data.reason}`);
        }
      } catch (e) { /* noop */ }
      // احتياطي: مبلغ التوصيل الافتراضي من إعدادات الفاتورة عند غياب التسعير بالمسافة
      if (!feeSet) {
        try {
          const inv = await axios.get(`${API}/tenant/invoice-settings`);
          const def = Number(inv.data?.default_delivery_fee || 0);
          if (def > 0) {
            setDeliveryFee(String(def));
            setFeeHint('🧾 مبلغ التوصيل الافتراضي من الإعدادات');
          }
        } catch (e) { /* noop */ }
      }
    }
  };

  // طباعة الفاتورة على طابعة الكاشير USB + إرسال تذاكر المطبخ (إعادة استخدام آلية الـPOS)
  const printOrderTickets = async (ord) => {
    try {
      const bparam = branchId ? { params: { branch_id: branchId } } : {};
      const [printersRes, productsRes, restRes, invRes] = await Promise.all([
        axios.get(`${API}/printers`, bparam).catch(() => ({ data: [] })),
        axios.get(`${API}/products`).catch(() => ({ data: [] })),
        axios.get(`${API}/settings/restaurant`).catch(() => ({ data: {} })),
        axios.get(`${API}/tenant/invoice-settings`).catch(() => ({ data: {} })),
      ]);
      const printers = printersRes.data || [];
      const restaurantName = restRes.data?.name_ar || restRes.data?.name || '';
      const res = await printSavedOrder(ord, {
        printers,
        products: productsRes.data || [],
        restaurantName,
        invoiceSettings: invRes.data || {},
        branchName: user?.branch_name || '',
      });
      const hasPrinter = !!(res.cashier || res.kitchen);
      if (!hasPrinter) {
        // لا توجد طابعات مهيأة — طباعة احتياطية عبر المتصفح
        printInvoiceBrowser(ord);
      }
    } catch (e) {
      printInvoiceBrowser(ord);
    }
  };

  // طباعة احتياطية عبر المتصفح عند عدم وجود طابعة USB مهيأة
  const printInvoiceBrowser = (ord) => {
    try {
      const o = ord || order || {};
      const items = o.items || [];
      const itemsRows = items.map((it) => `
        <tr>
          <td style="text-align:right;padding:4px 0">${it.product_name || it.name || '—'} ×${it.quantity || 1}</td>
          <td style="text-align:left;padding:4px 0">${Number((it.price || it.unit_price || 0) * (it.quantity || 1)).toLocaleString()}</td>
        </tr>`).join('');
      const win = window.open('', '_blank', 'width=380,height=600');
      if (!win) return;
      win.document.write(`
        <html dir="rtl"><head><meta charset="utf-8"><title>فاتورة #${o.order_number || call.order_number}</title>
        <style>body{font-family:Arial,sans-serif;padding:12px;color:#000} h2{text-align:center;margin:4px 0} .muted{color:#555;font-size:12px} table{width:100%;border-collapse:collapse;font-size:13px} hr{border:none;border-top:1px dashed #999;margin:8px 0} .tot{font-weight:bold;font-size:15px}</style>
        </head><body>
        <h2>فاتورة غير مدفوعة</h2>
        <p class="muted" style="text-align:center">طلب رقم #${o.order_number || call.order_number}</p>
        <hr/>
        <p>الزبون: <b>${o.customer_name || call.customer_name || '—'}</b></p>
        <p>الهاتف: ${o.customer_phone || call.customer_phone || '—'}</p>
        <p>العنوان: ${o.delivery_address || call.delivery_address || '—'}</p>
        ${o.driver_name ? `<p>السائق: <b>${o.driver_name}</b></p>` : ''}
        <hr/>
        <table>${itemsRows}</table>
        <hr/>
        <table>
          <tr><td>أجور التوصيل</td><td style="text-align:left">${Number(o.delivery_fee || 0).toLocaleString()}</td></tr>
          <tr class="tot"><td>الإجمالي</td><td style="text-align:left">${Number(o.total || 0).toLocaleString()} IQD</td></tr>
        </table>
        <hr/>
        <p class="muted" style="text-align:center">سيتم التحصيل من الزبون عند الاستلام</p>
        <script>window.onload=function(){window.print();}</script>
        </body></html>`);
      win.document.close();
    } catch (e) { /* noop */ }
  };

  // إرسال للتحضير: إسناد سائق (إجباري للتوصيل) + أجور + طباعة فاتورة USB + تذاكر المطبخ + ظهور بالمطبخ والمعلّق + إشعار السائق
  const sendToPreparation = async (force = false) => {
    if (call.order_type === 'delivery' && !selectedDriverId) {
      toast.error('اختيار السائق إجباري قبل الإرسال للتحضير');
      return;
    }
    setAssigning(true);
    try {
      const feeVal = Number(deliveryFee) || 0;
      let finalOrder = order;
      if (selectedDriverId) {
        await axios.put(`${API}/drivers/${selectedDriverId}/assign?order_id=${call.order_id}${force ? '&force=true' : ''}${feeVal > 0 ? `&delivery_fee=${feeVal}` : ''}`);
      }
      // أظهر الطلب في شاشة المطبخ فوراً
      try { await axios.put(`${API}/orders/${call.order_id}/kitchen-status?kitchen_status=pending_kitchen`); } catch (e) { /* noop */ }
      // أعد جلب الطلب بعد التحديثات (يشمل الأجور والسائق والإجمالي)
      try {
        const ores = await axios.get(`${API}/orders/${call.order_id}`);
        finalOrder = ores.data;
      } catch (e) { /* noop */ }
      // طباعة الفاتورة على طابعة الكاشير + تذاكر المطبخ
      await printOrderTickets(finalOrder);
      const driverName = drivers.find((d) => d.id === selectedDriverId)?.name;
      toast.success(driverName
        ? `تم الإرسال للتحضير وطباعة الفاتورة وإشعار السائق ${driverName}`
        : 'تم الإرسال للتحضير وطباعة الفاتورة');
      dismiss(false);
    } catch (e) {
      const status = e?.response?.status;
      const detail = e?.response?.data?.detail || 'تعذّر إرسال الطلب للتحضير';
      if (status === 409) {
        if (window.confirm(`${detail}\n\nهل تريد إضافته إجبارياً على هذا السائق؟`)) {
          await sendToPreparation(true);
          return;
        }
      } else {
        toast.error(detail);
      }
    } finally { setAssigning(false); }
  };

  const adjustFee = (delta) => {
    setDeliveryFee((prev) => {
      const next = Math.max(0, (Number(prev) || 0) + delta);
      return String(next);
    });
  };

  if (!call) return null;

  const typeLabel = { delivery: '🚗 توصيل', takeaway: '🛍️ سفري', dine_in: '🍽️ داخلي' }[call.order_type] || call.order_type;

  return createPortal((
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm" style={{ pointerEvents: 'auto' }} data-testid="incoming-order-call">
      <div className="w-full max-w-md mx-4 rounded-3xl bg-gradient-to-b from-slate-900 to-slate-800 text-white shadow-2xl overflow-hidden border border-white/10">
        {!accepted ? (
          <div className="p-8 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/15 border border-amber-400/30 mb-4">
              <Package className="h-4 w-4 text-amber-300" />
              <p className="text-sm font-semibold text-amber-200">طلب جديد وارد</p>
            </div>
            {queueCount > 0 && (
              <div className="flex items-center justify-center mb-3" data-testid="incoming-queue-counter">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/15 border border-blue-400/30 text-blue-200 text-xs font-semibold animate-pulse">
                  <Clock className="h-3.5 w-3.5" />
                  {queueCount === 1 ? 'طلب إضافي بانتظارك' : `${queueCount.toLocaleString('ar-EG')} طلبات إضافية بانتظارك`}
                </span>
              </div>
            )}
            <div className="mx-auto my-2 flex items-center justify-center">
              <BrandLogo size={96} showName={false} dark={true} />
            </div>
            <h2 className="text-3xl font-extrabold mb-1 mt-2" data-testid="incoming-order-number">#{call.order_number}</h2>
            <p className="text-lg text-slate-200">{call.customer_name || 'زبون'}</p>
            <p className="text-sm text-slate-400 mt-1">{typeLabel} • {call.items_count} أصناف • {Number(call.total_amount || 0).toLocaleString()} IQD</p>
            {call.customer_phone && (
              <p className="text-sm text-slate-400 mt-1 flex items-center justify-center gap-1" dir="ltr"><Phone className="h-4 w-4" /> {call.customer_phone}</p>
            )}
            {call.delivery_address && (
              <p className="text-sm text-slate-400 mt-1 flex items-center justify-center gap-1"><MapPin className="h-4 w-4" /> {call.delivery_address}</p>
            )}
            <div className="grid grid-cols-2 gap-3 mt-8">
              <button onClick={reject} data-testid="reject-order-call" className="py-4 rounded-2xl bg-red-600 hover:bg-red-700 text-white text-lg font-bold shadow-lg transition-colors">
                رفض الطلب
              </button>
              <button onClick={accept} data-testid="accept-order-call" className="py-4 rounded-2xl bg-green-600 hover:bg-green-700 text-white text-lg font-bold shadow-lg transition-colors">
                قبول الطلب
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

            {/* قائمة المنتجات: الاسم + الكمية + السعر لكل منتج */}
            {order?.items?.length > 0 && (
              <div className="bg-white/5 rounded-xl p-3 mb-4 max-h-40 overflow-y-auto" data-testid="call-items-list">
                <p className="text-sm text-slate-300 mb-2 flex items-center gap-2"><Package className="h-4 w-4 text-purple-400" /> المنتجات:</p>
                <div className="space-y-1.5">
                  {order.items.map((it, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <span className="font-semibold">{it.product_name || it.name || 'منتج'} <span className="text-amber-300">×{it.quantity || 1}</span></span>
                      <span className="text-slate-300 tabular-nums">{Number((it.price || it.unit_price || 0) * (it.quantity || 1)).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {call.order_type === 'delivery' ? (
              <div>
                {/* أجور التوصيل — تُضاف للفاتورة وتظهر للزبون */}
                <div className="mb-3">
                  <p className="text-sm text-slate-300 mb-1 flex items-center gap-2"><Banknote className="h-4 w-4 text-amber-400" /> أجور التوصيل (تُضاف للفاتورة):</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => adjustFee(-500)}
                      data-testid="call-fee-minus"
                      className="w-11 h-11 rounded-xl bg-white/10 border border-white/15 text-white text-xl font-bold hover:bg-white/20 transition-colors flex items-center justify-center"
                    >−</button>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={deliveryFee}
                      onChange={(e) => setDeliveryFee(e.target.value)}
                      placeholder="0"
                      data-testid="call-delivery-fee-input"
                      className="flex-1 text-center rounded-xl bg-white/10 border border-white/15 px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                    />
                    <button
                      type="button"
                      onClick={() => adjustFee(500)}
                      data-testid="call-fee-plus"
                      className="w-11 h-11 rounded-xl bg-white/10 border border-white/15 text-white text-xl font-bold hover:bg-white/20 transition-colors flex items-center justify-center"
                    >+</button>
                  </div>
                  {feeHint && (
                    <p className="text-xs text-amber-300 mt-1" data-testid="call-fee-hint">{feeHint}</p>
                  )}
                </div>
                <p className="text-sm text-slate-300 mb-2 flex items-center gap-2"><Bike className="h-4 w-4" /> اختر السائق <span className="text-red-400">*</span> (إجباري):</p>
                {drivers.length === 0 ? (
                  <p className="text-sm text-slate-400">لا يوجد سائقون متاحون لهذا الفرع</p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 max-h-44 overflow-y-auto">
                    {drivers.map((d) => (
                      <button
                        key={d.id}
                        disabled={assigning}
                        onClick={() => setSelectedDriverId(d.id)}
                        data-testid={`assign-driver-${d.id}`}
                        className={`flex items-center justify-between p-3 rounded-xl border transition-colors text-right disabled:opacity-50 ${selectedDriverId === d.id ? 'bg-amber-500/20 border-amber-400' : 'bg-white/5 hover:bg-white/10 border-white/10'}`}
                      >
                        <span className="flex items-center gap-2">
                          <span className="w-9 h-9 rounded-full bg-blue-500/30 flex items-center justify-center font-bold">{d.name?.[0] || '🛵'}</span>
                          <span>
                            <span className="block font-semibold">{d.name}</span>
                            <span className="block text-xs text-slate-400">{d.phone}</span>
                          </span>
                        </span>
                        {selectedDriverId === d.id ? (
                          <CheckCircle className="h-5 w-5 text-amber-400" />
                        ) : (
                          <span className={`text-xs px-2 py-1 rounded-full ${d.is_available ? 'bg-green-500/20 text-green-300' : 'bg-amber-500/20 text-amber-300'}`}>
                            {d.is_available ? 'متاح' : 'مشغول'}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                <Button
                  className="w-full mt-3 bg-amber-500 hover:bg-amber-600 text-black font-bold disabled:opacity-50"
                  disabled={assigning || !selectedDriverId}
                  onClick={() => sendToPreparation()}
                  data-testid="send-to-preparation"
                >
                  {assigning ? 'جارٍ الإرسال…' : 'إرسال للتحضير'}
                </Button>
              </div>
            ) : (
              <Button className="w-full bg-green-600 hover:bg-green-700" onClick={() => sendToPreparation()} data-testid="confirm-order-accept">
                إرسال للتحضير
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  ), document.body);
};

export default IncomingOrderCall;
