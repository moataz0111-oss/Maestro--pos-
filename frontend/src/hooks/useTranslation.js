// Hook للترجمة - يترجم أي نص عربي تلقائياً
import { useCallback, useEffect, useState, useMemo } from 'react';
import translationMap from '../utils/autoTranslate';

// الحصول على اللغة الحالية
const getCurrentLang = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('app_language') || 'ar';
  }
  return 'ar';
};

// Hook للترجمة
export const useTranslation = () => {
  const [lang, setLang] = useState(getCurrentLang);

  // تحديث الاتجاه
  useEffect(() => {
    const isRTL = ['ar', 'ku', 'fa', 'he'].includes(lang);
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  // الاستماع لتغييرات localStorage
  useEffect(() => {
    const handleStorage = () => {
      const newLang = getCurrentLang();
      if (newLang !== lang) {
        setLang(newLang);
      }
    };
    
    window.addEventListener('storage', handleStorage);
    const interval = setInterval(handleStorage, 500); // تحقق كل نصف ثانية
    
    return () => {
      window.removeEventListener('storage', handleStorage);
      clearInterval(interval);
    };
  }, [lang]);

  // دالة الترجمة
  const t = useCallback((text) => {
    if (!text || typeof text !== 'string') return text;
    if (lang === 'ar') return text;
    
    // بحث في القاموس
    const trimmed = text.trim();
    if (translationMap[trimmed]) {
      return translationMap[trimmed][lang] || text;
    }
    if (translationMap[text]) {
      return translationMap[text][lang] || text;
    }
    
    return text;
  }, [lang]);

  // تغيير اللغة
  const changeLanguage = useCallback((newLang) => {
    localStorage.setItem('app_language', newLang);
    setLang(newLang);
    const isRTL = ['ar', 'ku', 'fa', 'he'].includes(newLang);
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    document.documentElement.lang = newLang;
    window.location.reload();
  }, []);

  const isRTL = useMemo(() => ['ar', 'ku', 'fa', 'he'].includes(lang), [lang]);

  return { t, lang, changeLanguage, isRTL };
};

// دالة ترجمة مباشرة (للاستخدام خارج React)
export const t = (text) => {
  if (!text || typeof text !== 'string') return text;
  const lang = getCurrentLang();
  if (lang === 'ar') return text;
  
  const trimmed = text.trim();
  if (translationMap[trimmed]) {
    return translationMap[trimmed][lang] || text;
  }
  if (translationMap[text]) {
    return translationMap[text][lang] || text;
  }
  
  return text;
};

export default useTranslation;
