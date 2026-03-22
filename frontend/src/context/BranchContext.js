import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_URL } from '../utils/api';
import { useAuth } from './AuthContext';

const BranchContext = createContext(null);

const API = API_URL;

export const BranchProvider = ({ children }) => {
  const { user, isAuthenticated, hasRole } = useAuth();
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState('all');
  const [loading, setLoading] = useState(() => {
    // تحقق إذا تم تحميل الفروع من قبل
    return sessionStorage.getItem('branches_loaded') !== 'true';
  });
  const [pendingOrdersCounts, setPendingOrdersCounts] = useState({}); // عدد الطلبات المعلقة لكل فرع

  // جلب الفروع عند تسجيل الدخول
  useEffect(() => {
    if (isAuthenticated && user) {
      fetchBranches();
    }
  }, [isAuthenticated, user]);

  // استعادة الفرع المحدد من localStorage
  useEffect(() => {
    const savedBranch = localStorage.getItem('selectedBranchId');
    if (savedBranch) {
      setSelectedBranchId(savedBranch);
    }
  }, []);

  // جلب عدد الطلبات المعلقة لكل فرع
  const fetchPendingOrdersCounts = useCallback(async (branchesList) => {
    if (!branchesList || branchesList.length === 0) return;
    
    try {
      const counts = {};
      
      // دائماً احسب من الطلبات المحلية أولاً
      let localCounts = {};
      try {
        const offlineStorage = await import('../lib/offlineStorage');
        const localOrders = await offlineStorage.getTodayOrders();
        
        console.log('📊 Local orders for counting:', localOrders.length);
        
        branchesList.forEach(branch => {
          const branchOrders = localOrders.filter(o => {
            const branchMatch = String(o.branch_id) === String(branch.id);
            const statusMatch = ['pending', 'preparing', 'ready'].includes(o.status);
            return branchMatch && statusMatch;
          });
          localCounts[branch.id] = branchOrders.length;
        });
        
        console.log('📊 Local pending counts:', localCounts);
      } catch (localError) {
        console.error('Failed to get local orders:', localError);
      }
      
      // إذا لم يكن هناك اتصال، استخدم الأعداد المحلية فقط
      if (!navigator.onLine) {
        setPendingOrdersCounts(localCounts);
        return;
      }
      
      // جلب عدد الطلبات المعلقة لكل فرع من الخادم
      try {
        await Promise.all(branchesList.map(async (branch) => {
          try {
            const res = await axios.get(`${API}/orders`, {
              params: { 
                branch_id: branch.id, 
                status: 'pending,preparing,ready' 
              }
            });
            counts[branch.id] = res.data?.length || 0;
          } catch (e) {
            // في حالة فشل الـ API، استخدم العدد المحلي
            counts[branch.id] = localCounts[branch.id] || 0;
          }
        }));
        
        // دمج مع الطلبات المحلية غير المتزامنة
        branchesList.forEach(branch => {
          const localCount = localCounts[branch.id] || 0;
          const serverCount = counts[branch.id] || 0;
          // اختر الأكبر (لأن الطلبات المحلية قد لا تكون متزامنة بعد)
          counts[branch.id] = Math.max(localCount, serverCount);
        });
        
        setPendingOrdersCounts(counts);
      } catch (error) {
        // في حالة فشل الاتصال، استخدم الأعداد المحلية
        setPendingOrdersCounts(localCounts);
      }
    } catch (error) {
      console.error('Failed to fetch pending orders counts:', error);
    }
  }, []);

  const fetchBranches = async () => {
    try {
      // لا نعرض شاشة التحميل إذا كانت الفروع محملة مسبقاً
      const isFirstLoad = sessionStorage.getItem('branches_loaded') !== 'true';
      // لا نغير حالة التحميل أبداً بعد التحميل الأول
      
      const res = await axios.get(`${API}/branches`);
      const branchesData = res.data || [];
      setBranches(branchesData);
      
      // جلب عدد الطلبات المعلقة لكل فرع
      await fetchPendingOrdersCounts(branchesData);
      
      // إذا كان المستخدم مرتبط بفرع معين، حدد فرعه تلقائياً
      if (user?.branch_id && !hasRole(['admin', 'super_admin', 'manager'])) {
        setSelectedBranchId(user.branch_id);
        localStorage.setItem('selectedBranchId', user.branch_id);
      }
      
      // تسجيل أن الفروع تم تحميلها
      sessionStorage.setItem('branches_loaded', 'true');
    } catch (error) {
      console.error('Failed to fetch branches:', error);
    } finally {
      setLoading(false);
    }
  };

  // تحديث عدد الطلبات المعلقة كل 30 ثانية
  useEffect(() => {
    if (branches.length > 0) {
      const interval = setInterval(() => {
        fetchPendingOrdersCounts(branches);
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [branches, fetchPendingOrdersCounts]);

  // تغيير الفرع المحدد
  const selectBranch = (branchId) => {
    // الموظفون المقيدون بفرع لا يمكنهم تغيير الفرع
    if (user?.branch_id && !hasRole(['admin', 'super_admin', 'manager'])) {
      return;
    }
    
    setSelectedBranchId(branchId);
    localStorage.setItem('selectedBranchId', branchId);
  };

  // الحصول على اسم الفرع الحالي
  const getSelectedBranchName = () => {
    if (selectedBranchId === 'all') return 'جميع الفروع';
    const branch = branches.find(b => b.id === selectedBranchId);
    return branch?.name || 'جميع الفروع';
  };

  // التحقق مما إذا كان المستخدم يمكنه اختيار "جميع الفروع"
  const canSelectAllBranches = () => {
    return hasRole(['admin', 'super_admin', 'manager']);
  };

  // الحصول على معرف الفرع لاستخدامه في الـ API
  // إذا كان "all" يرجع null، وإلا يرجع معرف الفرع
  const getBranchIdForApi = () => {
    if (selectedBranchId === 'all') return null;
    return selectedBranchId;
  };

  return (
    <BranchContext.Provider value={{
      branches,
      selectedBranchId,
      selectBranch,
      getSelectedBranchName,
      canSelectAllBranches,
      getBranchIdForApi,
      loading,
      refreshBranches: fetchBranches,
      pendingOrdersCounts,
      refreshPendingCounts: () => fetchPendingOrdersCounts(branches)
    }}>
      {children}
    </BranchContext.Provider>
  );
};

export const useBranch = () => {
  const context = useContext(BranchContext);
  if (!context) {
    throw new Error('useBranch must be used within a BranchProvider');
  }
  return context;
};

export default BranchContext;
