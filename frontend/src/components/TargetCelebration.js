import React, { useState, useEffect } from 'react';

// احتفال إصابة الهدف - سهم يصيب الهدف 🎯
const TargetCelebration = ({ show, onComplete }) => {
  const [phase, setPhase] = useState('idle');
  
  useEffect(() => {
    if (show) {
      setPhase('arrow-flying');
      const t1 = setTimeout(() => setPhase('hit'), 800);
      const t2 = setTimeout(() => setPhase('explode'), 1200);
      const t3 = setTimeout(() => {
        setPhase('idle');
        onComplete?.();
      }, 4000);
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }
  }, [show, onComplete]);

  if (phase === 'idle') return null;

  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none"
      data-testid="target-celebration"
    >
      {/* خلفية شفافة داكنة */}
      <div className={`absolute inset-0 bg-black/40 transition-opacity duration-500 ${phase === 'explode' ? 'opacity-0' : 'opacity-100'}`} />
      
      {/* الهدف */}
      <div className="relative">
        {/* دوائر الهدف */}
        <div className={`relative transition-transform duration-300 ${phase === 'hit' || phase === 'explode' ? 'scale-110' : 'scale-100'}`}>
          {/* الحلقة الخارجية */}
          <div className="w-48 h-48 rounded-full border-[12px] border-red-500 flex items-center justify-center"
               style={{ animation: phase === 'hit' || phase === 'explode' ? 'pulse 0.3s ease-in-out 3' : 'none' }}>
            {/* الحلقة الوسطى */}
            <div className="w-32 h-32 rounded-full border-[10px] border-white flex items-center justify-center">
              {/* الحلقة الداخلية */}
              <div className="w-20 h-20 rounded-full border-[8px] border-red-500 flex items-center justify-center">
                {/* عين الثور */}
                <div className={`w-8 h-8 rounded-full bg-red-600 transition-all duration-200 ${phase === 'hit' || phase === 'explode' ? 'bg-yellow-400 scale-150' : ''}`} />
              </div>
            </div>
          </div>
        </div>
        
        {/* السهم */}
        <div 
          className={`absolute top-1/2 -translate-y-1/2 transition-all ${
            phase === 'arrow-flying' 
              ? 'right-[-300px] opacity-100' 
              : phase === 'hit' || phase === 'explode'
              ? 'right-[45%] opacity-100'
              : 'right-[-300px] opacity-0'
          }`}
          style={{ 
            transitionDuration: phase === 'arrow-flying' ? '0.8s' : '0s',
            transitionTimingFunction: 'cubic-bezier(0.25, 0.1, 0.25, 1)'
          }}
        >
          {/* رأس السهم */}
          <div className="flex items-center">
            <div className="w-0 h-0 border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent border-r-[16px] border-r-yellow-400 rotate-180" />
            <div className="w-20 h-1 bg-gradient-to-r from-yellow-600 to-yellow-400" />
            {/* ريش السهم */}
            <div className="relative">
              <div className="w-0 h-0 border-t-[6px] border-t-red-500 border-r-[10px] border-r-transparent absolute -top-[6px]" />
              <div className="w-0 h-0 border-b-[6px] border-b-red-500 border-r-[10px] border-r-transparent absolute -bottom-[6px]" />
            </div>
          </div>
        </div>
        
        {/* شرارات الاصطدام */}
        {(phase === 'hit' || phase === 'explode') && (
          <div className="absolute inset-0 flex items-center justify-center">
            {[...Array(12)].map((_, i) => (
              <div
                key={i}
                className="absolute w-3 h-3 rounded-full"
                style={{
                  background: i % 3 === 0 ? '#fbbf24' : i % 3 === 1 ? '#ef4444' : '#f97316',
                  animation: `spark-fly 0.8s ease-out ${i * 0.05}s forwards`,
                  transform: `rotate(${i * 30}deg) translateX(20px)`,
                }}
              />
            ))}
          </div>
        )}
        
        {/* نص التهنئة */}
        {phase === 'explode' && (
          <div className="absolute -bottom-24 left-1/2 -translate-x-1/2 text-center whitespace-nowrap"
               style={{ animation: 'bounce-in 0.5s ease-out forwards' }}>
            <p className="text-3xl font-bold text-yellow-400 drop-shadow-lg" style={{ textShadow: '0 0 20px rgba(251,191,36,0.5)' }}>
              تم تحقيق الهدف!
            </p>
            <p className="text-xl text-white mt-1 drop-shadow-md">ممتاز! استمر بالعمل الرائع</p>
          </div>
        )}
      </div>
      
      {/* CSS للحركات */}
      <style>{`
        @keyframes spark-fly {
          0% { transform: rotate(var(--angle)) translateX(20px); opacity: 1; }
          100% { transform: rotate(var(--angle)) translateX(120px); opacity: 0; }
        }
        @keyframes bounce-in {
          0% { transform: translate(-50%, 20px) scale(0.5); opacity: 0; }
          60% { transform: translate(-50%, -5px) scale(1.1); opacity: 1; }
          100% { transform: translate(-50%, 0) scale(1); opacity: 1; }
        }
        @keyframes pulse { 50% { transform: scale(1.05); } }
        ${[...Array(12)].map((_, i) => `
          div[style*="rotate(${i * 30}deg)"] {
            --angle: ${i * 30}deg;
            animation: spark-fly 0.8s ease-out ${i * 0.05}s forwards !important;
            transform: rotate(${i * 30}deg) translateX(20px) !important;
          }
        `).join('')}
      `}</style>
    </div>
  );
};

export default TargetCelebration;
