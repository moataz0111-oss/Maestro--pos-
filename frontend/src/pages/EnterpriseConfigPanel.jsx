import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { API_URL } from '../utils/api';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Badge } from '../components/ui/badge';
import { ArrowLeft, Building2, Users, Briefcase, Save, Crown } from 'lucide-react';

export default function EnterpriseConfigPanel() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState({});

  const load = () => {
    setLoading(true);
    axios.get(`${API_URL}/enterprise-config/tenants-list`)
      .then(r => setTenants(r.data || []))
      .catch(e => toast.error(e.response?.data?.detail || 'فشل التحميل'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const startEdit = (t) => {
    setEditing({
      ...editing,
      [t.id]: {
        enterprise_enabled: t.enterprise_enabled,
        max_projects: t.max_projects,
        max_branches_per_project: t.max_branches_per_project,
        max_users_per_project: t.max_users_per_project,
      }
    });
  };

  const updateField = (tid, field, value) => {
    setEditing({ ...editing, [tid]: { ...editing[tid], [field]: value } });
  };

  const save = async (tid) => {
    try {
      await axios.put(`${API_URL}/enterprise-config/tenant/${tid}`, editing[tid]);
      toast.success('تم الحفظ بنجاح');
      setEditing({ ...editing, [tid]: null });
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل الحفظ');
    }
  };

  return (
    <div className="p-6 space-y-4" dir="rtl" data-testid="enterprise-config-page">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} data-testid="back-btn">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Crown className="h-6 w-6 text-yellow-500" />
            إدارة وضع المؤسسة للعملاء
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            فعّل وضع المؤسسة لكل عميل، وحدّد حدود المشاريع/الفروع/المستخدمين المسموح بها
          </p>
        </div>
      </div>

      {loading && <p>جاري التحميل...</p>}

      <div className="space-y-3">
        {tenants.map(t => {
          const edit = editing[t.id];
          const isEditing = edit != null;
          return (
            <Card key={t.id} data-testid={`tenant-card-${t.id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {t.name}
                      {t.enterprise_enabled ? (
                        <Badge className="bg-green-500">وضع المؤسسة مُفعّل</Badge>
                      ) : (
                        <Badge variant="secondary">وضع تقليدي</Badge>
                      )}
                    </CardTitle>
                    <div className="text-xs text-muted-foreground mt-1">
                      المستخدم الحالي: {t.current_projects} مشروع • {t.current_branches} فرع • {t.current_users} مستخدم
                    </div>
                  </div>
                  {!isEditing ? (
                    <Button size="sm" onClick={() => startEdit(t)} data-testid={`edit-btn-${t.id}`}>تعديل</Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditing({ ...editing, [t.id]: null })}>إلغاء</Button>
                      <Button size="sm" onClick={() => save(t.id)} data-testid={`save-btn-${t.id}`} className="gap-1">
                        <Save className="h-3.5 w-3.5" /> حفظ
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              {isEditing && (
                <CardContent className="space-y-4 pt-2 border-t">
                  <div className="flex items-center justify-between p-3 bg-muted/30 rounded">
                    <div>
                      <Label className="text-sm">تفعيل وضع المؤسسة</Label>
                      <p className="text-xs text-muted-foreground">
                        عند التفعيل: العميل يقدر ينشئ مشاريع متعددة بحدود محددة أدناه
                      </p>
                    </div>
                    <Switch
                      checked={edit.enterprise_enabled}
                      onCheckedChange={(v) => updateField(t.id, 'enterprise_enabled', v)}
                      data-testid={`enterprise-toggle-${t.id}`}
                    />
                  </div>

                  {edit.enterprise_enabled && (
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs flex items-center gap-1">
                          <Briefcase className="h-3 w-3" /> الحد الأقصى للمشاريع
                        </Label>
                        <Input
                          data-testid={`max-projects-${t.id}`}
                          type="number"
                          min={1}
                          max={100}
                          value={edit.max_projects}
                          onChange={e => updateField(t.id, 'max_projects', Number(e.target.value) || 1)}
                        />
                        <p className="text-xs text-muted-foreground mt-1">حالياً: {t.current_projects}</p>
                      </div>
                      <div>
                        <Label className="text-xs flex items-center gap-1">
                          <Building2 className="h-3 w-3" /> الفروع لكل مشروع
                        </Label>
                        <Input
                          data-testid={`max-branches-${t.id}`}
                          type="number"
                          min={1}
                          max={100}
                          value={edit.max_branches_per_project}
                          onChange={e => updateField(t.id, 'max_branches_per_project', Number(e.target.value) || 1)}
                        />
                        <p className="text-xs text-muted-foreground mt-1">حالياً: {t.current_branches}</p>
                      </div>
                      <div>
                        <Label className="text-xs flex items-center gap-1">
                          <Users className="h-3 w-3" /> المستخدمون لكل مشروع
                        </Label>
                        <Input
                          data-testid={`max-users-${t.id}`}
                          type="number"
                          min={1}
                          max={1000}
                          value={edit.max_users_per_project}
                          onChange={e => updateField(t.id, 'max_users_per_project', Number(e.target.value) || 1)}
                        />
                        <p className="text-xs text-muted-foreground mt-1">حالياً: {t.current_users}</p>
                      </div>
                    </div>
                  )}

                  <p className="text-xs bg-yellow-50 border border-yellow-200 p-2 rounded">
                    ⚠️ عند تعطيل وضع المؤسسة سيتم إخفاء كل المشاريع غير الافتراضية للعميل تلقائياً (بيانات المشاريع تبقى محفوظة).
                  </p>
                </CardContent>
              )}
            </Card>
          );
        })}
        {tenants.length === 0 && !loading && (
          <p className="text-muted-foreground text-center py-6">لا يوجد عملاء بعد</p>
        )}
      </div>
    </div>
  );
}
