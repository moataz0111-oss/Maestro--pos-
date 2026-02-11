import React, { createContext, useContext, useState, useEffect } from 'react';
import { getCurrentLanguage, setLanguage as setLang, t as translate } from '../utils/translations';

const LanguageContext = createContext();

export const LanguageProvider = ({ children }) => {
  const [language, setLanguageState] = useState(getCurrentLanguage());
  
  // تحديث اللغة
  const setLanguage = (lang) => {
    setLang(lang);
    setLanguageState(lang);
    // إعادة تحميل الصفحة لتطبيق التغييرات
    window.location.reload();
  };
  
  // تطبيق الاتجاه عند التحميل
  useEffect(() => {
    const isRTL = ['ar', 'ku', 'fa', 'he'].includes(language);
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language]);
  
  return (
    <LanguageContext.Provider value={{ language, setLanguage, t: translate }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    return { language: 'ar', setLanguage: () => {}, t: translate };
  }
  return context;
};

export default LanguageContext;
