import React from 'react';
import { Briefcase } from 'lucide-react';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useProject } from '../context/ProjectContext';

export const SettingsProjectBar = ({ className = '' }) => {
  const { enterpriseEnabled, projects, selectedProjectId, selectProject } = useProject();
  if (!enterpriseEnabled || !(projects || []).length) return null;
  return (
    <div className={`flex flex-wrap items-center gap-3 p-3 rounded-xl border border-primary/30 bg-primary/5 ${className}`} data-testid="settings-project-bar">
      <Briefcase className="h-4 w-4 text-primary" />
      <span className="text-sm font-medium text-foreground">المشروع:</span>
      <Select value={selectedProjectId || 'all'} onValueChange={selectProject}>
        <SelectTrigger className="w-[220px] h-9 bg-background text-foreground" data-testid="settings-project-select">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">كل المشاريع</SelectItem>
          {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <span className="text-xs text-muted-foreground">
        {selectedProjectId && selectedProjectId !== 'all'
          ? 'يتم عرض وحفظ بيانات هذا المشروع فقط'
          : 'عرض بيانات كل المشاريع — اختر مشروعاً للعزل'}
      </span>
    </div>
  );
};

export const ProjectFormSelect = ({ value, onChange, testId = 'form-project-select' }) => {
  const { enterpriseEnabled, projects } = useProject();
  if (!enterpriseEnabled || !(projects || []).length) return null;
  return (
    <div>
      <Label className="text-foreground">المشروع <span className="text-red-500">*</span></Label>
      <Select value={value || ''} onValueChange={onChange}>
        <SelectTrigger className="mt-1" data-testid={testId}>
          <SelectValue placeholder="اختر المشروع" />
        </SelectTrigger>
        <SelectContent>
          {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
};

export const ProjectBadge = ({ projectId }) => {
  const { enterpriseEnabled, projects, selectedProjectId } = useProject();
  if (!enterpriseEnabled || (selectedProjectId && selectedProjectId !== 'all')) return null;
  const p = (projects || []).find(x => x.id === projectId);
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap border shrink-0 ${p ? 'border-primary/60 bg-primary/20 text-foreground' : 'border-muted text-muted-foreground'}`}
      data-testid={`project-badge-${projectId || 'none'}`}
    >
      <Briefcase className="h-2.5 w-2.5" />
      {p ? p.name : 'بدون مشروع'}
    </span>
  );
};

export const PageProjectBar = SettingsProjectBar;

// حقل "المشروع" لنوافذ الإضافة: عند "كل المشاريع" يختار المستخدم المشروع فتتحول الصفحة له (قوائم ومواد المشروع فقط)
export const InventoryProjectField = () => {
  const { enterpriseEnabled, projects, selectedProjectId, selectProject } = useProject();
  if (!enterpriseEnabled || !(projects || []).length) return null;
  const locked = selectedProjectId && selectedProjectId !== 'all';
  if (locked) {
    const p = projects.find(x => x.id === selectedProjectId);
    return (
      <div className="flex items-center gap-2 text-xs p-2 rounded-lg border border-primary/30 bg-primary/5" data-testid="inventory-project-locked">
        <Briefcase className="h-3.5 w-3.5 text-primary" /> المشروع: <b>{p?.name}</b>
      </div>
    );
  }
  return (
    <div className="space-y-1 p-2 rounded-lg border border-red-500/40 bg-red-500/5" data-testid="inventory-project-field">
      <Label className="text-foreground">المشروع <span className="text-red-500">*</span></Label>
      <Select value="" onValueChange={selectProject}>
        <SelectTrigger data-testid="inventory-project-select"><SelectValue placeholder="اختر المشروع أولاً" /></SelectTrigger>
        <SelectContent>
          {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <p className="text-[11px] text-muted-foreground">بعد اختيار المشروع تظهر مواده فقط ويُحفظ العنصر عليه</p>
    </div>
  );
};
