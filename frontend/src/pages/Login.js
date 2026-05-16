import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Lock, Mail, Eye, EyeOff, AlertCircle, Database, CheckCircle, Loader2, Truck, Key } from 'lucide-react';
import axios from 'axios';
import { API_URL } from '../utils/api';

const API = API_URL;

// خلفيات افتراضية في حالة فشل جلب الخلفيات من الخادم
const DEFAULT_BACKGROUNDS = {
  backgrounds: [
    {
      id: 'default-1',
      image_url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1920',
      title: 'مطعم فاخر',
      is_active: true
    },
    {
      id: 'default-2',
      image_url: 'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=1920',
      title: 'مطعم حديث',
      is_active: true
    },
    {
      id: 'default-3',
      image_url: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1920',
      title: 'طعام شهي',
      is_active: true
    },
    {
      id: 'default-4',
      image_url: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1920',
      title: 'مطعم أنيق',
      is_active: true
    },
    {
      id: 'default-5',
      image_url: 'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=1920',
      title: 'كافيه عصري',
      is_active: true
    },
    {
      id: 'default-6',
      image_url: 'https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?w=1920',
      title: 'مطبخ احترافي',
      is_active: true
    }
  ],
  settings: {
    transition_effect: 'fade',
    transition_speed: 5,
    overlay_color: 'rgba(0,0,0,0.5)',
    text_color: '#ffffff'
  },
  auto_play: true,
  transition_duration: 1.5
};

