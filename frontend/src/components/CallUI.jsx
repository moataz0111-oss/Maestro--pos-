import React, { useEffect, useState, useRef } from 'react';
import { Phone, PhoneOff, Mic, MicOff } from 'lucide-react';

// نغمة رنين بسيطة عبر Web Audio (للمكالمة الواردة)
function useRingtone(active) {
  const ctxRef = useRef(null);
  const intervalRef = useRef(null);
  useEffect(() => {
    if (!active) return undefined;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      ctxRef.current = ctx;
      const beep = () => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 480;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
        osc.start();
        osc.stop(ctx.currentTime + 1);
      };
      beep();
      intervalRef.current = setInterval(beep, 2000);
    } catch (e) { /* noop */ }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (ctxRef.current) { try { ctxRef.current.close(); } catch (e) { /* noop */ } }
    };
  }, [active]);
}

function CallTimer() {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(iv);
  }, []);
  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  return <span data-testid="call-timer">{mm}:{ss}</span>;
}

/**
 * واجهة المكالمة الصوتية (تُعرض فوق كل شيء حسب الحالة).
 */
export default function CallUI({
  callState,
  peerName,
  muted,
  errorMsg,
  remoteAudioRef,
  acceptCall,
  rejectCall,
  hangup,
  toggleMute,
}) {
  useRingtone(callState === 'ringing');

  // عرض رسالة الخطأ كـ toast بسيط
  useEffect(() => {
    if (errorMsg) {
      // eslint-disable-next-line no-alert
      try { window?.console?.warn(errorMsg); } catch (e) { /* noop */ }
    }
  }, [errorMsg]);

  if (callState === 'idle') {
    return <audio ref={remoteAudioRef} autoPlay playsInline />;
  }

  const avatar = (peerName || '؟').trim()[0] || '؟';

  const stateLabel = {
    calling: 'جارٍ الاتصال…',
    ringing: 'مكالمة واردة',
    connecting: 'جارٍ الاتصال…',
    connected: 'متصل',
    ended: 'انتهت المكالمة',
  }[callState] || '';

  return (
    <div className="fixed inset-0 z-[3000] flex flex-col items-center justify-between bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-white py-16 px-6" data-testid="call-ui-overlay">
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {/* أعلى: اسم الطرف الآخر والحالة */}
      <div className="flex flex-col items-center mt-8">
        <div className={`w-28 h-28 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-5xl font-bold shadow-2xl mb-6 ${callState === 'ringing' || callState === 'calling' ? 'animate-pulse' : ''}`}>
          {avatar}
        </div>
        <h2 className="text-2xl font-bold mb-2" data-testid="call-peer-name">{peerName || 'مكالمة'}</h2>
        <p className="text-slate-300 text-base" data-testid="call-state-label">
          {callState === 'connected' ? <CallTimer /> : stateLabel}
        </p>
        {errorMsg ? <p className="text-red-400 text-sm mt-3 text-center max-w-xs">{errorMsg}</p> : null}
      </div>

      {/* أسفل: الأزرار */}
      <div className="w-full flex flex-col items-center gap-8 mb-6">
        {callState === 'connected' && (
          <button
            type="button"
            onClick={toggleMute}
            data-testid="call-mute-btn"
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${muted ? 'bg-white text-slate-900' : 'bg-white/15 hover:bg-white/25 text-white'}`}
          >
            {muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
          </button>
        )}

        {callState === 'ringing' ? (
          <div className="flex items-center justify-center gap-16">
            <button
              type="button"
              onClick={rejectCall}
              data-testid="call-reject-btn"
              className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-xl transition-transform hover:scale-110"
            >
              <PhoneOff className="h-7 w-7" />
            </button>
            <button
              type="button"
              onClick={acceptCall}
              data-testid="call-accept-btn"
              className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center shadow-xl transition-transform hover:scale-110 animate-bounce"
            >
              <Phone className="h-7 w-7" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => hangup(true)}
            data-testid="call-hangup-btn"
            className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-xl transition-transform hover:scale-110"
          >
            <PhoneOff className="h-7 w-7" />
          </button>
        )}
      </div>
    </div>
  );
}
