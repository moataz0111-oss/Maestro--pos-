import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

// التحقق من وجود REACT_APP_BACKEND_URL
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
if (!BACKEND_URL) {
  console.error('⚠️ REACT_APP_BACKEND_URL is not defined!');
}
const API = `${BACKEND_URL || ''}/api`;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const [currentShift, setCurrentShift] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [token]);

  const fetchUser = async () => {
    try {
      const response = await axios.get(`${API}/auth/me`);
      setUser(response.data);
      setError(null);
      
      // فتح وردية تلقائياً للكاشير أو المدير
      if (['cashier', 'manager', 'admin'].includes(response.data.role)) {
        await autoOpenShift();
      }
    } catch (error) {
      console.error('Failed to fetch user:', error);
      // لا نقوم بـ logout إذا كان الخطأ من الشبكة
      if (error.response?.status === 401 || error.response?.status === 403) {
        logout();
      } else {
        setError('فشل في الاتصال بالخادم');
      }
    } finally {
      setLoading(false);
    }
  };

  // فتح وردية تلقائياً
  const autoOpenShift = async () => {
    try {
      const response = await axios.post(`${API}/shifts/auto-open`);
      setCurrentShift(response.data.shift);
      
      if (!response.data.was_existing) {
        console.log('✅ تم فتح وردية جديدة تلقائياً');
      }
    } catch (error) {
      console.error('Failed to auto-open shift:', error);
    }
  };

  const login = async (email, password) => {
    try {
      const response = await axios.post(`${API}/auth/login`, { email, password });
      const { user: userData, token: newToken } = response.data;
      
      localStorage.setItem('token', newToken);
      axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
      setToken(newToken);
      setUser(userData);
      
      // فتح وردية تلقائياً للكاشير أو المدير
      if (['cashier', 'manager', 'admin'].includes(userData.role)) {
        setTimeout(async () => {
          await autoOpenShift();
        }, 500);
      }
      
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.detail || 'فشل تسجيل الدخول' 
      };
    }
  };

  const register = async (userData) => {
    try {
      const response = await axios.post(`${API}/auth/register`, userData);
      const { user: newUser, token: newToken } = response.data;
      
      localStorage.setItem('token', newToken);
      axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
      setToken(newToken);
      setUser(newUser);
      
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.detail || 'فشل التسجيل' 
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    setToken(null);
    setUser(null);
    setCurrentShift(null);
  };

  const hasPermission = (permission) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (user.permissions?.includes('all')) return true;
    return user.permissions?.includes(permission);
  };

  const hasRole = (roles) => {
    if (!user) return false;
    if (typeof roles === 'string') return user.role === roles;
    return roles.includes(user.role);
  };

  // تحديث الوردية الحالية
  const refreshShift = async () => {
    try {
      const response = await axios.get(`${API}/shifts/current`);
      setCurrentShift(response.data);
      return response.data;
    } catch (error) {
      console.error('Failed to refresh shift:', error);
      return null;
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      token,
      loading,
      login,
      register,
      logout,
      hasPermission,
      hasRole,
      isAuthenticated: !!user,
      currentShift,
      refreshShift,
      autoOpenShift
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
