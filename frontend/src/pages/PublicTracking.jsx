/**
 * PublicTracking — صفحة تتبّع عامة (بدون تسجيل دخول / بدون تثبيت تطبيق).
 * تُفتح عبر رابط /track/:orderId يُرسَل للزبون. تعرض موقع السائق الحيّ + خط السير + التواصل.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../utils/api';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Phone, MapPin, MessageCircle, Truck, Loader2, Send, X, Star } from 'lucide-react';

const API = API_URL;

const StarRow = ({ label, value, onChange, testid }) => (
  <div className="flex items-center justify-between py-1.5" data-testid={testid}>
    <span className="text-sm text-slate-200">{label}</span>
    <div className="flex gap-1" dir="ltr">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          data-testid={`${testid}-star-${n}`}
          className="transition-transform hover:scale-110"
        >
          <Star className={`h-7 w-7 ${n <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-600'}`} />
        </button>
      ))}
    </div>
  </div>
);

const STATUS_STEPS = [
  { key: 'pending', label: 'قيد الانتظار' },
  { key: 'preparing', label: 'قيد التحضير' },
  { key: 'ready', label: 'جاهز' },
  { key: 'out_for_delivery', label: 'في الطريق' },
  { key: 'delivered', label: 'تم التسليم' },
];

export default function PublicTracking() {
  const { orderId } = useParams();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [route, setRoute] = useState([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [foodR, setFoodR] = useState(0);
  const [restR, setRestR] = useState(0);
  const [driverR, setDriverR] = useState(0);
  const [ratingNotes, setRatingNotes] = useState('');
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [submittingRating, setSubmittingRating] = useState(false);

  const submitRating = async () => {
    if (!foodR && !restR && !driverR) return;
    setSubmittingRating(true);
    try {
      await axios.post(`${API}/track/${orderId}/rating`, {
        food_rating: foodR || null,
        restaurant_rating: restR || null,
        driver_rating: driverR || null,
        notes: ratingNotes,
      });
      setRatingSubmitted(true);
    } catch (e) { /* noop */ } finally { setSubmittingRating(false); }
  };

  const fetchInfo = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/driver/order-driver-info/${orderId}`);
      setInfo(res.data);
    } catch (e) { /* noop */ } finally { setLoading(false); }
  }, [orderId]);

  useEffect(() => {
    fetchInfo();
    const iv = setInterval(fetchInfo, 10000);
    return () => clearInterval(iv);
  }, [fetchInfo]);

  const driver = info?.driver;
  const cl = driver?.current_location;
  const dl = info?.delivery_location;
  const hasLoc = cl?.latitude && cl?.longitude;

  useEffect(() => {
    if (!hasLoc || !dl?.latitude || !dl?.longitude) { setRoute([]); return; }
    let active = true;
    fetch(`https://router.project-osrm.org/route/v1/driving/${cl.longitude},${cl.latitude};${dl.longitude},${dl.latitude}?overview=full&geometries=geojson`)
      .then(r => r.json()).then(d => { if (active) { const c = d?.routes?.[0]?.geometry?.coordinates; if (c) setRoute(c.map(p => [p[1], p[0]])); } }).catch(() => {});
    return () => { active = false; };
  }, [hasLoc, cl?.latitude, cl?.longitude, dl?.latitude, dl?.longitude]);

  useEffect(() => {
    if (!chatOpen) return;
    const load = async () => { try { const r = await axios.get(`${API}/order-chat/${orderId}`); setMessages(r.data.messages || []); } catch (e) {} };
    load();
    const iv = setInterval(load, 3000);
    return () => clearInterval(iv);
  }, [chatOpen, orderId]);

  const send = async () => {
    const t = text.trim(); if (!t) return; setText('');
    try {
      await axios.post(`${API}/order-chat/${orderId}`, { sender: 'customer', sender_name: 'الزبون', text: t });
      const r = await axios.get(`${API}/order-chat/${orderId}`); setMessages(r.data.messages || []);
    } catch (e) { /* noop */ }
  };

  const digits = (driver?.phone || '').replace(/\D/g, '');
  const waPhone = digits.startsWith('964') ? digits : '964' + digits.replace(/^0/, '');
  const status = info?.order_status;
  const idx = STATUS_STEPS.findIndex(s => s.key === status);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-900"><Loader2 className="h-10 w-10 animate-spin text-green-400" /></div>;
  }

  return (
    <div dir="rtl" className="min-h-screen bg-slate-900 text-white" data-testid="public-tracking-page">
      <div className="bg-gradient-to-r from-blue-600 to-green-500 p-4 text-center">
        <h1 className="text-lg font-bold">تتبّع طلبك</h1>
        <p className="text-sm text-blue-100">#{orderId?.slice(-6)}</p>
      </div>

      {/* شريط الحالة */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800/60">
        {STATUS_STEPS.map((s, i) => (
          <div key={s.key} className="flex flex-col items-center flex-1">
            <div className={`w-3 h-3 rounded-full ${i <= idx ? 'bg-green-400' : 'bg-slate-600'}`}></div>
            <span className={`text-[10px] mt-1 ${i <= idx ? 'text-green-300' : 'text-slate-500'}`}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* تقييم الطلب بعد التسليم */}
      {status === 'delivered' && (ratingSubmitted || info?.is_rated) ? (
        <div className="mx-4 mt-3 p-4 rounded-xl bg-green-500/10 border border-green-400/30 text-center" data-testid="rating-thanks">
          <Star className="h-8 w-8 mx-auto mb-2 fill-amber-400 text-amber-400" />
          <p className="font-bold text-green-300">شكراً لتقييمك! 🌟</p>
          <p className="text-xs text-slate-400 mt-1">يساعدنا رأيك على تحسين الخدمة</p>
        </div>
      ) : status === 'delivered' ? (
        <div className="mx-4 mt-3 p-4 rounded-xl bg-slate-800/70 border border-white/10" data-testid="rating-form">
          <p className="font-bold mb-2 flex items-center gap-2"><Star className="h-5 w-5 text-amber-400" /> قيّم تجربتك</p>
          <StarRow label="🍽️ الطعام" value={foodR} onChange={setFoodR} testid="rate-food" />
          <StarRow label="🏪 المطعم" value={restR} onChange={setRestR} testid="rate-restaurant" />
          <StarRow label="🛵 السائق" value={driverR} onChange={setDriverR} testid="rate-driver" />
          <textarea
            value={ratingNotes}
            onChange={(e) => setRatingNotes(e.target.value)}
            placeholder="ملاحظات (اختياري)..."
            data-testid="rating-notes"
            className="w-full mt-2 rounded-lg bg-slate-900/60 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
            rows={2}
          />
          <button
            onClick={submitRating}
            disabled={submittingRating || (!foodR && !restR && !driverR)}
            data-testid="submit-rating"
            className="w-full mt-2 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-black font-bold disabled:opacity-50 transition-colors"
          >
            {submittingRating ? 'جارٍ الإرسال…' : 'إرسال التقييم'}
          </button>
        </div>
      ) : null}

      {/* ملخص الفاتورة */}
      {Number(info?.order_total) > 0 && (
        <div className="mx-4 mt-3 p-3 rounded-xl bg-slate-800/60 border border-white/10 text-sm space-y-1" data-testid="track-order-summary">
          {Number(info?.delivery_fee) > 0 && (
            <div className="flex justify-between text-blue-300">
              <span>🚗 رسوم خدمة التوصيل</span>
              <span className="font-bold">{Number(info.delivery_fee).toLocaleString()} IQD</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-slate-300">{Number(info?.delivery_fee) > 0 ? 'المجموع الكلي (شامل التوصيل)' : 'المجموع'}</span>
            <span className="font-bold text-green-400">{Number(info.order_total).toLocaleString()} IQD</span>
          </div>
        </div>
      )}

      {!driver ? (
        <div className="text-center py-16 text-slate-400">
          <Truck className="h-14 w-14 mx-auto mb-3 opacity-50" />
          <p>لم يتم تخصيص سائق بعد</p>
          <p className="text-sm">سيظهر السائق وموقعه هنا فور إسناده</p>
        </div>
      ) : (
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800 border border-white/10">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-green-500 flex items-center justify-center text-lg font-bold">{driver.name?.[0] || '🛵'}</div>
            <div className="flex-1">
              <p className="font-bold" data-testid="track-driver-name">{driver.name}</p>
              <p className="text-xs text-slate-400">السائق المخصص لطلبك</p>
            </div>
            <button onClick={() => setChatOpen(true)} data-testid="track-chat-btn" className="w-11 h-11 rounded-full bg-blue-500 hover:bg-blue-600 flex items-center justify-center"><MessageCircle className="h-5 w-5" /></button>
            <a href={`tel:${driver.phone}`} data-testid="track-call-btn" className="w-11 h-11 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center"><Phone className="h-5 w-5" /></a>
            <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noreferrer" className="w-11 h-11 rounded-full bg-emerald-600 hover:bg-emerald-700 flex items-center justify-center text-sm font-bold">WA</a>
          </div>

          {hasLoc ? (
            <div className="rounded-xl overflow-hidden border border-white/10 h-80">
              <MapContainer center={[cl.latitude, cl.longitude]} zoom={15} style={{ height: '100%', width: '100%' }} zoomControl={false}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
                {route.length > 0 && <Polyline positions={route} pathOptions={{ color: '#3b82f6', weight: 5, opacity: 0.85 }} />}
                <Marker position={[cl.latitude, cl.longitude]} icon={L.divIcon({ className: '', html: '<div style="font-size:30px">🛵</div>', iconSize: [30, 30], iconAnchor: [15, 15] })}>
                  <Popup>{driver.name}</Popup>
                </Marker>
                {dl?.latitude && (
                  <Marker position={[dl.latitude, dl.longitude]} icon={L.divIcon({ className: '', html: '<div style="font-size:28px">📍</div>', iconSize: [28, 28], iconAnchor: [14, 28] })}>
                    <Popup>موقع التوصيل</Popup>
                  </Marker>
                )}
              </MapContainer>
            </div>
          ) : (
            <div className="text-center py-10 bg-slate-800/60 rounded-xl text-slate-400 flex items-center gap-2 justify-center"><MapPin className="h-5 w-5" /> موقع السائق غير متاح حالياً</div>
          )}
        </div>
      )}

      {chatOpen && (
        <div className="fixed inset-0 z-[2000] flex flex-col bg-black/60" onClick={() => setChatOpen(false)} data-testid="track-chat-overlay">
          <div className="mt-auto w-full max-w-md mx-auto bg-white text-gray-800 rounded-t-2xl flex flex-col h-[80vh]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3 bg-gradient-to-r from-blue-600 to-green-500 text-white rounded-t-2xl">
              <span className="font-bold">{driver?.name || 'السائق'}</span>
              <button onClick={() => setChatOpen(false)}><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50">
              {messages.length === 0 ? <p className="text-center text-sm text-gray-400 py-8">ابدأ المحادثة</p> : messages.map(m => (
                <div key={m.id} className={`flex ${m.sender === 'customer' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${m.sender === 'customer' ? 'bg-green-500 text-white' : 'bg-white border'}`}>{m.text}</div>
                </div>
              ))}
            </div>
            <div className="p-3 border-t flex items-center gap-2 bg-white">
              <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send(); }} placeholder="اكتب رسالة..." data-testid="track-chat-input" className="flex-1 border rounded-lg px-3 py-2 text-sm" />
              <button onClick={send} data-testid="track-chat-send" className="bg-green-500 text-white rounded-lg p-2"><Send className="h-4 w-4" /></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
