import React, { useState, useEffect } from 'react';
import { API_URL } from '../utils/api';
import { useTranslation } from '../hooks/useTranslation';
import { useLanguage } from '../context/LanguageContext';
import { Phone, Mail, MessageCircle, Globe, Languages, Info, X } from 'lucide-react';
import axios from 'axios';

const API = API_URL;

// شعار النظام الرسمي (السداسي الذهبي)
const MaestroLogo = ({ size = 80 }) => (
  <svg width={size} height={size} viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"
    style={{ filter: 'drop-shadow(0 0 14px rgba(246,166,35,.5))' }}>
    <defs>
      <linearGradient id="mg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ffe7a0" /><stop offset="50%" stopColor="#ffd166" /><stop offset="100%" stopColor="#f59e0b" />
      </linearGradient>
      <radialGradient id="md" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#1a1a2e" /><stop offset="70%" stopColor="#0f0f1e" /><stop offset="100%" stopColor="#000000" />
      </radialGradient>
    </defs>
    <circle cx="100" cy="100" r="86" fill="url(#md)" />
    <circle cx="100" cy="100" r="86" stroke="url(#mg)" strokeWidth="2" fill="none" opacity="0.7" />
    <circle cx="100" cy="100" r="94" stroke="url(#mg)" strokeWidth="3" fill="none" strokeDasharray="40 200" strokeLinecap="round" />
    <polygon points="100,30 158,62 158,138 100,170 42,138 42,62" fill="none" stroke="url(#mg)" strokeWidth="3.5" />
    <path d="M55 142 V70 L100 120 L145 70 V142" fill="none" stroke="url(#mg)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="100" cy="100" r="4" fill="url(#mg)" />
  </svg>
);

// زر أيقونة دائري
const IconButton = ({ icon: Icon, label, color, onClick, testId }) => (
  <button data-testid={testId} onClick={onClick}
    className="flex flex-col items-center gap-2 w-[62px] sm:w-[76px] group">
    <span className="w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center transition-transform group-hover:scale-110 group-active:scale-95"
      style={{
        border: '2px solid rgba(246,166,35,.55)',
        background: 'linear-gradient(160deg,#0e1d44,#0a1330)',
        boxShadow: '0 8px 20px rgba(0,0,0,.4), inset 0 0 14px rgba(246,166,35,.08)'
      }}>
      <Icon className="w-6 h-6 sm:w-7 sm:h-7" style={{ color }} />
    </span>
    <span className="text-[12px] sm:text-[13px] font-bold text-[#cfd6ea] text-center leading-tight">{label}</span>
  </button>
);

export default function SystemContact() {
  const { t, isRTL } = useTranslation();
  const { language, setLanguage } = useLanguage();
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [showIntro, setShowIntro] = useState(false);

  useEffect(() => { fetchSettings(); }, []);

  const fetchSettings = async () => {
    try {
      const res = await axios.get(`${API}/system/invoice-settings`);
      setSettings(res.data || {});
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleLanguage = () => {
    const languages = ['ar', 'en', 'ku'];
    const nextIndex = (languages.indexOf(language) + 1) % languages.length;
    setLanguage(languages[nextIndex]);
  };

  const getLanguageName = () => ({ ar: 'العربية', en: 'English', ku: 'کوردی' }[language] || 'العربية');

  const handleCall = (phone) => { window.location.href = `tel:${phone}`; };
  const handleWhatsApp = (phone) => {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const fullPhone = cleanPhone.startsWith('964') ? cleanPhone
      : cleanPhone.startsWith('0') ? `964${cleanPhone.slice(1)}` : `964${cleanPhone}`;
    window.open(`https://wa.me/${fullPhone}`, '_blank');
  };
  const handleEmail = (email) => {
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(t('استفسار عن نظام Maestro EGP'))}`;
  };
  const handleWebsite = (url) => {
    if (url) window.open(url.startsWith('http') ? url : `https://${url}`, '_blank');
  };

  const bg = { background: 'radial-gradient(120% 70% at 50% 0%, #1e3a78 0%, #0c1738 45%, #050A24 100%)' };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={bg}>
        <div className="w-12 h-12 border-4 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const systemName = settings.system_name || 'Maestro EGP';
  const phone1 = settings.system_phone;
  const phone2 = settings.system_phone2;
  const email = settings.system_email;
  const website = settings.system_website;
  const tagline = t(settings.promo_text || 'نظام محاسبي وإداري متكامل للمؤسسات والمطاعم والمشاريع التجارية الكبرى');
  const ctaText = t(settings.cta_text || 'للحصول على نسختك تواصل معنا');
  // وصف تمهيدي يظهر في تعريف النظام قبل رسالة المؤسس
  const introLead = t(settings.system_intro || 'منصة شاملة ذكية ومتطورة تدير العمليات، والمخزون، والتصنيع، والمشتريات، والتوصيل، والموارد البشرية والمالية في نظام واحد دقيق يعمل حتى بدون إنترنت.');

  // رسالة المؤسس (نفس نص ملف التعريف)
  const founderMessage = [
    'بدأت فكرة Maestro EGP من إيمانٍ عميق بأن الإدارة الناجحة تقوم على الدقة والوضوح والقرار السليم في الوقت المناسب. ومن هذا المبدأ وُلد هذا النظام ليكون رفيقاً ذكياً ومتطوراً لكل صاحب مؤسسةٍ يسعى للنمو دون أن يُثقله تعقيد الأنظمة أو كثرة التفاصيل.',
    'حرصتُ على أن يجمع النظام بين البساطة في الاستخدام والعمق في التحليل، ليخدم أصحاب المؤسسات والمشاريع والشركات في إدارةٍ متطورةٍ وذكيةٍ ودقيقة، تُقلّل الحاجة إلى توظيف كوادر كبيرة، وتمنح صاحب القرار رؤيةً شاملةً تحت سيطرته الكاملة.',
    'وقد أُنجز هذا النظام على أيدي مختصين محترفين عالميين في مجال البرمجيات من أوروبا وشركاتٍ عالمية متطوّرة في الأنظمة، عبر فكرةٍ ذكية ومتطوّرة وعملٍ دؤوب تجاوز العامين من الجهد والتعب، ليتفوّق على أنظمةٍ رصينةٍ كبيرةٍ وعريقة في هذا المجال، ويمنح المشاريع إدارةً بأقل التكاليف الإدارية ويحدّ من الحاجة إلى الكوادر الإدارية الكبيرة — ليكون الأول في الشرق الأوسط والعالم.',
    'أتقدّم بخالص الشكر والتقدير لكل من وثق بهذا النظام واهتمّ به، ولكل من ساهم في تطويره ووصوله إلى هذه المرحلة. هذا الجهد مُهدًى لكل صاحب طموحٍ يؤمن بأن الإدارة الذكية المتطوّرة هي طريق النجاح.',
  ];

  return (
    <div className="min-h-screen relative text-white overflow-hidden" style={bg} dir={isRTL ? 'rtl' : 'ltr'} data-testid="system-contact-page">
      {/* إطار ذهبي */}
      <div className="pointer-events-none fixed inset-3 rounded-[22px]" style={{ border: '1px solid rgba(246,166,35,.35)' }}></div>

      {/* زر تغيير اللغة */}
      <button data-testid="contact-language-toggle" onClick={toggleLanguage}
        className="absolute top-5 left-5 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-bold text-[#f6d488]"
        style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(246,166,35,.4)' }}>
        <Languages className="h-4 w-4" />{getLanguageName()}
      </button>

      <div className="max-w-md mx-auto px-6 pt-16 pb-10 relative z-[1]">
        {/* الرأس */}
        <div className="text-center">
          <div className="w-[104px] h-[104px] mx-auto mb-3 rounded-full flex items-center justify-center p-2.5"
            style={{ background: 'radial-gradient(circle,rgba(246,166,35,.18),transparent 70%)', border: '1.5px solid rgba(246,166,35,.5)' }}>
            <MaestroLogo size={80} />
          </div>
          <h1 className="text-3xl font-extrabold" style={{ direction: 'ltr' }} data-testid="contact-system-name">{systemName}</h1>
          <div className="w-20 h-[3px] mx-auto my-3" style={{ background: 'linear-gradient(90deg,transparent,#f6a623,transparent)' }}></div>
          <p className="text-sm text-[#c3cae0] leading-relaxed px-2" data-testid="contact-tagline">{tagline}</p>
        </div>

        {/* الدعوة */}
        <p className="text-center text-lg font-extrabold mt-5 mb-6" data-testid="contact-cta">{ctaText}</p>

        {/* أزرار أيقونات دائرية */}
        <div className="flex flex-wrap justify-center gap-2 sm:gap-4" data-testid="contact-icons">
          {phone1 && <IconButton testId="contact-call-btn" icon={Phone} label={t('اتصال')} color="#34d399" onClick={() => handleCall(phone1)} />}
          {phone1 && <IconButton testId="contact-whatsapp-btn" icon={MessageCircle} label={t('واتساب')} color="#34d399" onClick={() => handleWhatsApp(phone1)} />}
          {phone2 && <IconButton testId="contact-whatsapp2-btn" icon={MessageCircle} label={t('واتساب') + ' 2'} color="#22d3ee" onClick={() => handleWhatsApp(phone2)} />}
          {email && <IconButton testId="contact-email-btn" icon={Mail} label={t('بريد')} color="#f87171" onClick={() => handleEmail(email)} />}
          {website && <IconButton testId="contact-website-btn" icon={Globe} label={t('الموقع')} color="#c084fc" onClick={() => handleWebsite(website)} />}
        </div>

        {/* زر تعريف النظام */}
        <button data-testid="contact-intro-btn" onClick={() => setShowIntro(true)}
          className="mt-8 w-full h-[58px] rounded-full flex items-center justify-center gap-2.5 text-[17px] font-extrabold text-[#08122e] transition-transform active:scale-95"
          style={{ background: 'linear-gradient(160deg,#ffe08a,#f6a623)', boxShadow: '0 10px 26px rgba(246,166,35,.35)' }}>
          <Info className="w-6 h-6" /> {t('تعريف النظام')}
        </button>

        {/* التذييل */}
        <div className="text-center mt-10 text-xs text-[#8a93ad] leading-relaxed">
          <p>© {new Date().getFullYear()} <span className="text-[#f6a623] font-bold">{systemName}</span></p>
          <p className="mt-1">{t('جميع الحقوق محفوظة')}</p>
        </div>
      </div>

      {/* نافذة تعريف النظام — رسالة المؤسس */}
      {showIntro && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(2,5,15,.82)' }}
          onClick={() => setShowIntro(false)} data-testid="contact-intro-modal">
          <div className="w-full max-w-md rounded-[20px] relative max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}
            style={{ background: 'linear-gradient(160deg,#0c1a3d,#0a1430)', border: '1px solid rgba(246,166,35,.4)', boxShadow: '0 20px 50px rgba(0,0,0,.6)' }}>
            <button data-testid="contact-intro-close-x" onClick={() => setShowIntro(false)}
              className="sticky top-3 float-left ml-3 text-[#9fb0d4] hover:text-white z-10"><X className="w-5 h-5" /></button>
            <div className="p-6 pt-4">
              <div className="flex justify-center mb-2"><MaestroLogo size={58} /></div>
              <h2 className="text-center text-xl font-extrabold" style={{ direction: 'ltr' }}>{systemName}</h2>
              <p className="text-center text-sm text-[#f6d488] mb-3">{tagline}</p>
              <div className="w-16 h-[3px] mx-auto mb-4" style={{ background: 'linear-gradient(90deg,transparent,#f6a623,transparent)' }}></div>

              {/* رسالة المؤسس */}
              <div className="space-y-3" data-testid="contact-intro-text">
                <p className="text-[14px] leading-[2.1] text-[#f6d488] text-justify font-semibold">{introLead}</p>
                {founderMessage.map((para, i) => (
                  <p key={i} className="text-[13.5px] leading-[2.1] text-[#d7def2] text-justify">{t(para)}</p>
                ))}
              </div>

              {/* بطاقة المؤسس */}
              <div className="mt-5 rounded-2xl p-5 text-center" style={{ background: 'linear-gradient(160deg,#0a1330,#152a59)', border: '1px solid rgba(246,166,35,.3)' }}>
                <div className="flex justify-center mb-2"><MaestroLogo size={50} /></div>
                <div className="text-lg font-extrabold" style={{ direction: 'ltr' }}>Moataz <span className="text-[#f6a623]">Mehana</span></div>
                <div className="text-base font-bold text-[#f6a623] mt-0.5">معتز مهنا</div>
                <div className="text-[11.5px] text-[#aeb6cc] mt-1">مؤسس ومطوّر نظام Maestro EGP — System Owner &amp; Developer</div>
              </div>

              <button data-testid="contact-intro-close-btn" onClick={() => setShowIntro(false)}
                className="mt-5 w-full h-[46px] rounded-full font-extrabold text-[15px] text-[#f6a623]"
                style={{ border: '1px solid rgba(246,166,35,.5)', background: 'transparent' }}>{t('إغلاق')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
