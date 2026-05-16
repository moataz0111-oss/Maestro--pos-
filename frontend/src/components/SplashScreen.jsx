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
      className={`fixed inset-0 z-[2147483647] flex items-center justify-center transition-opacity duration-500 ${phase === 'out' ? 'opacity-0' : 'opacity-100'}`}
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
        {/* ⭐ الشعار: M هندسي ذهبي داخل سداسي يدور وينبض */}
        <div className="splash-logo-wrap" aria-hidden="true">
          <svg
            viewBox="0 0 200 200"
            width="clamp(96px, 14vw, 180px)"
            height="clamp(96px, 14vw, 180px)"
            className="splash-logo-svg"
          >
            <defs>
              <linearGradient id="splashGold" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffe7a0" />
                <stop offset="50%" stopColor="#ffd166" />
                <stop offset="100%" stopColor="#f59e0b" />
              </linearGradient>
              <filter id="splashGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {/* خاتم خارجي يدور */}
            <g className="splash-ring-spin" style={{ transformOrigin: '100px 100px' }}>
              <circle cx="100" cy="100" r="92" stroke="url(#splashGold)" strokeWidth="2" fill="none" opacity="0.55" />
              <circle cx="100" cy="100" r="92" stroke="url(#splashGold)" strokeWidth="3" fill="none"
                      strokeDasharray="40 200" strokeLinecap="round" />
            </g>
            {/* السداسي */}
            <polygon
              points="100,18 168,55 168,145 100,182 32,145 32,55"
              fill="none"
              stroke="url(#splashGold)"
              strokeWidth="3.5"
              filter="url(#splashGlow)"
              className="splash-hex"
            />
            {/* حرف M */}
            <path
              d="M55 142 V70 L100 120 L145 70 V142"
              fill="none"
              stroke="url(#splashGold)"
              strokeWidth="9"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#splashGlow)"
              className="splash-m"
            />
            {/* نقطة مركزية تنبض */}
            <circle cx="100" cy="100" r="4" fill="url(#splashGold)" className="splash-dot" />
          </svg>
        </div>

        {/* الشعار النصي */}
        <h1
          className="splash-title font-extrabold tracking-tight text-center"
          style={{
            fontSize: 'clamp(40px, 7.5vw, 116px)',
            color: '#ffffff',
            letterSpacing: '0.02em',
            textShadow: '0 4px 30px rgba(0,0,0,0.6), 0 0 60px rgba(255,200,80,0.35)',
            lineHeight: 1.05,
            marginTop: '22px',
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
        .splash-logo-wrap {
          animation: logo-enter 1100ms cubic-bezier(0.22, 1, 0.36, 1) both;
          will-change: transform, opacity;
          opacity: 0;
          filter: drop-shadow(0 8px 30px rgba(255,200,80,0.35));
        }
        @keyframes logo-enter {
          0%   { opacity: 0; transform: scale(0.4) rotate(-90deg); }
          60%  { opacity: 1; transform: scale(1.08) rotate(5deg); }
          100% { opacity: 1; transform: scale(1) rotate(0deg); }
        }
        .splash-logo-svg {
          animation: logo-float 3.6s ease-in-out 1.1s infinite;
        }
        @keyframes logo-float {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-6px); }
        }
        .splash-ring-spin {
          animation: ring-spin 6s linear 1.1s infinite;
          transform-box: fill-box;
        }
        @keyframes ring-spin {
          to { transform: rotate(360deg); }
        }
        .splash-hex {
          stroke-dasharray: 720;
          stroke-dashoffset: 720;
          animation: hex-draw 1400ms cubic-bezier(0.65, 0, 0.35, 1) 200ms forwards;
        }
        @keyframes hex-draw {
          to { stroke-dashoffset: 0; }
        }
        .splash-m {
          stroke-dasharray: 460;
          stroke-dashoffset: 460;
          animation: m-draw 1200ms cubic-bezier(0.65, 0, 0.35, 1) 800ms forwards;
        }
        @keyframes m-draw {
          to { stroke-dashoffset: 0; }
        }
        .splash-dot {
          opacity: 0;
          animation: dot-pulse 2s ease-in-out 1.6s infinite;
        }
        @keyframes dot-pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.6); transform-origin: 100px 100px; transform-box: fill-box; }
          50%      { opacity: 1;   transform: scale(1.4); transform-origin: 100px 100px; transform-box: fill-box; }
        }
        .splash-title {
          animation: splash-fade-in 900ms cubic-bezier(0.22, 1, 0.36, 1) 1200ms both;
          opacity: 0;
          transform: translateY(20px);
        }
        @keyframes splash-fade-in {
          0%   { opacity: 0; transform: translateY(20px) scale(0.95); filter: blur(8px); letter-spacing: 0.15em; }
          60%  { opacity: 1; filter: blur(0); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); letter-spacing: 0.02em; }
        }
        .splash-underline {
          width: 0;
          height: 3px;
          margin-top: 18px;
          border-radius: 999px;
          background: linear-gradient(90deg, transparent, #f59e0b, transparent);
          animation: splash-line 1200ms cubic-bezier(0.22, 1, 0.36, 1) 1800ms forwards;
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
          animation: splash-loader-show 600ms ease 2400ms forwards;
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
