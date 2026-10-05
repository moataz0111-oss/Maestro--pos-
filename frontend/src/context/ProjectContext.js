import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_URL } from '../utils/api';
import { useAuth } from './AuthContext';

const ProjectContext = createContext(null);

const API = API_URL;

// أدوار "مالك المؤسسة" - يشوفون كل المشاريع (يُستخدم للعرض فقط — بعد تفعيل المؤسسة)
const ENTERPRISE_WIDE_ROLES = ['super_admin', 'admin', 'general_manager', 'enterprise_owner'];
// 🔒 أدوار تتخطّى علامة tenant.enterprise_enabled (ترى إدارة المشاريع دائماً — فقط مالك النظام الأعلى)
//    admin/general_manager لتينانت customer يجب أن يحترموا الإعداد ولا يروا إدارة المشاريع.
const SYSTEM_OWNER_ROLES = ['super_admin', 'enterprise_owner'];

export const ProjectProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth();

  const [projects, setProjects] = useState(() => {
    try {
      const saved = localStorage.getItem('projects');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const [selectedProjectId, setSelectedProjectId] = useState(() => {
    return localStorage.getItem('selectedProjectId') || 'all';
  });

  const [loading, setLoading] = useState(false);
  const [enterpriseEnabled, setEnterpriseEnabled] = useState(false);

  const canSelectAllProjects = useCallback(() => {
    return ENTERPRISE_WIDE_ROLES.includes(user?.role);
  }, [user]);

  const fetchProjects = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      setLoading(true);

      // 1) اجلب إعدادات المؤسسة الخاصة بالمستأجر
      let entConfig = null;
      try {
        const cfg = await axios.get(`${API}/enterprise-config/me`);
        entConfig = cfg.data;
      } catch (_) { /* fallback */ }

      const enterpriseOn = entConfig?.enterprise_enabled === true || SYSTEM_OWNER_ROLES.includes(user?.role);

      if (!enterpriseOn) {
        // العميل لم يفعّل وضع المؤسسة — استخدم الوضع التقليدي
        setEnterpriseEnabled(false);
        setProjects([]);
        setSelectedProjectId('all');
        localStorage.removeItem('projects');
        localStorage.removeItem('selectedProjectId');
        return;
      }

      // 2) وضع المؤسسة مفعّل — اجلب المشاريع
      const res = await axios.get(`${API}/projects`);
      const data = res.data || [];
      setProjects(data);
      localStorage.setItem('projects', JSON.stringify(data));
      setEnterpriseEnabled(true);

      // مستخدم مقيد بمشروع → اختياره تلقائياً
      if (user?.project_id && !ENTERPRISE_WIDE_ROLES.includes(user?.role)) {
        setSelectedProjectId(user.project_id);
        localStorage.setItem('selectedProjectId', user.project_id);
      } else if (data.length === 1) {
        setSelectedProjectId(data[0].id);
        localStorage.setItem('selectedProjectId', data[0].id);
      }
    } catch (e) {
      console.log('Enterprise config unavailable:', e?.message);
      setEnterpriseEnabled(false);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (isAuthenticated && user) {
      fetchProjects();
    }
  }, [isAuthenticated, user, fetchProjects]);

  const selectProject = (projectId) => {
    // المستخدمون المقيدون بمشروع لا يمكنهم تغييره
    if (user?.project_id && !ENTERPRISE_WIDE_ROLES.includes(user?.role)) {
      return;
    }
    setSelectedProjectId(projectId);
    localStorage.setItem('selectedProjectId', projectId);
    // إعادة تعيين الفرع المختار عند تغيير المشروع
    localStorage.setItem('selectedBranchId', 'all');
    // إعادة تحميل الصفحة حالياً لضمان تحديث كل البيانات (يمكن تحسينه لاحقاً)
    window.dispatchEvent(new CustomEvent('project-changed', { detail: { projectId } }));
  };

  const getSelectedProject = () => {
    if (selectedProjectId === 'all') return null;
    return projects.find(p => p.id === selectedProjectId) || null;
  };

  const getSelectedProjectName = () => {
    if (selectedProjectId === 'all') return 'كل المشاريع';
    const p = getSelectedProject();
    return p?.name || 'كل المشاريع';
  };

  const getProjectIdForApi = () => {
    if (selectedProjectId === 'all') return null;
    return selectedProjectId;
  };

  return (
    <ProjectContext.Provider value={{
      projects,
      selectedProjectId,
      selectProject,
      getSelectedProject,
      getSelectedProjectName,
      getProjectIdForApi,
      canSelectAllProjects,
      loading,
      enterpriseEnabled,
      refreshProjects: fetchProjects,
    }}>
      {children}
    </ProjectContext.Provider>
  );
};

export const useProject = () => {
  const context = useContext(ProjectContext);
  if (!context) {
    // fallback آمن للصفحات القديمة قبل تفعيل المزود
    return {
      projects: [],
      selectedProjectId: 'all',
      selectProject: () => {},
      getSelectedProject: () => null,
      getSelectedProjectName: () => '',
      getProjectIdForApi: () => null,
      canSelectAllProjects: () => false,
      loading: false,
      enterpriseEnabled: false,
      refreshProjects: () => {},
    };
  }
  return context;
};

export default ProjectContext;
