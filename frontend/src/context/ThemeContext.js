import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext(null);

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved;
    return 'system';
  });

  const [resolvedTheme, setResolvedTheme] = useState('dark');

  useEffect(() => {
    const updateTheme = () => {
      let effectiveTheme = theme;
      
      if (theme === 'system') {
        // Auto switch based on time of day
        const hour = new Date().getHours();
        // Light mode from 6 AM to 6 PM
        effectiveTheme = (hour >= 6 && hour < 18) ? 'light' : 'dark';
      }
      
      // تحديث الحالة فقط عند التغير الفعلي لمنع إعادة التصيير غير الضرورية
      setResolvedTheme(prev => prev === effectiveTheme ? prev : effectiveTheme);
      
      const root = window.document.documentElement;
      if (!root.classList.contains(effectiveTheme)) {
        root.classList.remove('light', 'dark');
        root.classList.add(effectiveTheme);
      }
    };

    updateTheme();
    
    // Update every 5 minutes to handle day/night transition (was every minute - سبب محتمل في re-render المتكرر)
    const interval = setInterval(updateTheme, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [theme]);

  const setThemeValue = (newTheme) => {
    localStorage.setItem('theme', newTheme);
    setTheme(newTheme);
  };

  return (
    <ThemeContext.Provider value={{
      theme,
      resolvedTheme,
      setTheme: setThemeValue,
      isDark: resolvedTheme === 'dark'
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export default ThemeContext;
