import React from 'react';
import { useBranch } from '../context/BranchContext';
import { useProject } from '../context/ProjectContext';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from './ui/select';
import { Building2, Briefcase } from 'lucide-react';

export default function BranchSelector({ className = '', showLabel = false, showPendingCount = true }) {
  const { user, hasRole } = useAuth();
  const { t } = useTranslation();
  const {
    projects,
    selectedProjectId,
    selectProject,
    canSelectAllProjects,
    enterpriseEnabled,
  } = useProject();
  const { 
    branches, 
    selectedBranchId, 
    selectBranch, 
    canSelectAllBranches,
    loading,
    pendingOrdersCounts
  } = useBranch();

  // الموظفون المقيدون بفرع لا يمكنهم تغيير الفرع
  const isRestricted = user?.branch_id && !hasRole(['admin', 'general_manager', 'super_admin', 'manager']);
  const isProjectRestricted = user?.project_id &&
    !hasRole(['admin', 'general_manager', 'super_admin', 'enterprise_owner']);

  // إظهار حالة التحميل
  if (loading) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="w-[180px] h-9 bg-card/50 border border-border/50 rounded-md animate-pulse flex items-center justify-center">
          <span className="text-xs text-muted-foreground">{t('جاري التحميل...')}</span>
        </div>
      </div>
    );
  }

  // حساب إجمالي الطلبات المعلقة لجميع الفروع
  const totalPendingOrders = Object.values(pendingOrdersCounts).reduce((sum, count) => sum + count, 0);

  // ═══ Enterprise Mode: منسدلة المشاريع الهرمية ═══
  const showProjectSelector = enterpriseEnabled && projects && projects.length > 1;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {showLabel && (
        <Building2 className="h-4 w-4 text-muted-foreground" />
      )}
      {showProjectSelector && (
        <Select
          value={selectedProjectId}
          onValueChange={selectProject}
          disabled={isProjectRestricted}
        >
          <SelectTrigger
            className="w-[170px] h-9 bg-gradient-to-r from-primary/10 to-primary/5 border-primary/30 text-sm"
            data-testid="project-selector"
          >
            <div className="flex items-center gap-1.5">
              <Briefcase className="h-3.5 w-3.5 text-primary" />
              <SelectValue placeholder={t('اختر المشروع')} />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel className="text-xs text-muted-foreground">
                {t('المشاريع')}
              </SelectLabel>
              {canSelectAllProjects() && (
                <SelectItem value="all" data-testid="project-option-all">
                  <div className="flex items-center gap-2">
                    <Briefcase className="h-3.5 w-3.5" />
                    <span className="font-medium">{t('كل المشاريع')}</span>
                  </div>
                </SelectItem>
              )}
              {projects.filter(p => p.is_active !== false).map(p => (
                <SelectItem key={p.id} value={p.id} data-testid={`project-option-${p.id}`}>
                  <div className="flex items-center gap-2">
                    {p.logo_url ? (
                      <img src={p.logo_url} alt="" className="h-4 w-4 rounded object-cover" />
                    ) : (
                      <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span>{p.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      )}

      {/* منسدلة الفرع - تُخفى فقط لو لا يوجد فروع أساساً */}
      {branches.length > 0 && (
        <Select 
          value={selectedBranchId} 
          onValueChange={selectBranch}
          disabled={isRestricted}
        >
          <SelectTrigger 
            className="w-[180px] h-9 bg-card/50 border-border/50 text-sm relative"
            data-testid="branch-selector"
          >
            <SelectValue placeholder={t('اختر الفرع')} />
            {showPendingCount && selectedBranchId === 'all' && totalPendingOrders > 0 && (
              <span className="absolute -top-2 -left-2 min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                {totalPendingOrders}
              </span>
            )}
            {showPendingCount && selectedBranchId !== 'all' && (pendingOrdersCounts[selectedBranchId] || 0) > 0 && (
              <span className="absolute -top-2 -left-2 min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                {pendingOrdersCounts[selectedBranchId]}
              </span>
            )}
          </SelectTrigger>
          <SelectContent>
            {canSelectAllBranches() && (
              <SelectItem value="all" data-testid="branch-option-all">
                <div className="flex items-center justify-between w-full gap-3">
                  <span>{t('جميع الفروع')}</span>
                  {showPendingCount && totalPendingOrders > 0 && (
                    <span className="min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                      {totalPendingOrders}
                    </span>
                  )}
                </div>
              </SelectItem>
            )}
            {branches.map(branch => (
              <SelectItem 
                key={branch.id} 
                value={branch.id}
                data-testid={`branch-option-${branch.id}`}
              >
                <div className="flex items-center justify-between w-full gap-3">
                  <span>{branch.name}</span>
                  {showPendingCount && (pendingOrdersCounts[branch.id] || 0) > 0 && (
                    <span className="min-w-[20px] h-5 px-1.5 bg-orange-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                      {pendingOrdersCounts[branch.id]}
                    </span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
