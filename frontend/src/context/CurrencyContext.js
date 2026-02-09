// Currency Context - إدارة العملة في كل النظام
import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { setCurrency as setLocalCurrency, refreshCurrencyCache, CURRENCIES } from '../utils/currency';

// إعادة تصدير CURRENCIES للتوافق مع الاستيرادات القديمة
export { CURRENCIES };

// اللغات المدعومة
export const LANGUAGES = {
  ar: { code: 'ar', name: 'العربية', dir: 'rtl' },
  en: { code: 'en', name: 'English', dir: 'ltr' },
  ku: { code: 'ku', name: 'کوردی', dir: 'rtl' },
};

// البلدان المدعومة
export const COUNTRIES = {
  IQ: { code: 'IQ', name: 'العراق', currency: 'IQD', language: 'ar' },
  SA: { code: 'SA', name: 'السعودية', currency: 'SAR', language: 'ar' },
  AE: { code: 'AE', name: 'الإمارات', currency: 'AED', language: 'ar' },
  EG: { code: 'EG', name: 'مصر', currency: 'EGP', language: 'ar' },
  JO: { code: 'JO', name: 'الأردن', currency: 'JOD', language: 'ar' },
  KW: { code: 'KW', name: 'الكويت', currency: 'KWD', language: 'ar' },
  US: { code: 'US', name: 'أمريكا', currency: 'USD', language: 'en' },
};

const CurrencyContext = createContext();

export const useCurrency = () => {
  const context = useContext(CurrencyContext);
  if (!context) {
    // إرجاع قيم افتراضية إذا لم يكن السياق متاحاً
    return {
      currency: CURRENCIES.IQD,
      language: LANGUAGES.ar,
      country: COUNTRIES.IQ,
      formatPrice: (amount) => `${amount} د.ع`,
      formatPriceCompact: (amount) => `${amount} د.ع`,
      convertCurrency: (amount) => amount,
    };
  }
  return context;
};

export const CurrencyProvider = ({ children }) => {
  // محاولة قراءة العملة المحفوظة مسبقاً
  const savedCurrency = localStorage.getItem('app_currency') || 'IQD';
  
  const [settings, setSettings] = useState({
    currency: savedCurrency,
    language: localStorage.getItem('app_language') || 'ar',
    country: localStorage.getItem('app_country') || 'IQ',
    showSecondary: false,
    secondaryCurrency: 'USD',
  });
  const [loading, setLoading] = useState(true);

  // دالة لجلب الإعدادات من الخادم
  const fetchSettings = async () => {
    try {
      const token = localStorage.getItem('token');
      if (token) {
        const API = process.env.REACT_APP_BACKEND_URL || '';
        const res = await axios.get(`${API}/api/tenant/regional-settings`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.data) {
          const newCurrency = res.data.currency || 'IQD';
          setSettings(prev => ({
            ...prev,
            currency: newCurrency,
            language: res.data.language || 'ar',
            country: res.data.country || 'IQ',
            showSecondary: res.data.show_secondary_currency || false,
            secondaryCurrency: res.data.secondary_currency || 'USD',
          }));
          // تحديث localStorage و cache في currency.js
          setLocalCurrency(newCurrency);
          localStorage.setItem('app_language', res.data.language || 'ar');
          localStorage.setItem('app_country', res.data.country || 'IQ');
        }
      }
    } catch (error) {
      console.log('Using default currency settings');
    } finally {
      setLoading(false);
    }
  };

  // جلب إعدادات النظام عند التحميل
  useEffect(() => {
    fetchSettings();
  }, []);

  // الاستماع لتغييرات تسجيل الدخول (عند تغيير token)
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'token' && e.newValue) {
        // تم تسجيل دخول جديد - أعد جلب الإعدادات
        setTimeout(fetchSettings, 500);
      }
    };

    // الاستماع لحدث تسجيل الدخول المخصص
    const handleLogin = () => {
      setTimeout(fetchSettings, 500);
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('userLoggedIn', handleLogin);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('userLoggedIn', handleLogin);
    };
  }, []);

  // الحصول على معلومات العملة الحالية
  const currency = CURRENCIES[settings.currency] || CURRENCIES.IQD;
  const language = LANGUAGES[settings.language] || LANGUAGES.ar;
  const country = COUNTRIES[settings.country] || COUNTRIES.IQ;

  // تنسيق السعر بالعملة الحالية
  const formatPrice = (amount, showSymbol = true) => {
    if (amount === null || amount === undefined || isNaN(amount)) return showSymbol ? `0 ${currency.symbol}` : '0';
    
    const formatted = new Intl.NumberFormat(language.code === 'ar' ? 'ar-IQ' : 'en-US', {
      minimumFractionDigits: currency.decimals,
      maximumFractionDigits: currency.decimals,
    }).format(amount);
    
    return showSymbol ? `${formatted} ${currency.symbol}` : formatted;
  };

  // تنسيق مختصر للأرقام الكبيرة
  const formatPriceCompact = (amount) => {
    if (amount >= 1000000) {
      return `${(amount / 1000000).toFixed(1)}M ${currency.symbol}`;
    }
    if (amount >= 1000) {
      return `${(amount / 1000).toFixed(0)}K ${currency.symbol}`;
    }
    return formatPrice(amount);
  };

  // تحويل بين العملات
  const convertCurrency = (amount, from = 'IQD', to = settings.currency) => {
    const fromCurrency = CURRENCIES[from];
    const toCurrency = CURRENCIES[to];
    
    if (!fromCurrency || !toCurrency) return amount;
    
    // تحويل إلى IQD أولاً ثم إلى العملة المطلوبة
    const inIQD = amount * fromCurrency.rate;
    return inIQD / toCurrency.rate;
  };

  // عرض السعر بالعملة الثانوية
  const formatPriceWithSecondary = (amount) => {
    const primary = formatPrice(amount);
    if (settings.showSecondary && settings.secondaryCurrency !== settings.currency) {
      const secondary = CURRENCIES[settings.secondaryCurrency];
      const converted = convertCurrency(amount, settings.currency, settings.secondaryCurrency);
      const secondaryFormatted = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: secondary.decimals,
        maximumFractionDigits: secondary.decimals,
      }).format(converted);
      return `${primary} (${secondaryFormatted} ${secondary.symbol})`;
    }
    return primary;
  };

  // تحديث الإعدادات
  const updateSettings = async (newSettings) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
    
    // تحديث العملة في localStorage و currency.js
    if (newSettings.currency) {
      setLocalCurrency(newSettings.currency);
    }
    
    // حفظ في الخادم
    try {
      const token = localStorage.getItem('token');
      if (token) {
        const API = process.env.REACT_APP_BACKEND_URL || '';
        await axios.put(`${API}/api/tenant/regional-settings`, newSettings, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  const value = {
    currency,
    language,
    country,
    settings,
    loading,
    formatPrice,
    formatPriceCompact,
    formatPriceWithSecondary,
    convertCurrency,
    updateSettings,
    CURRENCIES,
    LANGUAGES,
    COUNTRIES,
  };

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
};

export default CurrencyContext;