// Animation styles
const animationStyles = {
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 }
  },
  zoom: {
    initial: { scale: 1.1, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
    exit: { scale: 1.05, opacity: 0 }
  },
  kenburns: {
    animation: 'kenburns 20s ease-in-out infinite alternate'
  },
  slide: {
    initial: { x: '100%', opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: { x: '-100%', opacity: 0 }
  },
  parallax: {
    animation: 'parallax 30s linear infinite'
  }
};

export default function Login() {
  const { t, isRTL, lang, changeLanguage } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Database initialization states
  const [showDbInit, setShowDbInit] = useState(false);
  const [dbInitLoading, setDbInitLoading] = useState(false);
  const [dbInitResult, setDbInitResult] = useState(null);
  const [loginFailCount, setLoginFailCount] = useState(0);
  
  // Background states
  const [backgroundSettings, setBackgroundSettings] = useState(null);
  const [currentBgIndex, setCurrentBgIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  // Secret key for database initialization
  const [initSecretKey, setInitSecretKey] = useState('');
  
  // Owner login states - المفتاح السري للمالك
  const [isOwnerLogin, setIsOwnerLogin] = useState(false);
  const [ownerSecretKey, setOwnerSecretKey] = useState('');

  const { login } = useAuth();
  const navigate = useNavigate();
  
  // Function to initialize database - requires secret key
  const initializeDatabase = async () => {
    // Validate secret key
    if (initSecretKey !== '271018') {
      setDbInitResult({
        success: false,
        errorKey: 'مفتاح التهيئة غير صحيح'
      });
      return;
    }
    
    setDbInitLoading(true);
    setDbInitResult(null);
    try {
      const res = await axios.get(`${API}/init-db`);
      setDbInitResult({
        success: true,
        messageKey: res.data.status === 'already_initialized' 
          ? 'قاعدة البيانات مهيأة مسبقاً' 
          : 'تم تهيئة قاعدة البيانات بنجاح'
      });
      // Hide panel after success
      setTimeout(() => {
        setShowDbInit(false);
        setError('');
        setLoginFailCount(0);
        setInitSecretKey('');
      }, 3000);
    } catch (err) {
      setDbInitResult({
        success: false,
        errorKey: 'فشل في تهيئة قاعدة البيانات',
        errorDetail: err.response?.data?.detail || err.message
      });
    } finally {
      setDbInitLoading(false);
    }
  };

  // Fetch background settings
  useEffect(() => {
    const fetchBackgrounds = async () => {
      try {
        const res = await axios.get(`${API}/login-backgrounds`);
        if (res.data && res.data.backgrounds && res.data.backgrounds.length > 0) {
          setBackgroundSettings(res.data);
        } else {
          // استخدام الخلفيات الافتراضية إذا لم توجد خلفيات
          setBackgroundSettings(DEFAULT_BACKGROUNDS);
        }
      } catch (error) {
        console.log('Using default backgrounds');
        // استخدام الخلفيات الافتراضية في حالة الخطأ
        setBackgroundSettings(DEFAULT_BACKGROUNDS);
      }
    };
    fetchBackgrounds();
  }, []);

  // Auto-rotate backgrounds
  useEffect(() => {
    if (!backgroundSettings?.backgrounds?.length || !backgroundSettings?.auto_play) return;
    
    const interval = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentBgIndex((prev) => 
          (prev + 1) % backgroundSettings.backgrounds.length
        );
        setIsTransitioning(false);
      }, (backgroundSettings.transition_duration || 1.5) * 1000);
    }, 8000); // Change every 8 seconds
    
    return () => clearInterval(interval);
  }, [backgroundSettings]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // التحقق إذا كان البريد الإلكتروني للمالك
    const ownerEmails = ['owner@maestroegp.com'];
    if (ownerEmails.includes(email.toLowerCase())) {
      // التحقق من وجود المفتاح السري
      if (!ownerSecretKey) {
        setError(t('يرجى إدخال المفتاح السري'));
        setLoading(false);
        return;
      }
      
      // إرسال الطلب للخادم للتحقق من البيانات
      try {
        const response = await axios.post(`${API}/super-admin/login`, {
          email,
          password,
          secret_key: ownerSecretKey
        });
        
        if (response.data.token) {
          localStorage.setItem('super_admin_token', response.data.token);
          localStorage.setItem('super_admin_user', JSON.stringify(response.data.user));
          // ⭐ تشغيل Splash فوراً قبل التنقل لتغطية أي وميض للداش
          sessionStorage.setItem('show_post_login_splash', '1');
          window.dispatchEvent(new Event('show-splash'));
          // تأخير صغير جداً ليضمن أن Splash مرسوم قبل الانتقال
          setTimeout(() => navigate('/super-admin'), 50);
        } else {
          setError(t('فشل تسجيل الدخول'));
        }
      } catch (err) {
        setError(t(err.response?.data?.detail || 'فشل تسجيل الدخول'));
      }
      setLoading(false);
      return;
    }

    const result = await login(email, password);
    
    if (result.success) {
      // ⭐ تشغيل Splash فوراً قبل التنقل لتغطية أي وميض للداش
      sessionStorage.setItem('show_post_login_splash', '1');
      window.dispatchEvent(new Event('show-splash'));
      // تأخير صغير ليضمن أن Splash مرسوم قبل الانتقال
      setTimeout(() => navigate('/'), 50);
    } else if (result.redirectToSuperAdmin) {
      // تحويل مالك النظام إلى بوابة المالك
      setIsOwnerLogin(true);
      setError(t('يرجى إدخال المفتاح السري'));
    } else {
      setError(t(result.error));
      // After 2 failed login attempts, show database initialization option
      const newFailCount = loginFailCount + 1;
      setLoginFailCount(newFailCount);
      if (newFailCount >= 2) {
        setShowDbInit(true);
      }
    }
    
    setLoading(false);
  };

  const currentBg = backgroundSettings?.backgrounds?.[currentBgIndex];
  const hasBackgrounds = backgroundSettings?.backgrounds?.length > 0;

  // Get animation class based on type
  const getAnimationClass = (type) => {
    switch(type) {
      case 'kenburns': return 'animate-kenburns';
      case 'parallax': return 'animate-parallax';
      case 'zoom': return 'animate-zoom-slow';
      case 'slide': return 'animate-slide-slow';
      default: return '';
    }
  };

  // Get logo animation class
  const getLogoAnimation = (type) => {
    switch(type) {
      case 'pulse': return 'animate-pulse-glow';
      case 'bounce': return 'animate-bounce';
      case 'glow': return 'glow-gold';
      default: return '';
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Custom CSS for animations */}
      <style>{`
        @keyframes kenburns {
          0% { transform: scale(1) translate(0, 0); }
          50% { transform: scale(1.1) translate(-2%, -1%); }
          100% { transform: scale(1) translate(0, 0); }
        }
        
        @keyframes parallax {
          0% { transform: translateX(0); }
          100% { transform: translateX(-10%); }
        }
        
        @keyframes zoom-slow {
          0% { transform: scale(1); }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
        
        @keyframes pulse-glow {
          0%, 100% { 
            box-shadow: 0 0 20px rgba(212, 175, 55, 0.5),
                        0 0 40px rgba(212, 175, 55, 0.3),
                        0 0 60px rgba(212, 175, 55, 0.1);
          }
          50% { 
            box-shadow: 0 0 30px rgba(212, 175, 55, 0.8),
                        0 0 60px rgba(212, 175, 55, 0.5),
                        0 0 90px rgba(212, 175, 55, 0.2);
          }
        }
        
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        
        @keyframes gradient-shift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        
        .animate-kenburns { animation: kenburns 20s ease-in-out infinite; }
        .animate-parallax { animation: parallax 30s linear infinite; }
        .animate-zoom-slow { animation: zoom-slow 15s ease-in-out infinite; }
        .animate-pulse-glow { animation: pulse-glow 2s ease-in-out infinite; }
        .animate-float { animation: float 3s ease-in-out infinite; }
        .animate-gradient { 
          background-size: 200% 200%;
          animation: gradient-shift 8s ease infinite;
        }
        
        .bg-transition {
          transition: opacity ${backgroundSettings?.transition_duration || 1.5}s ease-in-out;
        }
        
        .glass-effect {
          background: rgba(15, 15, 30, 0.55);
          backdrop-filter: blur(22px) saturate(140%);
          -webkit-backdrop-filter: blur(22px) saturate(140%);
          border: 1px solid rgba(255, 209, 102, 0.18);
        }

        /* ✦ Login Logo Animations — مطابقة لـ SplashScreen */
        .login-logo-wrap {
          animation: login-logo-enter 1100ms cubic-bezier(0.22, 1, 0.36, 1) both;
          opacity: 0;
        }
        @keyframes login-logo-enter {
          0%   { opacity: 0; transform: scale(0.4) rotate(-90deg); }
          60%  { opacity: 1; transform: scale(1.08) rotate(5deg); }
          100% { opacity: 1; transform: scale(1) rotate(0deg); }
        }
        .login-logo-svg {
          animation: login-logo-float 3.6s ease-in-out 1.1s infinite;
        }
        @keyframes login-logo-float {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-5px); }
        }
        .login-ring-spin {
          animation: login-ring-spin 6s linear 1.1s infinite;
          transform-box: fill-box;
        }
        @keyframes login-ring-spin {
          to { transform: rotate(360deg); }
        }
        .login-hex {
          stroke-dasharray: 720;
          stroke-dashoffset: 720;
          animation: login-hex-draw 1400ms cubic-bezier(0.65, 0, 0.35, 1) 200ms forwards;
        }
        @keyframes login-hex-draw { to { stroke-dashoffset: 0; } }
        .login-m {
          stroke-dasharray: 460;
          stroke-dashoffset: 460;
          animation: login-m-draw 1200ms cubic-bezier(0.65, 0, 0.35, 1) 800ms forwards;
        }
        @keyframes login-m-draw { to { stroke-dashoffset: 0; } }
        .login-dot {
          opacity: 0;
          animation: login-dot-pulse 2s ease-in-out 1.6s infinite;
        }
        @keyframes login-dot-pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.6); transform-origin: 100px 100px; transform-box: fill-box; }
          50%      { opacity: 1;   transform: scale(1.4); transform-origin: 100px 100px; transform-box: fill-box; }
        }
        .login-title {
          animation: login-title-in 900ms cubic-bezier(0.22, 1, 0.36, 1) 1200ms both;
          opacity: 0;
        }
        @keyframes login-title-in {
          0%   { opacity: 0; transform: translateY(16px) scale(0.96); filter: blur(6px); letter-spacing: 0.15em; }
          60%  { opacity: 1; filter: blur(0); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); letter-spacing: 0.02em; }
        }
        .login-underline {
          width: 0;
          height: 3px;
          margin-top: 12px;
          border-radius: 999px;
          background: linear-gradient(90deg, transparent, #f59e0b, transparent);
          animation: login-line 1200ms cubic-bezier(0.22, 1, 0.36, 1) 1800ms forwards;
        }
        @keyframes login-line {
          0%   { width: 0; opacity: 0; }
          100% { width: 200px; opacity: 1; }
        }
      `}</style>

      {/* Dynamic Background Layers */}
      {hasBackgrounds ? (
        <>
          {/* Background Images */}
          {backgroundSettings.backgrounds.filter(b => b.is_active).map((bg, index) => (
            <div
              key={bg.id || index}
              className={`absolute inset-0 bg-cover bg-center bg-transition ${getAnimationClass(bg.animation_type)}`}
              style={{
                backgroundImage: `url(${bg.image_url})`,
                opacity: index === currentBgIndex && !isTransitioning ? 1 : 0,
                zIndex: 0
              }}
            />
          ))}
          
          {/* Overlay */}
          <div 
            className="absolute inset-0 z-[1]"
            style={{ 
              background: backgroundSettings.overlay_color || 'rgba(0,0,0,0.5)'
            }}
          />
        </>
      ) : (
        /* Default Animated Background — مطابق لـ SplashScreen */
        <>
          <div 
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f1e 100%)'
            }}
          />
          
          {/* بريق ذهبي ناعم في المنتصف */}
          <div 
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse at center, rgba(255,200,80,0.18) 0%, transparent 60%)'
            }}
          />
          
          {/* كرات متوهجة ذهبية متحركة */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] bg-gradient-to-br from-amber-500/20 to-yellow-600/10 rounded-full blur-3xl animate-float" />
            <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-gradient-to-tr from-amber-400/15 to-orange-500/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }} />
          </div>
          
          {/* شبكة ذهبية خفيفة */}
          <div 
            className="absolute inset-0 opacity-5"
            style={{
              backgroundImage: `linear-gradient(rgba(245,158,11,0.15) 1px, transparent 1px),
                               linear-gradient(90deg, rgba(245,158,11,0.15) 1px, transparent 1px)`,
              backgroundSize: '50px 50px'
            }}
          />
        </>
      )}

      {/* Particles effect */}
      <div className="absolute inset-0 z-[2] pointer-events-none overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-primary/30 rounded-full animate-float"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 5}s`,
              animationDuration: `${3 + Math.random() * 4}s`
            }}
          />
        ))}
      </div>

      {/* Login Card */}
      <Card 
        className="w-full max-w-md relative z-10 glass-effect border-amber-500/20 shadow-2xl" 
        data-testid="login-card"
        style={{
          boxShadow: '0 25px 80px -15px rgba(0,0,0,0.6), 0 0 60px -20px rgba(255,200,80,0.25)'
        }}
      >
        <CardHeader className="text-center pb-2">
          {/* ⭐ شعار M سداسي ذهبي متحرك — مطابق للـ SplashScreen */}
          <div 
            className="mx-auto mb-4 login-logo-wrap"
            data-testid="login-logo"
            style={{ filter: 'drop-shadow(0 6px 24px rgba(255,200,80,0.4))' }}
          >
            {backgroundSettings?.logo_url ? (
              <img 
                src={backgroundSettings.logo_url.startsWith('/api') 
                  ? `${API}${backgroundSettings.logo_url.replace('/api', '')}` 
                  : backgroundSettings.logo_url} 
                alt="Logo" 
                className="w-24 h-24 object-cover rounded-full mx-auto"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            ) : (
              <svg
                viewBox="0 0 200 200"
                width="110"
                height="110"
                className="login-logo-svg mx-auto"
                aria-hidden="true"
              >
                <defs>
                  <linearGradient id="loginGold" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#ffe7a0" />
                    <stop offset="50%" stopColor="#ffd166" />
                    <stop offset="100%" stopColor="#f59e0b" />
                  </linearGradient>
                  <filter id="loginGlow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="2.5" result="b" />
                    <feMerge>
                      <feMergeNode in="b" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                {/* خاتم خارجي يدور */}
                <g className="login-ring-spin" style={{ transformOrigin: '100px 100px' }}>
                  <circle cx="100" cy="100" r="92" stroke="url(#loginGold)" strokeWidth="2" fill="none" opacity="0.55" />
                  <circle cx="100" cy="100" r="92" stroke="url(#loginGold)" strokeWidth="3" fill="none"
                          strokeDasharray="40 200" strokeLinecap="round" />
                </g>
                {/* السداسي */}
                <polygon
                  points="100,18 168,55 168,145 100,182 32,145 32,55"
                  fill="none"
                  stroke="url(#loginGold)"
                  strokeWidth="3.5"
                  filter="url(#loginGlow)"
                  className="login-hex"
                />
                {/* حرف M */}
                <path
                  d="M55 142 V70 L100 120 L145 70 V142"
                  fill="none"
                  stroke="url(#loginGold)"
                  strokeWidth="9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter="url(#loginGlow)"
                  className="login-m"
                />
                <circle cx="100" cy="100" r="4" fill="url(#loginGold)" className="login-dot" />
              </svg>
            )}
          </div>
          
          <CardTitle 
            className="text-4xl font-black font-cairo login-title"
            style={{
              letterSpacing: '0.02em',
              textShadow: '0 4px 24px rgba(0,0,0,0.5), 0 0 40px rgba(255,200,80,0.25)',
              color: '#ffffff'
            }}
          >
            Maestro{' '}
            <span style={{
              background: 'linear-gradient(180deg, #ffd166 0%, #f59e0b 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}>EGP</span>
          </CardTitle>
          {/* خط ذهبي تحت العنوان */}
          <div className="login-underline mx-auto" />
          <CardDescription className="text-gray-300 mt-3 text-sm">
            {t('نظام نقاط البيع والتحكم بالتكاليف')}
          </CardDescription>
          
          {/* Background indicator dots */}
          {hasBackgrounds && backgroundSettings.backgrounds.length > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              {backgroundSettings.backgrounds.filter(b => b.is_active).map((_, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setIsTransitioning(true);
                    setTimeout(() => {
                      setCurrentBgIndex(index);
                      setIsTransitioning(false);
                    }, 500);
                  }}
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    index === currentBgIndex 
                      ? 'bg-primary w-6' 
                      : 'bg-white/30 hover:bg-white/50'
                  }`}
                />
              ))}
            </div>
          )}
        </CardHeader>

        <CardContent className="pt-6">
          {/* Database Initialization Panel - Secured with Secret Key */}
          {showDbInit && (
            <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg" data-testid="db-init-panel">
              <div className="flex items-start gap-3">
                <Database className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-amber-400 font-bold text-sm mb-2">{t('تهيئة قاعدة البيانات')} ({t('للمالك فقط')})</h3>
                  <p className="text-gray-300 text-xs mb-3">
                    {t('أدخل مفتاح التهيئة السري لإنشاء الحسابات الأساسية')}
                  </p>
                  
                  {dbInitResult?.success ? (
                    <div className="bg-green-500/20 border border-green-500/30 rounded-lg p-3 mb-3">
                      <div className="flex items-center gap-2 text-green-400">
                        <CheckCircle className="h-4 w-4" />
                        <span className="font-bold text-sm">{t(dbInitResult.messageKey)}</span>
                      </div>
                    </div>
                  ) : dbInitResult?.success === false ? (
                    <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-3 mb-3">
                      <p className="text-red-400 text-xs">{t(dbInitResult.errorKey)}{dbInitResult.errorDetail ? `: ${dbInitResult.errorDetail}` : ''}</p>
                    </div>
                  ) : null}
                  
                  {/* Secret Key Input */}
                  <div className="mb-3">
                    <Input
                      type="password"
                      placeholder={t('مفتاح التهيئة السري')}
                      value={initSecretKey}
                      onChange={(e) => setInitSecretKey(e.target.value)}
                      className="h-10 bg-white/5 border-white/10 text-white placeholder:text-gray-500 text-sm"
                      data-testid="init-secret-key"
                    />
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      onClick={initializeDatabase}
                      disabled={dbInitLoading || dbInitResult?.success || !initSecretKey}
                      className="flex-1 h-10 text-sm font-bold bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-50"
                      data-testid="init-db-button"
                    >
                      {dbInitLoading ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {t('جاري التهيئة...')}
                        </span>
                      ) : dbInitResult?.success ? (
                        <span className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4" />
                          {t('تم بنجاح')}
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <Database className="h-4 w-4" />
                          {t('تهيئة')}
                        </span>
                      )}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        setShowDbInit(false);
                        setDbInitResult(null);
                        setInitSecretKey('');
                      }}
                      className="h-10 px-4 text-sm bg-gray-600 text-white hover:bg-gray-500"
                    >
                      {t('إلغاء')}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div 
                className="bg-red-500/20 border border-red-500/30 text-red-300 rounded-lg p-3 flex items-center gap-2" 
                data-testid="login-error"
              >
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-gray-200">{t('البريد الإلكتروني')}</Label>
              <div className="relative">
                <Mail className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400`} />
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@maestroegp.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    // إظهار حقل المفتاح السري تلقائياً عند كتابة بريد المالك
                    const ownerEmails = ['owner@maestroegp.com'];
                    setIsOwnerLogin(ownerEmails.includes(e.target.value.toLowerCase()));
                  }}
                  className={`${isRTL ? 'pr-10' : 'pl-10'} h-12 bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-primary focus:ring-primary/20`}
                  required
                  data-testid="login-email"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-gray-200">{t('كلمة المرور')}</Label>
              <div className="relative">
                <Lock className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400`} />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${isRTL ? 'pr-10 pl-10' : 'pl-10 pr-10'} h-12 bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-primary focus:ring-primary/20`}
                  required
                  data-testid="login-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={`absolute ${isRTL ? 'left-3' : 'right-3'} top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors`}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* حقل المفتاح السري للمالك */}
            {isOwnerLogin && (
              <div className="space-y-2 animate-fadeIn">
                <Label htmlFor="secretKey" className="text-gray-200 flex items-center gap-2">
                  <Key className="h-4 w-4 text-amber-400" />
                  {t('المفتاح السري')}
                </Label>
                <Input
                  id="secretKey"
                  type="password"
                  placeholder={t('أدخل المفتاح السري للمالك')}
                  value={ownerSecretKey}
                  onChange={(e) => setOwnerSecretKey(e.target.value)}
                  className="h-12 bg-white/10 border-white/20 text-white placeholder:text-gray-400 focus:border-amber-500 focus:ring-amber-500/30"
                  required
                  data-testid="owner-secret-key"
                />
                <p className="text-xs text-amber-400/70">
                  {t('هذا الحقل مطلوب للدخول كمالك النظام')}
                </p>
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-12 text-lg font-bold bg-gradient-to-r from-primary to-yellow-600 text-black hover:from-primary/90 hover:to-yellow-500 shadow-lg shadow-primary/30 transition-all duration-300 hover:shadow-primary/50 hover:scale-[1.02] active:scale-95"
              disabled={loading}
              data-testid="login-submit"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {t('جاري التسجيل...')}
                </span>
              ) : (
                t('تسجيل الدخول')
              )}
            </Button>

            {/* روابط إضافية */}
            <div className="text-center pt-4 space-y-3">
              <button 
                type="button"
                onClick={() => alert(t('يرجى التواصل مع مدير النظام'))}
                className="text-sm text-gray-400 hover:text-primary transition-colors block w-full"
              >
                {t('نسيت كلمة المرور؟')}
              </button>
              
              {/* زر تطبيق السائق */}
              <a 
                href="/driver-app" 
                className="flex items-center justify-center gap-2 text-sm text-amber-400 hover:text-amber-300 transition-colors py-2 px-4 rounded-lg border border-amber-500/30 hover:border-amber-500/50 hover:bg-amber-500/10 mx-auto"
              >
                <Truck className="h-4 w-4" />
                {t('تطبيق السائق')}
              </a>
              
              {/* زر تغيير اللغة */}
              <div className="flex justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => changeLanguage('ar')}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
                    lang === 'ar' 
                      ? 'bg-primary text-black font-bold' 
                      : 'text-gray-400 hover:text-white hover:bg-white/10'
                  }`}
                >
                  العربية
                </button>
                <button
                  type="button"
                  onClick={() => changeLanguage('en')}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
                    lang === 'en' 
                      ? 'bg-primary text-black font-bold' 
                      : 'text-gray-400 hover:text-white hover:bg-white/10'
                  }`}
                >
                  English
                </button>
                <button
                  type="button"
                  onClick={() => changeLanguage('ku')}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
                    lang === 'ku' 
                      ? 'bg-primary text-black font-bold' 
                      : 'text-gray-400 hover:text-white hover:bg-white/10'
                  }`}
                >
                  کوردی
                </button>
              </div>
              
              {/* Direct database init button - always visible */}
              <button 
                type="button"
                onClick={() => setShowDbInit(true)}
                className="text-xs text-gray-600 hover:text-amber-400 transition-colors block w-full mt-4"
                data-testid="show-db-init-link"
              >
                {t('أول استخدام؟')} {t('تهيئة قاعدة البيانات')}
              </button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Current background title - hidden for cleaner look */}
      {/* {currentBg?.title && (
        <div className="absolute bottom-6 left-6 z-10">
          <p className="text-white/50 text-sm">{currentBg.title}</p>
        </div>
      )} */}
    </div>
  );
}
