import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../utils/api';
import { useAuth } from './AuthContext';

const BranchContext = createContext(null);

const API = API_URL;

export const BranchProvider = ({ children }) => {
  const { user, isAuthenticated, hasRole } = useAuth();
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState('all');
  const [loading, setLoading] = useState(true);

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

  const fetchBranches = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API}/branches`);
      setBranches(res.data || []);
      
      // إذا كان المستخدم مرتبط بفرع معين، حدد فرعه تلقائياً
      if (user?.branch_id && !hasRole(['admin', 'super_admin', 'manager'])) {
        setSelectedBranchId(user.branch_id);
        localStorage.setItem('selectedBranchId', user.branch_id);
      }
    } catch (error) {
      console.error('Failed to fetch branches:', error);
    } finally {
      setLoading(false);
    }
  };

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
      refreshBranches: fetchBranches
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
