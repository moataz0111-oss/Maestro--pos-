import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_URL } from '../utils/api';
import { useAuth } from './AuthContext';

const BranchContext = createContext(null);

const API = API_URL;

export const BranchProvider = ({ children }) => {
  const { user, isAuthenticated, hasRole } = useAuth();
  // تحميل الفروع من localStorage عند التهيئة (للعمل offline)
  const [branches, setBranches] = useState(() => {
    try {
      const savedBranches = localStorage.getItem('branches');
      if (savedBranches) {
        const parsed = JSON.parse(savedBranches);
        console.log('📦 Initialized branches from localStorage:', parsed.length);
        return parsed;
      }
    } catch (e) {
      console.log('Could not load branches from localStorage');
    }
    return [];
  });
  const [selectedBranchId, setSelectedBranchId] = useState(() => {
    const savedBranch = localStorage.getItem('selectedBranchId');
    return savedBranch || 'all';
  });
  const [loading, setLoading] = useState(() => {
    // لا نُظهر التحميل إذا كانت الفروع محملة من localStorage
    const savedBranches = localStorage.getItem('branches');
    if (savedBranches) {
      try {
        const parsed = JSON.parse(savedBranches);
        if (parsed.length > 0) return false;
      } catch (e) {}
    }
    return sessionStorage.getItem('branches_loaded') !== 'true';
  });
  const [pendingOrdersCounts, setPendingOrdersCounts] = useState({}); // عدد الطلبات المعلقة لكل فرع

  // جلب الفروع عند تسجيل الدخول
  useEffect(() => {
    if (isAuthenticated && user) {
      fetchBranches();
    }
  }, [isAuthenticated, user]);

  // حساب الطلبات المعلقة عند تحميل الفروع من localStorage (للعمل offline)
  useEffect(() => {
    if (branches.length > 0 && Object.keys(pendingOrdersCounts).length === 0) {
      // حساب الطلبات المعلقة فوراً
      fetchPendingOrdersCounts(branches);
    }
  }, [branches]);

  // جلب عدد الطلبات المعلقة لكل فرع
  const fetchPendingOrdersCounts = useCallback(async (branchesList) => {
    if (!branchesList || branchesList.length === 0) return;
    
    try {
      const counts = {};
      
      // إذا لم يكن هناك اتصال، احسب من الطلبات المحلية فقط
      if (!navigator.onLine) {
        try {
          const offlineStorage = await import('../lib/offlineStorage');
          // جلب جميع الطلبات المخزنة (ليس فقط اليوم)
          const localOrders = await offlineStorage.default.getAllCachedOrders();
          const unsyncedOrders = await offlineStorage.default.getUnsyncedOrders();
          
          // دمج الطلبات
          const allOrders = [...localOrders];
          for (const unsyncedOrder of unsyncedOrders) {
            if (!allOrders.find(o => o.id === unsyncedOrder.id || o.offline_id === unsyncedOrder.offline_id)) {
              allOrders.push(unsyncedOrder);
            }
          }
          
          console.log('📦 إجمالي الطلبات المحلية للحساب:', allOrders.length);
          
          branchesList.forEach(branch => {
            const branchOrders = allOrders.filter(o => {
              const branchMatch = String(o.branch_id) === String(branch.id);
              const statusMatch = ['pending', 'preparing', 'ready'].includes(o.status);
              return branchMatch && statusMatch;
            });
            counts[branch.id] = branchOrders.length;
            if (branchOrders.length > 0) {
              console.log(`📊 الفرع ${branch.name}: ${branchOrders.length} طلب معلق`);
            }
          });
          
          setPendingOrdersCounts(counts);
          console.log('📊 إجمالي الطلبات المعلقة:', counts);
        } catch (localError) {
          console.error('Failed to get local orders:', localError);
        }
        return;
      }
      
      // في وضع Online، جلب من الخادم + الطلبات المحلية غير المتزامنة
      const offlineStorage = await import('../lib/offlineStorage');
      let localUnsyncedOrders = [];
      try {
        localUnsyncedOrders = await offlineStorage.default.getUnsyncedOrders();
      } catch (e) {
        console.log('Could not get unsynced orders');
      }
      
      await Promise.all(branchesList.map(async (branch) => {
        try {
          const res = await axios.get(`${API}/orders`, {
            params: { 
              branch_id: branch.id, 
              status: 'pending,preparing,ready' 
            }
          });
          
          // عدد الطلبات من API
          let apiCount = res.data?.length || 0;
          
          // إضافة الطلبات المحلية غير المتزامنة لهذا الفرع
          const localBranchOrders = localUnsyncedOrders.filter(o => {
            const branchMatch = String(o.branch_id) === String(branch.id);
            const statusMatch = ['pending', 'preparing', 'ready'].includes(o.status);
            // تأكد من عدم احتساب طلب موجود في API مرتين
            const notInApi = !res.data?.some(apiOrder => 
              apiOrder.offline_id === o.offline_id || apiOrder.id === o.id
            );
            return branchMatch && statusMatch && notInApi;
          });
          
          counts[branch.id] = apiCount + localBranchOrders.length;
        } catch (e) {
          // في حالة فشل API، استخدم الطلبات المحلية فقط
          const localBranchOrders = localUnsyncedOrders.filter(o => {
            const branchMatch = String(o.branch_id) === String(branch.id);
            const statusMatch = ['pending', 'preparing', 'ready'].includes(o.status);
            return branchMatch && statusMatch;
          });
          counts[branch.id] = localBranchOrders.length;
        }
      }));
      
      setPendingOrdersCounts(counts);
    } catch (error) {
      console.error('Failed to fetch pending orders counts:', error);
    }
  }, []);

  const fetchBranches = async () => {
    try {
      // في وضع Offline، حاول تحميل الفروع من localStorage
      if (!navigator.onLine) {
        const savedBranches = localStorage.getItem('branches');
        if (savedBranches) {
          const branchesData = JSON.parse(savedBranches);
          setBranches(branchesData);
          console.log('📦 Loaded branches from localStorage (offline):', branchesData.length);
          
          // جلب عدد الطلبات المعلقة محلياً
          await fetchPendingOrdersCounts(branchesData);
        }
        setLoading(false);
        return;
      }
      
      // لا نعرض شاشة التحميل إذا كانت الفروع محملة مسبقاً
      const isFirstLoad = sessionStorage.getItem('branches_loaded') !== 'true';
      // لا نغير حالة التحميل أبداً بعد التحميل الأول
      
      const res = await axios.get(`${API}/branches`);
      const branchesData = res.data || [];
      setBranches(branchesData);
      
      // حفظ الفروع في localStorage للعمل offline
      localStorage.setItem('branches', JSON.stringify(branchesData));
      console.log('💾 Saved branches to localStorage:', branchesData.length);
      
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
      
      // في حالة فشل الاتصال، حاول تحميل الفروع من localStorage
      const savedBranches = localStorage.getItem('branches');
      if (savedBranches) {
        const branchesData = JSON.parse(savedBranches);
        setBranches(branchesData);
        console.log('📦 Loaded branches from localStorage (fallback):', branchesData.length);
      }
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

  // تحديث فوري لعدد الطلبات المعلقة لفرع معين
  const updatePendingCount = (branchId, delta) => {
    setPendingOrdersCounts(prev => {
      const newCounts = { ...prev };
      const currentCount = newCounts[branchId] || 0;
      newCounts[branchId] = Math.max(0, currentCount + delta);
      return newCounts;
    });
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
      refreshPendingCounts: () => fetchPendingOrdersCounts(branches),
      updatePendingCount
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
