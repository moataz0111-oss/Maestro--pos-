import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Phone, PhoneOff, User, MapPin, ShoppingCart, X, Clock, PhoneIncoming } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { formatPrice } from '../utils/currency';
import { getSoundSettings } from '../utils/sound';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function IncomingCallPopup({ onClose, onAnswer, onCreateOrder }) {
  const [activeCalls, setActiveCalls] = useState([]);
  const [isRinging, setIsRinging] = useState(false);
  const [dismissed, setDismissed] = useState({});
  const audioContextRef = useRef(null);
  const ringIntervalRef = useRef(null);
  const pollIntervalRef = useRef(null);

  // تشغيل صوت الرنين باستخدام Web Audio API
  const playRingSound = useCallback(() => {
    const settings = getSoundSettings();
    if (!settings.enabled || !settings.callRingtone) return;
    
    // إيقاف أي رنين سابق
    stopRingSound();
    
    const volume = settings.volume || 0.7;
    
    // تشغيل الرنين كل ثانية
    const playRingTone = () => {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        
        // نغمة رنين هاتف (تردد مزدوج)
        const playTone = (freq, startTime, duration) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = freq;
          osc.type = 'sine';
          gain.gain.setValueAtTime(volume * 0.3, startTime);
          gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
          osc.start(startTime);
          osc.stop(startTime + duration);
        };
        
        // رنين هاتف كلاسيكي (440Hz و 480Hz متناوب)
        playTone(440, ctx.currentTime, 0.1);
        playTone(480, ctx.currentTime + 0.1, 0.1);
        playTone(440, ctx.currentTime + 0.2, 0.1);
        playTone(480, ctx.currentTime + 0.3, 0.1);
        playTone(440, ctx.currentTime + 0.4, 0.1);
        playTone(480, ctx.currentTime + 0.5, 0.1);
        
      } catch (e) {
        console.log('Ring sound error:', e);
      }
    };
    
    // تشغيل فوري
    playRingTone();
    
    // تكرار كل 1.5 ثانية
    ringIntervalRef.current = setInterval(playRingTone, 1500);
  }, []);

  // إيقاف صوت الرنين
  const stopRingSound = useCallback(() => {
    if (ringIntervalRef.current) {
      clearInterval(ringIntervalRef.current);
      ringIntervalRef.current = null;
    }
  }, []);

  // جلب المكالمات النشطة
  const fetchActiveCalls = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      
      const res = await fetch(`${API}/callcenter/active-calls`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        const calls = await res.json();
        
        // فلترة المكالمات التي تم رفضها محلياً
        const filteredCalls = calls.filter(c => !dismissed[c.call_id]);
        
        const ringingCalls = filteredCalls.filter(c => c.status === 'ringing');
        
        if (ringingCalls.length > 0 && !isRinging) {
          setIsRinging(true);
          playRingSound();
        } else if (ringingCalls.length === 0 && isRinging) {
          setIsRinging(false);
          stopRingSound();
        }
        
        setActiveCalls(filteredCalls);
      }
    } catch (error) {
      console.error('Error fetching calls:', error);
    }
  }, [isRinging, dismissed, playRingSound, stopRingSound]);

  // الرد على المكالمة
  const handleAnswer = async (callId) => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API}/callcenter/calls/${callId}/answer`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      stopRingSound();
      setIsRinging(false);
      
      // تحديث حالة المكالمة محلياً
      setActiveCalls(prev => prev.map(c => 
        c.call_id === callId ? {...c, status: 'answered'} : c
      ));
      
      if (onAnswer) onAnswer(callId);
    } catch (error) {
      console.error('Error answering call:', error);
    }
  };

  // إنهاء/رفض المكالمة
  const handleEndCall = async (callId) => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API}/callcenter/calls/${callId}/end`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      stopRingSound();
      setIsRinging(false);
      
      // إضافة للمكالمات المرفوضة لعدم إظهارها مرة أخرى
      setDismissed(prev => ({...prev, [callId]: true}));
      
      // إزالة من القائمة محلياً
      setActiveCalls(prev => prev.filter(c => c.call_id !== callId));
      
      if (onClose) onClose();
    } catch (error) {
      console.error('Error ending call:', error);
    }
  };

  // إغلاق النافذة فقط (بدون إنهاء المكالمة)
  const handleDismiss = (callId) => {
    setDismissed(prev => ({...prev, [callId]: true}));
    setActiveCalls(prev => prev.filter(c => c.call_id !== callId));
    stopRingSound();
    setIsRinging(false);
  };

  // إنشاء طلب للمتصل
  const handleCreateOrder = (call) => {
    // إيقاف الرنين
    stopRingSound();
    setIsRinging(false);
    
    // إضافة للمكالمات المنتهية
    setDismissed(prev => ({...prev, [call.call_id]: true}));
    setActiveCalls(prev => prev.filter(c => c.call_id !== call.call_id));
    
    // إنهاء المكالمة في الخلفية
    const token = localStorage.getItem('token');
    fetch(`${API}/callcenter/calls/${call.call_id}/end`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    }).catch(() => {});
    
    // التنقل لصفحة POS مع بيانات العميل ونوع التوصيل
    const params = new URLSearchParams({
      phone: call.phone || '',
      name: call.caller_name || '',
      from_call: 'true'
    });
    
    window.location.href = `/pos?${params.toString()}`;
  };

  useEffect(() => {
    // جلب المكالمات فوراً
    const initialFetch = async () => {
      await fetchActiveCalls();
    };
    initialFetch();
    
    // جلب كل 3 ثواني (بدلاً من ثانيتين)
    pollIntervalRef.current = setInterval(fetchActiveCalls, 3000);
    
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      stopRingSound();
    };
  }, [fetchActiveCalls]);

  // تنظيف المكالمات المرفوضة بعد دقيقة
  useEffect(() => {
    const cleanup = setInterval(() => {
      setDismissed({});
    }, 60000);
    
    return () => clearInterval(cleanup);
  }, []);

  if (activeCalls.length === 0) return null;

  return (
    <>
      {activeCalls.map((call) => (
        <div
          key={call.call_id}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999]"
          style={{ animation: 'slideInFromTop 0.3s ease-out' }}
        >
          <Card className={`w-[420px] overflow-hidden shadow-2xl border-2 ${
            call.status === 'ringing' 
              ? 'border-green-500 bg-gradient-to-b from-green-900/95 to-gray-900/98' 
              : 'border-blue-500 bg-gradient-to-b from-blue-900/95 to-gray-900/98'
          } backdrop-blur-xl`}>
            {/* Header */}
            <div className={`p-4 ${
              call.status === 'ringing' ? 'bg-green-500/30' : 'bg-blue-500/30'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-full ${
                    call.status === 'ringing' 
                      ? 'bg-green-500 animate-pulse' 
                      : 'bg-blue-500'
                  }`}>
                    <PhoneIncoming className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      {call.status === 'ringing' ? '📞 مكالمة واردة...' : '🔊 مكالمة نشطة'}
                    </h3>
                    <p className="text-sm text-gray-200 font-mono" dir="ltr">
                      {call.phone}
                    </p>
                  </div>
                </div>
                
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDismiss(call.call_id)}
                  className="text-gray-300 hover:text-white hover:bg-white/10"
                  title="إخفاء"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>
            
            {/* Customer Info */}
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-3 text-white">
                <User className="h-5 w-5 text-gray-400" />
                <span className="font-medium text-lg">
                  {call.caller_name || (call.is_new_customer ? 'عميل جديد' : 'غير معروف')}
                </span>
                {call.is_new_customer && (
                  <span className="px-2 py-0.5 text-xs bg-yellow-500/30 text-yellow-300 rounded-full border border-yellow-500/50">
                    ✨ جديد
                  </span>
                )}
              </div>
              
              {call.customer && (
                <>
                  {call.customer.address && (
                    <div className="flex items-center gap-3 text-gray-300">
                      <MapPin className="h-5 w-5 text-gray-400" />
                      <span className="text-sm">{call.customer.address}</span>
                    </div>
                  )}
                  
                  {call.customer.total_orders > 0 && (
                    <div className="flex items-center gap-3 text-gray-300">
                      <ShoppingCart className="h-5 w-5 text-gray-400" />
                      <span className="text-sm">
                        {call.customer.total_orders} طلب سابق • 
                        إجمالي: {formatPrice(call.customer.total_spent || 0)}
                      </span>
                    </div>
                  )}
                </>
              )}
              
              {/* آخر طلب */}
              {call.last_order && (
                <div className="mt-3 p-3 bg-gray-800/70 rounded-lg border border-gray-700">
                  <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
                    <Clock className="h-4 w-4" />
                    آخر طلب
                  </div>
                  <div className="text-white text-sm font-medium">
                    طلب #{call.last_order.order_number} • {formatPrice(call.last_order.total)}
                  </div>
                  <div className="text-gray-400 text-xs mt-1">
                    {call.last_order.items?.slice(0, 2).map(i => i.name).join(', ')}
                    {call.last_order.items?.length > 2 && '...'}
                  </div>
                </div>
              )}
            </div>
            
            {/* Actions */}
            <div className="p-4 pt-0 flex gap-3">
              {call.status === 'ringing' ? (
                <>
                  <Button
                    onClick={() => handleEndCall(call.call_id)}
                    className="flex-1 h-12 bg-red-600 hover:bg-red-700 text-white gap-2 text-base font-medium"
                  >
                    <PhoneOff className="h-5 w-5" />
                    رفض
                  </Button>
                  <Button
                    onClick={() => handleAnswer(call.call_id)}
                    className="flex-1 h-12 bg-green-600 hover:bg-green-700 text-white gap-2 text-base font-medium"
                  >
                    <Phone className="h-5 w-5" />
                    رد
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    onClick={() => handleEndCall(call.call_id)}
                    variant="outline"
                    className="flex-1 h-12 border-red-500 text-red-400 hover:bg-red-500/20 gap-2 text-base font-medium"
                  >
                    <PhoneOff className="h-5 w-5" />
                    إنهاء
                  </Button>
                  <Button
                    onClick={() => handleCreateOrder(call)}
                    className="flex-1 h-12 bg-primary hover:bg-primary/90 text-white gap-2 text-base font-medium"
                  >
                    <ShoppingCart className="h-5 w-5" />
                    إنشاء طلب
                  </Button>
                </>
              )}
            </div>
          </Card>
        </div>
      ))}
      
      <style>{`
        @keyframes slideInFromTop {
          from {
            opacity: 0;
            transform: translate(-50%, -100%);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }
      `}</style>
    </>
  );
}
