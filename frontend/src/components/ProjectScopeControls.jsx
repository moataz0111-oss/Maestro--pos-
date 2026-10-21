import React from 'react';
import { Briefcase } from 'lucide-react';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useProject } from '../context/ProjectContext';
import { ProjectColorDot, projectColorOf } from './ProjectColor';

export const SettingsProjectBar = ({ className = '' }) => {
  const { enterpriseEnabled, projects, selectedProjectId, selectProject, isProjectLocked } = useProject();
  if (!enterpriseEnabled || !(projects || []).length) return null;
  return (
    <div className={`flex flex-wrap items-center gap-3 p-3 rounded-xl border border-primary/30 bg-primary/5 ${className}`} data-testid="settings-project-bar">
      {selectedProjectId && selectedProjectId !== 'all'
        ? <ProjectColorDot color={projectColorOf(projects, selectedProjectId)} size={10} />
        : <Briefcase className="h-4 w-4 text-primary" />}
      <span className="text-sm font-medium text-foreground">المشروع:</span>
      <Select value={selectedProjectId || 'all'} onValueChange={selectProject} disabled={isProjectLocked}>
        <SelectTrigger className="w-[220px] h-9 bg-background text-foreground" data-testid="settings-project-select">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">كل المشاريع</SelectItem>
          {projects.map(p => <SelectItem key={p.id} value={p.id}><span className="flex items-center gap-2"><ProjectColorDot color={projectColorOf(projects, p.id)} size={8} />{p.name}</span></SelectItem>)}
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

export const ProjectFormSelect = ({ value, onChange, testId = 'form-project-select', allLabel, hint }) => {
  const { enterpriseEnabled, projects } = useProject();
  if (!enterpriseEnabled || !(projects || []).length) return null;
  return (
    <div>
      <Label className="text-foreground">المشروع {!allLabel && <span className="text-red-500">*</span>}</Label>
      <Select value={value || (allLabel ? 'all' : '')} onValueChange={onChange}>
        <SelectTrigger className="mt-1" data-testid={testId}>
          <SelectValue placeholder="اختر المشروع" />
        </SelectTrigger>
        <SelectContent>
          {allLabel && <SelectItem value="all"><span className="flex items-center gap-2"><Briefcase className="h-3.5 w-3.5 text-primary" />{allLabel}</span></SelectItem>}
          {projects.map(p => <SelectItem key={p.id} value={p.id}><span className="flex items-center gap-2"><ProjectColorDot color={projectColorOf(projects, p.id)} size={8} />{p.name}</span></SelectItem>)}
        </SelectContent>
      </Select>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
};

export const ChooseProjectNotice = ({ what }) => {
  const { projects, selectProject } = useProject();
  return (
    <div className="rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 p-8 text-center space-y-4" data-testid="choose-project-notice">
      <Briefcase className="h-10 w-10 mx-auto text-primary" />
      <div>
        <p className="font-bold text-foreground">اختر مشروعاً لتعديل {what} الخاصة به</p>
        <p className="text-sm text-muted-foreground mt-1">لكل مشروع إعداداته المستقلة — المشروع الذي لم تُدخل له بيانات تظهر حقوله فارغة</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {(projects || []).map(p => (
          <button key={p.id} type="button" onClick={() => selectProject(p.id)}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border bg-background text-sm hover:scale-105 transition-transform duration-200"
            style={{ borderColor: `${projectColorOf(projects, p.id)}80` }} data-testid={`choose-project-${p.id}`}>
            <ProjectColorDot color={projectColorOf(projects, p.id)} size={8} />{p.name}
          </button>
        ))}
      </div>
    </div>
  );
};

export const ProjectBadge = ({ projectId, emptyLabel = 'بدون مشروع' }) => {
  const { enterpriseEnabled, projects, selectedProjectId } = useProject();
  if (!enterpriseEnabled || (selectedProjectId && selectedProjectId !== 'all')) return null;
  const p = (projects || []).find(x => x.id === projectId);
  const color = projectColorOf(projects, projectId);
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap border shrink-0 ${p ? 'text-foreground' : 'border-muted text-muted-foreground'}`}
      style={p ? { background: `${color}1F`, borderColor: `${color}73` } : undefined}
      data-testid={`project-badge-${projectId || 'none'}`}
    >
      {p ? <ProjectColorDot color={color} size={7} /> : <Briefcase className="h-2.5 w-2.5" />}
      {p ? p.name : emptyLabel}
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
        <ProjectColorDot color={projectColorOf(projects, selectedProjectId)} size={8} /> المشروع: <b>{p?.name}</b>
      </div>
    );
  }
  return (
    <div className="space-y-1 p-2 rounded-lg border border-red-500/40 bg-red-500/5" data-testid="inventory-project-field">
      <Label className="text-foreground">المشروع <span className="text-red-500">*</span></Label>
      <Select value="" onValueChange={selectProject}>
        <SelectTrigger data-testid="inventory-project-select"><SelectValue placeholder="اختر المشروع أولاً" /></SelectTrigger>
        <SelectContent>
          {projects.map(p => <SelectItem key={p.id} value={p.id}><span className="flex items-center gap-2"><ProjectColorDot color={projectColorOf(projects, p.id)} size={8} />{p.name}</span></SelectItem>)}
        </SelectContent>
      </Select>
      <p className="text-[11px] text-muted-foreground">بعد اختيار المشروع تظهر مواده فقط ويُحفظ العنصر عليه</p>
    </div>
  );
};
