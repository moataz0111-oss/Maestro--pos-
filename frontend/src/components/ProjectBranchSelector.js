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

/**
 * منسدلة هرمية: مشروع ← فرع
 * - إذا لا يوجد أكثر من مشروع، يعود سلوك الفرع فقط (توافق مع الوضع الحالي).
 * - عند تفعيل Enterprise mode، يظهر مستويين.
 */
export default function ProjectBranchSelector({ className = '' }) {
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
    pendingOrdersCounts,
  } = useBranch();

  const isBranchRestricted =
    user?.branch_id && !hasRole(['admin', 'general_manager', 'super_admin', 'manager']);
  const isProjectRestricted =
    user?.project_id && !hasRole(['admin', 'general_manager', 'super_admin', 'enterprise_owner']);

  const totalPending = Object.values(pendingOrdersCounts || {}).reduce((s, c) => s + c, 0);

  const currentProject = projects.find(p => p.id === selectedProjectId);
  const currentBranch = branches.find(b => b.id === selectedBranchId);

  // إذا وضع المؤسسة غير مفعّل أو مشروع واحد فقط، اعرض منسدلة الفرع فقط
  if (!enterpriseEnabled || projects.length <= 1) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Select
          value={selectedBranchId}
          onValueChange={selectBranch}
          disabled={isBranchRestricted || loading}
        >
          <SelectTrigger
            className="w-[200px] h-9 bg-card/50 border-border/50 text-sm relative"
            data-testid="branch-selector"
          >
            <div className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue placeholder={t('اختر الفرع')} />
            </div>
            {totalPending > 0 && selectedBranchId === 'all' && (
              <span className="absolute -top-2 -left-2 min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                {totalPending}
              </span>
            )}
          </SelectTrigger>
          <SelectContent>
            {canSelectAllBranches() && (
              <SelectItem value="all" data-testid="branch-option-all">
                {t('جميع الفروع')}
              </SelectItem>
            )}
            {branches.map(b => (
              <SelectItem key={b.id} value={b.id} data-testid={`branch-option-${b.id}`}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  // ═══ وضع المؤسسة: منسدلتين ═══
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* منسدلة المشروع */}
      <Select
        value={selectedProjectId}
        onValueChange={selectProject}
        disabled={isProjectRestricted}
      >
        <SelectTrigger
          className="w-[180px] h-9 bg-gradient-to-r from-primary/10 to-primary/5 border-primary/30 text-sm"
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

      {/* منسدلة الفرع - تظهر فقط عند اختيار مشروع محدد */}
      {selectedProjectId !== 'all' && (
        <Select
          value={selectedBranchId}
          onValueChange={selectBranch}
          disabled={isBranchRestricted || loading}
        >
          <SelectTrigger
            className="w-[180px] h-9 bg-card/50 border-border/50 text-sm relative"
            data-testid="branch-selector"
          >
            <div className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue placeholder={t('اختر الفرع')} />
            </div>
            {totalPending > 0 && selectedBranchId === 'all' && (
              <span className="absolute -top-2 -left-2 min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                {totalPending}
              </span>
            )}
          </SelectTrigger>
          <SelectContent>
            {canSelectAllBranches() && (
              <SelectItem value="all" data-testid="branch-option-all">
                {t('جميع الفروع')}
              </SelectItem>
            )}
            {branches
              .filter(b => !currentProject || b.project_id === currentProject.id || !b.project_id)
              .map(b => (
                <SelectItem key={b.id} value={b.id} data-testid={`branch-option-${b.id}`}>
                  <div className="flex items-center justify-between w-full gap-3">
                    <span>{b.name}</span>
                    {(pendingOrdersCounts[b.id] || 0) > 0 && (
                      <span className="min-w-[20px] h-5 px-1.5 bg-orange-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                        {pendingOrdersCounts[b.id]}
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
