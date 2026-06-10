import React from 'react';

/**
 * BrandLogo — الشعار الموحّد لـ Maestro EGP (سداسي ذهبي متحرك + الاسم).
 * مطابق لشعار صفحة تسجيل الدخول. يُستخدم في تطبيق الزبائن والسائق وكل التطبيقات.
 *
 * props:
 *  - size: قطر شعار الـ SVG (افتراضي 104)
 *  - tagline: نص توضيحي تحت الاسم (اختياري)
 *  - dark: true => خلفية داكنة (Maestro أبيض)، false => خلفية فاتحة (Maestro رمادي داكن)
 *  - showName: إظهار اسم Maestro EGP (افتراضي true)
 */
export const BrandLogo = ({ size = 104, tagline = null, dark = true, showName = true, className = '' }) => {
  return (
    <div className={`flex flex-col items-center ${className}`} data-testid="brand-logo">
      <style>{`
        .bl-wrap { animation: bl-enter 1100ms cubic-bezier(0.22,1,0.36,1) both; opacity: 0; filter: drop-shadow(0 6px 24px rgba(255,200,80,0.4)); }
        @keyframes bl-enter { 0%{opacity:0;transform:scale(0.4) rotate(-90deg);} 60%{opacity:1;transform:scale(1.08) rotate(5deg);} 100%{opacity:1;transform:scale(1) rotate(0);} }
        .bl-svg { animation: bl-float 3.6s ease-in-out 1.1s infinite; }
        @keyframes bl-float { 0%,100%{transform:translateY(0);} 50%{transform:translateY(-5px);} }
        .bl-ring { animation: bl-ring-spin 6s linear 1.1s infinite; transform-box: fill-box; transform-origin: 100px 100px; }
        @keyframes bl-ring-spin { to { transform: rotate(360deg); } }
        .bl-hex { stroke-dasharray: 720; stroke-dashoffset: 720; animation: bl-hex-draw 1400ms cubic-bezier(0.65,0,0.35,1) 200ms forwards; }
        @keyframes bl-hex-draw { to { stroke-dashoffset: 0; } }
        .bl-m { stroke-dasharray: 460; stroke-dashoffset: 460; animation: bl-m-draw 1200ms cubic-bezier(0.65,0,0.35,1) 800ms forwards; }
        @keyframes bl-m-draw { to { stroke-dashoffset: 0; } }
        .bl-dot { opacity: 0; transform-box: fill-box; transform-origin: 100px 100px; animation: bl-dot 2s ease-in-out 1.6s infinite; }
        @keyframes bl-dot { 0%,100%{opacity:0.3;transform:scale(0.6);} 50%{opacity:1;transform:scale(1.4);} }
        .bl-disc { opacity:0; animation: bl-fade 700ms cubic-bezier(0.22,1,0.36,1) 100ms forwards; }
        .bl-disc-ring { opacity:0; animation: bl-fade7 800ms cubic-bezier(0.22,1,0.36,1) 250ms forwards; }
        @keyframes bl-fade { to { opacity: 1; } }
        @keyframes bl-fade7 { to { opacity: 0.7; } }
        .bl-title { animation: bl-title-in 900ms cubic-bezier(0.22,1,0.36,1) 1100ms both; opacity:0; }
        @keyframes bl-title-in { 0%{opacity:0;transform:translateY(14px) scale(0.96);filter:blur(6px);letter-spacing:0.15em;} 60%{opacity:1;filter:blur(0);} 100%{opacity:1;transform:translateY(0) scale(1);filter:blur(0);letter-spacing:0.02em;} }
        .bl-shimmer { background:linear-gradient(90deg,#ffffff 0%,#fff7d6 25%,#ffd166 50%,#fff7d6 75%,#ffffff 100%); background-size:200% 100%; -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; color:transparent; animation: bl-shimmer 3.5s ease-in-out 2.1s infinite; }
        @keyframes bl-shimmer { 0%{background-position:200% 0;} 100%{background-position:-200% 0;} }
        .bl-egp { display:inline-block; background:linear-gradient(180deg,#ffd166 0%,#f59e0b 100%); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; animation: bl-egp 2.6s ease-in-out 2.1s infinite; }
        @keyframes bl-egp { 0%,100%{transform:scale(1);filter:drop-shadow(0 0 8px rgba(255,209,102,0.4));} 50%{transform:scale(1.06);filter:drop-shadow(0 0 18px rgba(255,209,102,0.9));} }
        .bl-underline { width:0; height:3px; margin-top:12px; border-radius:999px; background:linear-gradient(90deg,transparent 0%,#ffd166 30%,#f59e0b 50%,#ffd166 70%,transparent 100%); box-shadow:0 0 12px rgba(255,209,102,0.6); animation: bl-line 1200ms cubic-bezier(0.22,1,0.36,1) 1700ms forwards; }
        @keyframes bl-line { 0%{width:0;opacity:0;} 100%{width:200px;opacity:1;} }
      `}</style>

      <div className="bl-wrap">
        <svg viewBox="0 0 200 200" width={size} height={size} className="bl-svg" aria-hidden="true">
          <defs>
            <linearGradient id="blGold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffe7a0" />
              <stop offset="50%" stopColor="#ffd166" />
              <stop offset="100%" stopColor="#f59e0b" />
            </linearGradient>
            <radialGradient id="blDisc" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#1a1a2e" stopOpacity="0.95" />
              <stop offset="70%" stopColor="#0f0f1e" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.85" />
            </radialGradient>
            <filter id="blGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2.5" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <circle cx="100" cy="100" r="86" fill="url(#blDisc)" className="bl-disc" />
          <circle cx="100" cy="100" r="86" stroke="url(#blGold)" strokeWidth="2" fill="none" opacity="0.7" className="bl-disc-ring" />
          <g className="bl-ring">
            <circle cx="100" cy="100" r="94" stroke="url(#blGold)" strokeWidth="3" fill="none" strokeDasharray="40 200" strokeLinecap="round" />
          </g>
          <polygon points="100,30 158,62 158,138 100,170 42,138 42,62" fill="none" stroke="url(#blGold)" strokeWidth="3.5" filter="url(#blGlow)" className="bl-hex" />
          <path d="M55 142 V70 L100 120 L145 70 V142" fill="none" stroke="url(#blGold)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" filter="url(#blGlow)" className="bl-m" />
          <circle cx="100" cy="100" r="4" fill="url(#blGold)" className="bl-dot" />
        </svg>
      </div>

      {showName && (
        <>
          <h1 className="bl-title text-4xl font-black mt-3" dir="ltr" style={{ letterSpacing: '0.02em', textShadow: dark ? '0 4px 24px rgba(0,0,0,0.5), 0 0 40px rgba(255,200,80,0.25)' : 'none' }}>
            {dark
              ? <span className="bl-shimmer">Maestro</span>
              : <span style={{ color: '#1f2937' }}>Maestro</span>}
            {' '}
            <span className="bl-egp">EGP</span>
          </h1>
          {tagline && (
            <p className={`mt-2 text-sm ${dark ? 'text-gray-300' : 'text-gray-500'}`}>{tagline}</p>
          )}
          <div className="bl-underline" />
        </>
      )}
    </div>
  );
};

export default BrandLogo;
