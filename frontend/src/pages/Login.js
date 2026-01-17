import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Lock, Mail, Eye, EyeOff, AlertCircle } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

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
  
  // Background states
  const [backgroundSettings, setBackgroundSettings] = useState(null);
  const [currentBgIndex, setCurrentBgIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();

  // Fetch background settings
  useEffect(() => {
    const fetchBackgrounds = async () => {
      try {
        const res = await axios.get(`${API}/login-backgrounds`);
        setBackgroundSettings(res.data);
      } catch (error) {
        console.log('Using default backgrounds');
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

    const result = await login(email, password);
    
    if (result.success) {
      navigate('/');
    } else {
      setError(result.error);
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
          {/* Logo */}
          <div 
            className={`mx-auto mb-4 w-24 h-24 bg-gradient-to-br from-primary to-yellow-600 rounded-2xl flex items-center justify-center shadow-2xl ${getLogoAnimation(backgroundSettings?.logo_animation || 'pulse')}`}
          >
            {backgroundSettings?.logo_url ? (
              <img 
                src={backgroundSettings.logo_url} 
                alt="Logo" 
                className="w-16 h-16 object-contain"
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
                  onChange={(e) => setEmail(e.target.value)}
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

            {/* Quick access to driver portal */}
            <div className="text-center pt-2">
              <a 
                href="/driver" 
                className="text-sm text-gray-400 hover:text-primary transition-colors"
              >
                بوابة السائقين
              </a>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Current background title */}
      {currentBg?.title && (
        <div className="absolute bottom-6 left-6 z-10">
          <p className="text-white/50 text-sm">{currentBg.title}</p>
        </div>
      )}
    </div>
  );
}
