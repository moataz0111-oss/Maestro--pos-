import React, { useEffect, useState } from 'react';
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

/**
 * SplashScreen — شاشة بداية فاخرة تعرض "Maestro EGP" مع خلفية مطعم.
 * - تجلب خلفية من /api/login-backgrounds (يديرها المالك من Settings).
 * - تختفي بعد `durationMs` (افتراضي 4000ms) عبر استدعاء onComplete.
 * - تُستخدم بعد تسجيل الدخول وأثناء تحميل الصفحات.
 */
export default function SplashScreen({ durationMs = 4000, onComplete }) {
  const [bgUrl, setBgUrl] = useState(null);
  const [overlayColor, setOverlayColor] = useState('rgba(0,0,0,0.55)');
  const [show, setShow] = useState(true);
  const [phase, setPhase] = useState('in'); // 'in' → 'out'

  useEffect(() => {
    let mounted = true;
    // تجربة استخدام cache أولاً
    const cached = sessionStorage.getItem('splash_bg_url');
    if (cached) setBgUrl(cached);

    axios.get(`${API}/login-backgrounds`)
      .then(res => {
        if (!mounted) return;
        const data = res.data || {};
        const active = (data.backgrounds || []).filter(b => b.is_active);
        if (active.length > 0) {
          const pick = active[Math.floor(Math.random() * active.length)];
          if (pick?.image_url) {
            setBgUrl(pick.image_url);
            sessionStorage.setItem('splash_bg_url', pick.image_url);
          }
        }
        if (data.overlay_color) setOverlayColor(data.overlay_color);
      })
      .catch(() => { /* silent — سنستخدم gradient افتراضي */ });

    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    // بدء fade-out قبل 500ms من النهاية ثم استدعاء onComplete
    const fadeOutAt = Math.max(0, durationMs - 500);
    const tFadeOut = setTimeout(() => setPhase('out'), fadeOutAt);
    const tDone = setTimeout(() => {
      setShow(false);
      if (typeof onComplete === 'function') onComplete();
    }, durationMs);
    return () => { clearTimeout(tFadeOut); clearTimeout(tDone); };
  }, [durationMs, onComplete]);

  if (!show) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center transition-opacity duration-500 ${phase === 'out' ? 'opacity-0' : 'opacity-100'}`}
      data-testid="splash-screen"
      style={{
        backgroundImage: bgUrl
          ? `url(${bgUrl})`
          : 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f1e 100%)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* طبقة تعتيم */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: overlayColor, backdropFilter: 'blur(2px)' }}
      />
      {/* بريق ناعم */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse at center, rgba(255,200,80,0.18) 0%, transparent 60%)',
      }} />

      {/* المحتوى */}
      <div className="relative z-10 flex flex-col items-center justify-center select-none">
        {/* الشعار النصي */}
        <h1
          className="splash-title font-extrabold tracking-tight text-center"
          style={{
            fontSize: 'clamp(48px, 9vw, 140px)',
            color: '#ffffff',
            letterSpacing: '0.02em',
            textShadow: '0 4px 30px rgba(0,0,0,0.6), 0 0 60px rgba(255,200,80,0.35)',
            lineHeight: 1.05,
          }}
        >
          Maestro <span style={{
            background: 'linear-gradient(180deg, #ffd166 0%, #f59e0b 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>EGP</span>
        </h1>
        {/* خط تحت العنوان */}
        <div className="splash-underline" />
        {/* شريط تحميل صغير */}
        <div className="splash-loader" aria-hidden>
          <div className="splash-loader-bar" />
        </div>
      </div>

      <style>{`
        .splash-title {
          animation: splash-fade-in 900ms cubic-bezier(0.22, 1, 0.36, 1) both;
          opacity: 0;
          transform: scale(0.88);
        }
        @keyframes splash-fade-in {
          0%   { opacity: 0; transform: scale(0.88); filter: blur(8px); }
          60%  { opacity: 1; filter: blur(0); }
          100% { opacity: 1; transform: scale(1); filter: blur(0); }
        }
        .splash-underline {
          width: 0;
          height: 3px;
          margin-top: 18px;
          border-radius: 999px;
          background: linear-gradient(90deg, transparent, #f59e0b, transparent);
          animation: splash-line 1200ms cubic-bezier(0.22, 1, 0.36, 1) 600ms forwards;
        }
        @keyframes splash-line {
          0%   { width: 0; opacity: 0; }
          100% { width: 240px; opacity: 1; }
        }
        .splash-loader {
          margin-top: 28px;
          width: 180px;
          height: 3px;
          background: rgba(255,255,255,0.15);
          border-radius: 999px;
          overflow: hidden;
          opacity: 0;
          animation: splash-loader-show 600ms ease 1200ms forwards;
        }
        @keyframes splash-loader-show {
          to { opacity: 1; }
        }
        .splash-loader-bar {
          height: 100%;
          width: 35%;
          background: linear-gradient(90deg, transparent, #ffd166, transparent);
          animation: splash-loader-move 1.2s ease-in-out infinite;
        }
        @keyframes splash-loader-move {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(420%); }
        }
      `}</style>
    </div>
  );
}
