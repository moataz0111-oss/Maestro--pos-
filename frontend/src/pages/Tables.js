import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { formatPrice } from '../utils/currency';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { ScrollArea } from '../components/ui/scroll-area';
import {
  ArrowRight,
  LayoutGrid,
  Users,
  Plus,
  Edit,
  Trash2,
  Check,
  X,
  Clock
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';
import { Label } from '../components/ui/label';

const API = API_URL;

export default function Tables() {
  const { user, hasRole, hasPermission } = useAuth();
  const navigate = useNavigate();
  
  const [tables, setTables] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTable, setEditingTable] = useState(null);
  const [formData, setFormData] = useState({ number: '', capacity: 4, section: '' });

  useEffect(() => {
    fetchData();
  }, [selectedBranch]);

  const fetchData = async () => {
    try {
      const [tablesRes, branchesRes] = await Promise.all([
        axios.get(`${API}/tables`, { params: { branch_id: selectedBranch } }),
        axios.get(`${API}/branches`)
      ]);
      
      setTables(tablesRes.data);
      setBranches(branchesRes.data);
      
      if (!selectedBranch && branchesRes.data.length > 0) {
        setSelectedBranch(branchesRes.data[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch tables:', error);
      toast.error('فشل في تحميل الطاولات');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingTable) {
        // Update logic would go here
        toast.success('تم تحديث الطاولة');
      } else {
        await axios.post(`${API}/tables`, {
          ...formData,
          number: parseInt(formData.number),
          branch_id: selectedBranch
        });
        toast.success('تم إضافة الطاولة');
      }
      setDialogOpen(false);
      setEditingTable(null);
      setFormData({ number: '', capacity: 4, section: '' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في حفظ الطاولة');
    }
  };

  const updateTableStatus = async (tableId, status) => {
    try {
      await axios.put(`${API}/tables/${tableId}/status?status=${status}`);
      toast.success('تم تحديث حالة الطاولة');
      fetchData();
    } catch (error) {
      toast.error('فشل في تحديث الحالة');
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      available: 'bg-green-500',
      occupied: 'bg-red-500',
      reserved: 'bg-yellow-500',
    };
    return colors[status] || colors.available;
  };

  const getStatusText = (status) => {
    const texts = {
      available: 'متاحة',
      occupied: 'مشغولة',
      reserved: 'محجوزة',
    };
    return texts[status] || status;
  };

  // Group tables by section
  const tablesBySection = tables.reduce((acc, table) => {
    const section = table.section || 'عام';
    if (!acc[section]) acc[section] = [];
    acc[section].push(table);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" data-testid="tables-page">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-border/50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')} data-testid="back-btn">
              <ArrowRight className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold font-cairo text-foreground">إدارة الطاولات</h1>
              <p className="text-sm text-muted-foreground">عرض وإدارة طاولات المطعم</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={selectedBranch || ''}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground"
            >
              {branches.map(branch => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>

            {(hasRole(['admin', 'manager']) || hasPermission('tables')) && (
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-primary text-primary-foreground" data-testid="add-table-btn">
                    <Plus className="h-4 w-4 ml-2" />
                    إضافة طاولة
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="text-foreground">{editingTable ? 'تعديل الطاولة' : 'إضافة طاولة جديدة'}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <Label className="text-foreground">رقم الطاولة</Label>
                      <Input
                        type="number"
                        value={formData.number}
                        onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                        required
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-foreground">السعة</Label>
                      <Input
                        type="number"
                        value={formData.capacity}
                        onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) })}
                        required
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-foreground">القسم</Label>
                      <Input
                        value={formData.section}
                        onChange={(e) => setFormData({ ...formData, section: e.target.value })}
                        placeholder="داخلي، خارجي، VIP..."
                        className="mt-1"
                      />
                    </div>
                    <div className="flex gap-2 pt-4">
                      <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                        إلغاء
                      </Button>
                      <Button type="submit" className="flex-1 bg-primary text-primary-foreground">
                        حفظ
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
      </header>

      {/* Stats */}
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card className="border-border/50 bg-card">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-12 h-12 bg-green-500/10 rounded-xl flex items-center justify-center">
                <Check className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">متاحة</p>
                <p className="text-2xl font-bold text-foreground">{tables.filter(t => t.status === 'available').length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-12 h-12 bg-red-500/10 rounded-xl flex items-center justify-center">
                <Users className="h-6 w-6 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">مشغولة</p>
                <p className="text-2xl font-bold text-foreground">{tables.filter(t => t.status === 'occupied').length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-12 h-12 bg-yellow-500/10 rounded-xl flex items-center justify-center">
                <Clock className="h-6 w-6 text-yellow-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">محجوزة</p>
                <p className="text-2xl font-bold text-foreground">{tables.filter(t => t.status === 'reserved').length}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Tables Grid by Section */}
      <main className="max-w-7xl mx-auto px-6 pb-8">
        {Object.entries(tablesBySection).map(([section, sectionTables]) => (
          <div key={section} className="mb-8">
            <h2 className="text-lg font-bold font-cairo mb-4 text-foreground">{section}</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {sectionTables.sort((a, b) => a.number - b.number).map(table => (
                <Card 
                  key={table.id}
                  className={`border-border/50 overflow-hidden cursor-pointer transition-all hover:shadow-lg ${
                    table.status === 'occupied' ? 'ring-2 ring-red-500' : ''
                  }`}
                  onClick={() => {
                    if (table.status === 'available') {
                      navigate(`/pos?table=${table.id}`);
                    }
                  }}
                  data-testid={`table-card-${table.number}`}
                >
                  <div className={`h-2 ${getStatusColor(table.status)}`} />
                  <CardContent className="p-4 text-center">
                    <div className="w-16 h-16 mx-auto mb-3 bg-muted rounded-xl flex items-center justify-center">
                      <LayoutGrid className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-2xl font-bold font-cairo text-foreground">{table.number}</h3>
                    <p className="text-sm text-muted-foreground mb-2">
                      <Users className="h-4 w-4 inline ml-1" />
                      {table.capacity} أشخاص
                    </p>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      table.status === 'available' ? 'bg-green-500/10 text-green-500' :
                      table.status === 'occupied' ? 'bg-red-500/10 text-red-500' :
                      'bg-yellow-500/10 text-yellow-500'
                    }`}>
                      {getStatusText(table.status)}
                    </span>
                    
                    {table.status === 'available' && (
                      <Button
                        size="sm"
                        className="w-full mt-3 bg-primary text-primary-foreground"
                        onClick={(e) => { e.stopPropagation(); navigate(`/pos?table=${table.id}`); }}
                      >
                        فتح طلب
                      </Button>
                    )}
                    
                    {table.status === 'occupied' && (
                      <div className="space-y-2 mt-3">
                        <Button
                          size="sm"
                          className="w-full bg-blue-500 text-white hover:bg-blue-600"
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            // تمرير order_id إذا كان موجوداً
                            if (table.current_order_id) {
                              navigate(`/pos?table=${table.id}&order=${table.current_order_id}`);
                            } else {
                              navigate(`/pos?table=${table.id}`);
                            }
                          }}
                          data-testid={`continue-order-${table.id}`}
                        >
                          متابعة الطلب
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full"
                          onClick={(e) => { e.stopPropagation(); updateTableStatus(table.id, 'available'); }}
                          data-testid={`free-table-${table.id}`}
                        >
                          تحرير الطاولة
                        </Button>
                      </div>
                    )}
                    
                    {table.status === 'reserved' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full mt-3"
                        onClick={(e) => { e.stopPropagation(); updateTableStatus(table.id, 'available'); }}
                      >
                        إلغاء الحجز
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}

        {tables.length === 0 && (
          <Card className="border-border/50 bg-card">
            <CardContent className="py-12 text-center">
              <LayoutGrid className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">لا توجد طاولات</p>
              {(hasRole(['admin', 'manager']) || hasPermission('tables')) && (
                <Button className="mt-4 bg-primary text-primary-foreground" onClick={() => setDialogOpen(true)}>
                  <Plus className="h-4 w-4 ml-2" />
                  إضافة طاولة
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
