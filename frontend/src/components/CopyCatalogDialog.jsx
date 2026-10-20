import React, { useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Copy } from 'lucide-react';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useProject } from '../context/ProjectContext';
import API_URL from '../utils/api';

export const CopyCatalogDialog = ({ onDone }) => {
  const { enterpriseEnabled, projects, selectedProjectId } = useProject();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  if (!enterpriseEnabled || (projects || []).length < 2) return null;

  const openDialog = () => {
    setSource('');
    setTarget(selectedProjectId && selectedProjectId !== 'all' ? selectedProjectId : '');
    setOpen(true);
  };

  const submit = async () => {
    setBusy(true);
    try {
      const res = await axios.post(`${API_URL}/projects/${target}/copy-catalog`, { source_project_id: source });
      toast.success(res.data?.message || 'تم النسخ');
      setOpen(false);
      onDone?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل النسخ');
    } finally {
      setBusy(false);
    }
  };

  const pick = (value, onChange, testId, exclude) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="mt-1" data-testid={testId}><SelectValue placeholder="اختر المشروع" /></SelectTrigger>
      <SelectContent>
        {projects.filter(p => p.id !== exclude).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <>
      <Button variant="outline" className="gap-2" onClick={openDialog} data-testid="copy-catalog-btn">
        <Copy className="h-4 w-4" /> نسخ من مشروع
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" dir="rtl" data-testid="copy-catalog-dialog">
          <DialogHeader><DialogTitle>نسخ الفئات والمنتجات بين المشاريع</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>من المشروع</Label>{pick(source, setSource, 'copy-source-select', target)}</div>
            <div><Label>إلى المشروع</Label>{pick(target, setTarget, 'copy-target-select', source)}</div>
            <p className="text-xs text-muted-foreground p-2 rounded bg-muted/40">
              تُنسخ الفئات والمنتجات كنسخ مستقلة، والفئات الموجودة بنفس الاسم لا تتكرر. ربط المنتجات بالمواد الخام والمصنّعات والتغليف لا يُنسخ، لأن هذه المواد تخص المشروع المصدر. اربطها بمواد المشروع الجديد حتى تُحسب التكلفة الصحيحة.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button disabled={!source || !target || busy} onClick={submit} data-testid="copy-catalog-submit">
              {busy ? 'جارٍ النسخ...' : 'نسخ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
