import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
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
        error: 'مفتاح التهيئة غير صحيح'
      });
      return;
    }
    
    setDbInitLoading(true);
    setDbInitResult(null);
    try {
      const res = await axios.get(`${API}/init-db`);
      setDbInitResult({
        success: true,
        message: res.data.status === 'already_initialized' 
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
        error: err.response?.data?.detail || err.message || 'فشل في تهيئة قاعدة البيانات'
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
    const ownerEmails = ['owner@maestroegp.com', 'hanialdujaili@gmail.com'];
    if (ownerEmails.includes(email.toLowerCase())) {
      // التحقق من المفتاح السري
      if (!ownerSecretKey) {
        setError('يرجى إدخال المفتاح السري');
        setLoading(false);
        return;
      }
      
      if (ownerSecretKey !== '271018') {
        setError('المفتاح السري غير صحيح');
        setLoading(false);
        return;
      }
      
      // التحقق من كلمة المرور عبر API super-admin/login
      try {
        const response = await axios.post(`${API}/super-admin/login`, {
          email,
          password,
          secret_key: ownerSecretKey
        });
        
        if (response.data.token) {
          localStorage.setItem('super_admin_token', response.data.token);
          localStorage.setItem('super_admin_user', JSON.stringify(response.data.user));
          navigate('/super-admin');
        } else {
          setError('فشل تسجيل الدخول');
        }
      } catch (err) {
        setError(err.response?.data?.detail || 'فشل تسجيل الدخول');
      }
      setLoading(false);
      return;
    }

    const result = await login(email, password);
    
    if (result.success) {
      navigate('/');
    } else if (result.redirectToSuperAdmin) {
      // تحويل مالك النظام إلى بوابة المالك
      setIsOwnerLogin(true);
      setError('يرجى إدخال المفتاح السري');
    } else {
      setError(result.error);
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
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden" dir="rtl">
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
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
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
        /* Default Animated Background */
        <>
          <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-purple-900/50 to-gray-900" />
          
          {/* Animated gradient orbs */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] bg-gradient-to-br from-primary/30 to-purple-600/20 rounded-full blur-3xl animate-float" />
            <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-gradient-to-tr from-blue-600/20 to-primary/20 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }} />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-radial from-primary/10 to-transparent rounded-full blur-3xl" />
          </div>
          
          {/* Grid pattern overlay */}
          <div 
            className="absolute inset-0 opacity-5"
            style={{
              backgroundImage: `linear-gradient(rgba(212,175,55,0.1) 1px, transparent 1px),
                               linear-gradient(90deg, rgba(212,175,55,0.1) 1px, transparent 1px)`,
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
        className="w-full max-w-md relative z-10 glass-effect border-white/10 shadow-2xl" 
        data-testid="login-card"
      >
        <CardHeader className="text-center pb-2">
          {/* Logo - دائري مع تأثير الوميض */}
          <div 
            className={`mx-auto mb-4 w-24 h-24 rounded-full flex items-center justify-center shadow-2xl overflow-hidden ${getLogoAnimation(backgroundSettings?.logo_animation || 'pulse')} ${!backgroundSettings?.logo_url ? 'bg-gradient-to-br from-primary to-yellow-600' : ''}`}
          >
            {backgroundSettings?.logo_url ? (
              <img 
                src={backgroundSettings.logo_url.startsWith('/api') 
                  ? `${API}${backgroundSettings.logo_url.replace('/api', '')}` 
                  : backgroundSettings.logo_url} 
                alt="Logo" 
                className="w-full h-full object-cover rounded-full"
                onError={(e) => {
                  // إذا فشل تحميل الشعار، عرض الحرف M كبديل
                  e.target.style.display = 'none';
                  e.target.parentElement.classList.add('bg-gradient-to-br', 'from-primary', 'to-yellow-600');
                  e.target.parentElement.innerHTML = '<span class="text-4xl font-black text-black font-cairo">M</span>';
                }}
              />
            ) : (
              <span className="text-4xl font-black text-black font-cairo">M</span>
            )}
          </div>
          
          <CardTitle 
            className="text-3xl font-black font-cairo"
            style={{ color: backgroundSettings?.text_color || '#ffffff' }}
          >
            Maestro EGP
          </CardTitle>
          <CardDescription className="text-gray-300 mt-2">
            نظام نقاط البيع والتحكم بالتكاليف
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
                  <h3 className="text-amber-400 font-bold text-sm mb-2">تهيئة قاعدة البيانات (للمالك فقط)</h3>
                  <p className="text-gray-300 text-xs mb-3">
                    أدخل مفتاح التهيئة السري لإنشاء الحسابات الأساسية. تواصل مع مزود الخدمة للحصول على المفتاح.
                  </p>
                  
                  {dbInitResult?.success ? (
                    <div className="bg-green-500/20 border border-green-500/30 rounded-lg p-3 mb-3">
                      <div className="flex items-center gap-2 text-green-400">
                        <CheckCircle className="h-4 w-4" />
                        <span className="font-bold text-sm">{dbInitResult.message}</span>
                      </div>
                    </div>
                  ) : dbInitResult?.success === false ? (
                    <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-3 mb-3">
                      <p className="text-red-400 text-xs">{dbInitResult.error}</p>
                    </div>
                  ) : null}
                  
                  {/* Secret Key Input */}
                  <div className="mb-3">
                    <Input
                      type="password"
                      placeholder="مفتاح التهيئة السري"
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
                          جاري التهيئة...
                        </span>
                      ) : dbInitResult?.success ? (
                        <span className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4" />
                          تم بنجاح
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <Database className="h-4 w-4" />
                          تهيئة
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
                      إلغاء
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
              <Label htmlFor="email" className="text-gray-200">البريد الإلكتروني</Label>
              <div className="relative">
                <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@maestroegp.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    // إظهار حقل المفتاح السري تلقائياً عند كتابة بريد المالك
                    const ownerEmails = ['owner@maestroegp.com', 'hanialdujaili@gmail.com'];
                    setIsOwnerLogin(ownerEmails.includes(e.target.value.toLowerCase()));
                  }}
                  className="pr-10 h-12 bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-primary focus:ring-primary/20"
                  required
                  data-testid="login-email"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-gray-200">كلمة المرور</Label>
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10 pl-10 h-12 bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-primary focus:ring-primary/20"
                  required
                  data-testid="login-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
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
                  المفتاح السري
                </Label>
                <Input
                  id="secretKey"
                  type="password"
                  placeholder="أدخل المفتاح السري للمالك"
                  value={ownerSecretKey}
                  onChange={(e) => setOwnerSecretKey(e.target.value)}
                  className="h-12 bg-white/10 border-white/20 text-white placeholder:text-gray-400 focus:border-amber-500 focus:ring-amber-500/30"
                  required
                  data-testid="owner-secret-key"
                />
                <p className="text-xs text-amber-400/70">
                  هذا الحقل مطلوب للدخول كمالك النظام
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
                  جاري التسجيل...
                </span>
              ) : (
                'تسجيل الدخول'
              )}
            </Button>

            {/* روابط إضافية */}
            <div className="text-center pt-4 space-y-3">
              <button 
                type="button"
                onClick={() => alert('يرجى التواصل مع مدير النظام لإعادة تعيين كلمة المرور')}
                className="text-sm text-gray-400 hover:text-primary transition-colors block w-full"
              >
                نسيت كلمة المرور؟
              </button>
              
              {/* زر بوابة السائقين */}
              <a 
                href="/driver" 
                className="flex items-center justify-center gap-2 text-sm text-amber-400 hover:text-amber-300 transition-colors py-2 px-4 rounded-lg border border-amber-500/30 hover:border-amber-500/50 hover:bg-amber-500/10 mx-auto"
              >
                <Truck className="h-4 w-4" />
                بوابة السائقين
              </a>
              
              {/* Direct database init button - always visible */}
              <button 
                type="button"
                onClick={() => setShowDbInit(true)}
                className="text-xs text-gray-600 hover:text-amber-400 transition-colors block w-full mt-4"
                data-testid="show-db-init-link"
              >
                أول استخدام؟ تهيئة قاعدة البيانات
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
