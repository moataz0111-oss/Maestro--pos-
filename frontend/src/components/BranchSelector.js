import React from 'react';
import { useBranch } from '../context/BranchContext';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Building2 } from 'lucide-react';

export default function BranchSelector({ className = '', showLabel = false, showPendingCount = true }) {
  const { user, hasRole } = useAuth();
  const { t } = useTranslation();
  const { 
    branches, 
    selectedBranchId, 
    selectBranch, 
    canSelectAllBranches,
    loading,
    pendingOrdersCounts
  } = useBranch();

  // الموظفون المقيدون بفرع لا يمكنهم تغيير الفرع
  const isRestricted = user?.branch_id && !hasRole(['admin', 'super_admin', 'manager']);

  if (loading || branches.length === 0) {
    return null;
  }

  // حساب إجمالي الطلبات المعلقة لجميع الفروع
  const totalPendingOrders = Object.values(pendingOrdersCounts).reduce((sum, count) => sum + count, 0);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {showLabel && (
        <Building2 className="h-4 w-4 text-muted-foreground" />
      )}
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
          {/* عرض عدد الطلبات المعلقة للفرع المحدد */}
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
    </div>
  );
}
