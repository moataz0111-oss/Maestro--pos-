import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { formatPrice } from '../utils/currency';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import {
  Package,
  ArrowLeftRight,
  Send,
  Download,
  Plus,
  Check,
  X,
  Truck,
  Building,
  ClipboardList,
  AlertCircle,
  Clock,
  CheckCircle,
  XCircle,
  Search,
  FileText,
  ArrowRight,
  Home
} from 'lucide-react';
import { toast, Toaster } from 'sonner';

const API = API_URL;

export default function WarehouseTransfers() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('transfers');
  const [transfers, setTransfers] = useState([]);
  const [purchaseRequests, setPurchaseRequests] = useState([]);
  const [branches, setBranches] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBranch, setSelectedBranch] = useState('all');

  // Dialogs
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);

  // Forms
  const [transferForm, setTransferForm] = useState({
    from_branch_id: '',
    to_branch_id: '',
    transfer_type: 'warehouse_to_branch',
    items: [],
    notes: ''
  });
  const [requestForm, setRequestForm] = useState({
    branch_id: '',
    items: [{ name: '', quantity: '', unit: '', notes: '' }],
    priority: 'normal',
    notes: ''
  });

  const [selectedItems, setSelectedItems] = useState([]);

  useEffect(() => {
    fetchData();
  }, [selectedBranch]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      const [transfersRes, requestsRes, branchesRes, inventoryRes] = await Promise.all([
        axios.get(`${API}/inventory-transfers${selectedBranch !== 'all' ? `?from_branch_id=${selectedBranch}` : ''}`, { headers }),
        axios.get(`${API}/purchase-requests${selectedBranch !== 'all' ? `?branch_id=${selectedBranch}` : ''}`, { headers }),
        axios.get(`${API}/branches`, { headers }),
        axios.get(`${API}/inventory`, { headers })
      ]);
      
      setTransfers(transfersRes.data);
      setPurchaseRequests(requestsRes.data);
      setBranches(branchesRes.data);
      setInventory(inventoryRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('فشل في تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  // Transfer handlers
  const handleCreateTransfer = async (e) => {
    e.preventDefault();
    if (selectedItems.length === 0) {
      toast.error('يرجى اختيار أصناف للتحويل');
      return;
    }
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/inventory-transfers`, {
        ...transferForm,
        items: selectedItems.map(item => ({
          inventory_id: item.id,
          name: item.name,
          quantity: item.transferQuantity,
          unit: item.unit
        }))
      }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('تم إنشاء طلب التحويل');
      setTransferDialogOpen(false);
      setTransferForm({ from_branch_id: '', to_branch_id: '', transfer_type: 'warehouse_to_branch', items: [], notes: '' });
      setSelectedItems([]);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إنشاء التحويل');
    }
  };

  const handleTransferAction = async (transferId, action) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API}/inventory-transfers/${transferId}/${action}`, {}, { headers: { Authorization: `Bearer ${token}` } });
      toast.success(
        action === 'approve' ? 'تمت الموافقة على التحويل' :
        action === 'ship' ? 'تم شحن التحويل' :
        action === 'receive' ? 'تم استلام التحويل' : 'تم التحديث'
      );
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في تنفيذ العملية');
    }
  };

  // Purchase Request handlers
  const handleCreateRequest = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/purchase-requests`, {
        ...requestForm,
        items: requestForm.items.filter(item => item.name && item.quantity)
      }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('تم إنشاء طلب الشراء');
      setRequestDialogOpen(false);
      setRequestForm({ branch_id: '', items: [{ name: '', quantity: '', unit: '', notes: '' }], priority: 'normal', notes: '' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إنشاء الطلب');
    }
  };

  const handleRequestAction = async (requestId, action) => {
    try {
      const token = localStorage.getItem('token');
      if (action === 'approve') {
        await axios.put(`${API}/purchase-requests/${requestId}/approve`, {}, { headers: { Authorization: `Bearer ${token}` } });
      } else {
        await axios.put(`${API}/purchase-requests/${requestId}/status?status=${action}`, {}, { headers: { Authorization: `Bearer ${token}` } });
      }
      toast.success('تم تحديث الطلب');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في تنفيذ العملية');
    }
  };

  const addRequestItem = () => {
    setRequestForm({
      ...requestForm,
      items: [...requestForm.items, { name: '', quantity: '', unit: '', notes: '' }]
    });
  };

  const updateRequestItem = (index, field, value) => {
    const newItems = [...requestForm.items];
    newItems[index][field] = value;
    setRequestForm({ ...requestForm, items: newItems });
  };

  const removeRequestItem = (index) => {
    setRequestForm({
      ...requestForm,
      items: requestForm.items.filter((_, i) => i !== index)
    });
  };

  const toggleItemSelection = (item) => {
    const existingIndex = selectedItems.findIndex(i => i.id === item.id);
    if (existingIndex >= 0) {
      setSelectedItems(selectedItems.filter(i => i.id !== item.id));
    } else {
      setSelectedItems([...selectedItems, { ...item, transferQuantity: 1 }]);
    }
  };

  const updateItemQuantity = (itemId, quantity) => {
    setSelectedItems(selectedItems.map(item => 
      item.id === itemId ? { ...item, transferQuantity: parseFloat(quantity) || 0 } : item
    ));
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      pending: { label: 'قيد الانتظار', color: 'bg-yellow-500', icon: Clock },
      approved: { label: 'تمت الموافقة', color: 'bg-blue-500', icon: CheckCircle },
      shipped: { label: 'تم الشحن', color: 'bg-purple-500', icon: Truck },
      received: { label: 'تم الاستلام', color: 'bg-green-500', icon: CheckCircle },
      ordered: { label: 'تم الطلب', color: 'bg-indigo-500', icon: ClipboardList },
      cancelled: { label: 'ملغي', color: 'bg-red-500', icon: XCircle }
    };
    const config = statusConfig[status] || { label: status, color: 'bg-gray-500', icon: AlertCircle };
    const Icon = config.icon;
    return (
      <Badge className={`${config.color} text-white flex items-center gap-1`}>
        <Icon className="h-3 w-3" /> {config.label}
      </Badge>
    );
  };

  const getPriorityBadge = (priority) => {
    const priorityConfig = {
      urgent: { label: 'عاجل', color: 'bg-red-500' },
      high: { label: 'مرتفع', color: 'bg-orange-500' },
      normal: { label: 'عادي', color: 'bg-blue-500' },
      low: { label: 'منخفض', color: 'bg-gray-500' }
    };
    const config = priorityConfig[priority] || { label: priority, color: 'bg-gray-500' };
    return <Badge className={`${config.color} text-white`}>{config.label}</Badge>;
  };

  const filteredInventory = inventory.filter(item => 
    transferForm.from_branch_id ? item.branch_id === transferForm.from_branch_id : true
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Toaster position="top-center" richColors />
      
      {/* Header */}
      <div className="bg-card border-b sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* زر الرجوع */}
              <Button
                variant="outline"
                size="icon"
                onClick={() => navigate('/')}
                className="h-10 w-10"
                data-testid="back-btn"
              >
                <ArrowRight className="h-5 w-5" />
              </Button>
              
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
                  <ArrowLeftRight className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-foreground">إدارة المخزون والتحويلات</h1>
                  <p className="text-sm text-muted-foreground">تحويلات المخزون وطلبات الشراء</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="جميع الفروع" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الفروع</SelectItem>
                  {branches.map(branch => (
                    <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {/* زر الصفحة الرئيسية */}
              <Button
                variant="outline"
                size="icon"
                onClick={() => navigate('/')}
                className="h-10 w-10"
                title="الصفحة الرئيسية"
              >
                <Home className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-yellow-500/10 border-yellow-500/20">
            <CardContent className="p-4 text-center">
              <Clock className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-yellow-500">
                {transfers.filter(t => t.status === 'pending').length}
              </p>
              <p className="text-sm text-muted-foreground">تحويلات معلقة</p>
            </CardContent>
          </Card>
          <Card className="bg-purple-500/10 border-purple-500/20">
            <CardContent className="p-4 text-center">
              <Truck className="h-8 w-8 text-purple-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-purple-500">
                {transfers.filter(t => t.status === 'shipped').length}
              </p>
              <p className="text-sm text-muted-foreground">قيد التوصيل</p>
            </CardContent>
          </Card>
          <Card className="bg-blue-500/10 border-blue-500/20">
            <CardContent className="p-4 text-center">
              <ClipboardList className="h-8 w-8 text-blue-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-blue-500">
                {purchaseRequests.filter(r => r.status === 'pending').length}
              </p>
              <p className="text-sm text-muted-foreground">طلبات شراء معلقة</p>
            </CardContent>
          </Card>
          <Card className="bg-green-500/10 border-green-500/20">
            <CardContent className="p-4 text-center">
              <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-green-500">
                {transfers.filter(t => t.status === 'received').length}
              </p>
              <p className="text-sm text-muted-foreground">تحويلات مكتملة</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="transfers" className="flex items-center gap-2">
              <ArrowLeftRight className="h-4 w-4" /> تحويلات المخزون
            </TabsTrigger>
            <TabsTrigger value="requests" className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" /> طلبات الشراء
            </TabsTrigger>
          </TabsList>

          {/* Transfers Tab */}
          <TabsContent value="transfers">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>تحويلات المخزون</CardTitle>
                <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
                  <DialogTrigger asChild>
                    <Button><Plus className="h-4 w-4 ml-2" /> تحويل جديد</Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>إنشاء تحويل مخزون</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleCreateTransfer} className="space-y-4">
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <Label>نوع التحويل</Label>
                          <Select 
                            value={transferForm.transfer_type} 
                            onValueChange={(v) => setTransferForm({...transferForm, transfer_type: v})}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="warehouse_to_branch">من المخزن للفرع</SelectItem>
                              <SelectItem value="branch_to_warehouse">من الفرع للمخزن</SelectItem>
                              <SelectItem value="branch_to_branch">بين الفروع</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>من *</Label>
                          <Select 
                            value={transferForm.from_branch_id} 
                            onValueChange={(v) => setTransferForm({...transferForm, from_branch_id: v})}
                          >
                            <SelectTrigger><SelectValue placeholder="اختر المصدر" /></SelectTrigger>
                            <SelectContent>
                              {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>إلى *</Label>
                          <Select 
                            value={transferForm.to_branch_id} 
                            onValueChange={(v) => setTransferForm({...transferForm, to_branch_id: v})}
                          >
                            <SelectTrigger><SelectValue placeholder="اختر الوجهة" /></SelectTrigger>
                            <SelectContent>
                              {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Items Selection */}
                      <div>
                        <Label className="mb-2 block">الأصناف المتاحة</Label>
                        <div className="border rounded-lg max-h-60 overflow-y-auto">
                          {filteredInventory.length === 0 ? (
                            <p className="text-center text-muted-foreground p-4">اختر المصدر أولاً</p>
                          ) : (
                            <table className="w-full">
                              <thead className="bg-muted sticky top-0">
                                <tr>
                                  <th className="p-2 text-right">اختر</th>
                                  <th className="p-2 text-right">الصنف</th>
                                  <th className="p-2 text-right">المتوفر</th>
                                  <th className="p-2 text-right">الكمية المحولة</th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredInventory.map(item => {
                                  const isSelected = selectedItems.some(i => i.id === item.id);
                                  const selectedItem = selectedItems.find(i => i.id === item.id);
                                  return (
                                    <tr key={item.id} className={`border-b ${isSelected ? 'bg-primary/10' : ''}`}>
                                      <td className="p-2">
                                        <input 
                                          type="checkbox" 
                                          checked={isSelected}
                                          onChange={() => toggleItemSelection(item)}
                                          className="h-4 w-4"
                                        />
                                      </td>
                                      <td className="p-2">{item.name}</td>
                                      <td className="p-2">{item.quantity} {item.unit}</td>
                                      <td className="p-2">
                                        {isSelected && (
                                          <Input 
                                            type="number" 
                                            min="1" 
                                            max={item.quantity}
                                            value={selectedItem?.transferQuantity || 1}
                                            onChange={(e) => updateItemQuantity(item.id, e.target.value)}
                                            className="w-24"
                                          />
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </div>

                      {/* Selected Items Summary */}
                      {selectedItems.length > 0 && (
                        <div className="bg-muted p-3 rounded-lg">
                          <p className="font-medium mb-2">الأصناف المختارة ({selectedItems.length})</p>
                          <div className="flex flex-wrap gap-2">
                            {selectedItems.map(item => (
                              <Badge key={item.id} variant="secondary">
                                {item.name} ({item.transferQuantity} {item.unit})
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      <div>
                        <Label>ملاحظات</Label>
                        <Textarea 
                          value={transferForm.notes} 
                          onChange={(e) => setTransferForm({...transferForm, notes: e.target.value})}
                        />
                      </div>

                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setTransferDialogOpen(false)}>إلغاء</Button>
                        <Button type="submit" disabled={selectedItems.length === 0}>إنشاء التحويل</Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-right p-3">رقم التحويل</th>
                        <th className="text-right p-3">من</th>
                        <th className="text-right p-3">إلى</th>
                        <th className="text-right p-3">الأصناف</th>
                        <th className="text-right p-3">الحالة</th>
                        <th className="text-right p-3">التاريخ</th>
                        <th className="text-right p-3">الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transfers.map(transfer => (
                        <tr key={transfer.id} className="border-b hover:bg-muted/50">
                          <td className="p-3 font-medium">#{transfer.transfer_number}</td>
                          <td className="p-3">{transfer.from_branch_name || '-'}</td>
                          <td className="p-3">{transfer.to_branch_name || '-'}</td>
                          <td className="p-3">{transfer.items?.length || 0} صنف</td>
                          <td className="p-3">{getStatusBadge(transfer.status)}</td>
                          <td className="p-3">{new Date(transfer.created_at).toLocaleDateString('ar-IQ')}</td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              {transfer.status === 'pending' && (
                                <Button size="sm" onClick={() => handleTransferAction(transfer.id, 'approve')}>
                                  <Check className="h-4 w-4" />
                                </Button>
                              )}
                              {transfer.status === 'approved' && (
                                <Button size="sm" onClick={() => handleTransferAction(transfer.id, 'ship')}>
                                  <Truck className="h-4 w-4" />
                                </Button>
                              )}
                              {transfer.status === 'shipped' && (
                                <Button size="sm" onClick={() => handleTransferAction(transfer.id, 'receive')}>
                                  <Download className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Purchase Requests Tab */}
          <TabsContent value="requests">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>طلبات الشراء</CardTitle>
                <Dialog open={requestDialogOpen} onOpenChange={setRequestDialogOpen}>
                  <DialogTrigger asChild>
                    <Button><Plus className="h-4 w-4 ml-2" /> طلب شراء جديد</Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>إنشاء طلب شراء</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleCreateRequest} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>الفرع الطالب *</Label>
                          <Select 
                            value={requestForm.branch_id} 
                            onValueChange={(v) => setRequestForm({...requestForm, branch_id: v})}
                          >
                            <SelectTrigger><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
                            <SelectContent>
                              {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>الأولوية</Label>
                          <Select 
                            value={requestForm.priority} 
                            onValueChange={(v) => setRequestForm({...requestForm, priority: v})}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="urgent">عاجل</SelectItem>
                              <SelectItem value="high">مرتفع</SelectItem>
                              <SelectItem value="normal">عادي</SelectItem>
                              <SelectItem value="low">منخفض</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Items */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <Label>الأصناف المطلوبة</Label>
                          <Button type="button" size="sm" variant="outline" onClick={addRequestItem}>
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="space-y-2">
                          {requestForm.items.map((item, index) => (
                            <div key={index} className="grid grid-cols-5 gap-2 items-center">
                              <Input 
                                placeholder="اسم الصنف"
                                value={item.name}
                                onChange={(e) => updateRequestItem(index, 'name', e.target.value)}
                              />
                              <Input 
                                type="number"
                                placeholder="الكمية"
                                value={item.quantity}
                                onChange={(e) => updateRequestItem(index, 'quantity', e.target.value)}
                              />
                              <Input 
                                placeholder="الوحدة"
                                value={item.unit}
                                onChange={(e) => updateRequestItem(index, 'unit', e.target.value)}
                              />
                              <Input 
                                placeholder="ملاحظات"
                                value={item.notes}
                                onChange={(e) => updateRequestItem(index, 'notes', e.target.value)}
                              />
                              {requestForm.items.length > 1 && (
                                <Button 
                                  type="button" 
                                  size="sm" 
                                  variant="destructive"
                                  onClick={() => removeRequestItem(index)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <Label>ملاحظات عامة</Label>
                        <Textarea 
                          value={requestForm.notes} 
                          onChange={(e) => setRequestForm({...requestForm, notes: e.target.value})}
                        />
                      </div>

                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setRequestDialogOpen(false)}>إلغاء</Button>
                        <Button type="submit">إنشاء الطلب</Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-right p-3">رقم الطلب</th>
                        <th className="text-right p-3">الفرع</th>
                        <th className="text-right p-3">الأصناف</th>
                        <th className="text-right p-3">الأولوية</th>
                        <th className="text-right p-3">الحالة</th>
                        <th className="text-right p-3">التاريخ</th>
                        <th className="text-right p-3">الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchaseRequests.map(request => (
                        <tr key={request.id} className="border-b hover:bg-muted/50">
                          <td className="p-3 font-medium">#{request.request_number}</td>
                          <td className="p-3">{request.branch_name || '-'}</td>
                          <td className="p-3">
                            <div className="text-sm">
                              {request.items?.slice(0, 2).map((item, i) => (
                                <div key={i}>{item.name} ({item.quantity} {item.unit})</div>
                              ))}
                              {request.items?.length > 2 && <span className="text-muted-foreground">+{request.items.length - 2} أخرى</span>}
                            </div>
                          </td>
                          <td className="p-3">{getPriorityBadge(request.priority)}</td>
                          <td className="p-3">{getStatusBadge(request.status)}</td>
                          <td className="p-3">{new Date(request.created_at).toLocaleDateString('ar-IQ')}</td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              {request.status === 'pending' && (
                                <>
                                  <Button size="sm" onClick={() => handleRequestAction(request.id, 'approve')}>
                                    <Check className="h-4 w-4" />
                                  </Button>
                                  <Button size="sm" variant="destructive" onClick={() => handleRequestAction(request.id, 'cancelled')}>
                                    <X className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                              {request.status === 'approved' && (
                                <Button size="sm" onClick={() => handleRequestAction(request.id, 'ordered')}>
                                  <FileText className="h-4 w-4" />
                                </Button>
                              )}
                              {request.status === 'ordered' && (
                                <Button size="sm" onClick={() => handleRequestAction(request.id, 'received')}>
                                  <Download className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
