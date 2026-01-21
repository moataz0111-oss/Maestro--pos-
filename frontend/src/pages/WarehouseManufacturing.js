import React, { useState, useEffect } from 'react';
import { API_URL, BACKEND_URL } from '../utils/api';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { formatPrice } from '../utils/currency';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import {
  ArrowRight,
  Plus,
  Minus,
  Package,
  Warehouse,
  Factory,
  Send,
  Search,
  Eye,
  AlertTriangle,
  RefreshCw,
  ArrowUpCircle,
  ArrowDownCircle,
  Beaker,
  ChevronDown,
  ChevronUp,
  TreeDeciduous,
  BoxSelect,
  Truck,
  CheckCircle,
  Clock,
  X,
  Building2
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../components/ui/tabs';

const API = API_URL;

export default function WarehouseManufacturing() {
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  
  const [activeTab, setActiveTab] = useState('warehouse');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  // Data states
  const [rawMaterials, setRawMaterials] = useState([]);
  const [manufacturingInventory, setManufacturingInventory] = useState([]);
  const [manufacturedProducts, setManufacturedProducts] = useState([]);
  const [warehouseTransfers, setWarehouseTransfers] = useState([]);
  const [warehouseTransactions, setWarehouseTransactions] = useState([]);
  const [branches, setBranches] = useState([]);
  const [stats, setStats] = useState(null);
  
  // Dialog states
  const [showAddRawMaterial, setShowAddRawMaterial] = useState(false);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [showBranchTransferDialog, setShowBranchTransferDialog] = useState(false);
  const [showAddProductDialog, setShowAddProductDialog] = useState(false);
  const [showProduceDialog, setShowProduceDialog] = useState(null);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  
  // Form states
  const [rawMaterialForm, setRawMaterialForm] = useState({
    name: '',
    name_en: '',
    unit: 'كغم',
    quantity: 0,
    min_quantity: 0,
    cost_per_unit: 0,
    category: ''
  });
  
  const [transferForm, setTransferForm] = useState({
    items: [],
    notes: ''
  });
  
  const [branchTransferForm, setBranchTransferForm] = useState({
    to_branch_id: '',
    items: [],
    notes: ''
  });
  
  const [productForm, setProductForm] = useState({
    name: '',
    name_en: '',
    unit: 'قطعة',
    recipe: [],
    quantity: 0,
    min_quantity: 0,
    selling_price: 0,
    category: ''
  });
  
  const [newIngredient, setNewIngredient] = useState({
    raw_material_id: '',
    quantity: 0
  });
  
  const [produceQuantity, setProduceQuantity] = useState(1);
  
  const [searchQuery, setSearchQuery] = useState('');

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [
        rawRes, 
        mfgInvRes, 
        productsRes, 
        transfersRes, 
        transactionsRes,
        statsRes,
        branchesRes
      ] = await Promise.all([
        axios.get(`${API}/raw-materials-new`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/manufacturing-inventory`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/manufactured-products`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/warehouse-transfers`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/warehouse-transactions`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/inventory-stats`, { headers }).catch(() => ({ data: null })),
        axios.get(`${API}/branches`, { headers }).catch(() => ({ data: [] }))
      ]);
      
      setRawMaterials(rawRes.data || []);
      setManufacturingInventory(mfgInvRes.data || []);
      setManufacturedProducts(productsRes.data || []);
      setWarehouseTransfers(transfersRes.data || []);
      setWarehouseTransactions(transactionsRes.data || []);
      setStats(statsRes.data);
      setBranches(branchesRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  // إضافة مادة خام
  const handleAddRawMaterial = async (e) => {
    e.preventDefault();
    if (!rawMaterialForm.name) {
      toast.error('الرجاء إدخال اسم المادة');
      return;
    }
    
    setSubmitting(true);
    try {
      await axios.post(`${API}/raw-materials-new`, rawMaterialForm, { headers });
      toast.success('تم إضافة المادة الخام');
      setShowAddRawMaterial(false);
      setRawMaterialForm({
        name: '',
        name_en: '',
        unit: 'كغم',
        quantity: 0,
        min_quantity: 0,
        cost_per_unit: 0,
        category: ''
      });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إضافة المادة');
    } finally {
      setSubmitting(false);
    }
  };

  // إضافة صنف للتحويل
  const addItemToTransfer = (material) => {
    const existing = transferForm.items.find(i => i.raw_material_id === material.id);
    if (existing) {
      toast.error('هذه المادة موجودة بالفعل');
      return;
    }
    
    setTransferForm(prev => ({
      ...prev,
      items: [...prev.items, {
        raw_material_id: material.id,
        raw_material_name: material.name,
        quantity: 1,
        unit: material.unit,
        available: material.quantity
      }]
    }));
  };

  // تحديث كمية التحويل
  const updateTransferItemQty = (index, qty) => {
    setTransferForm(prev => {
      const items = [...prev.items];
      items[index].quantity = qty;
      return { ...prev, items };
    });
  };

  // حذف صنف من التحويل
  const removeTransferItem = (index) => {
    setTransferForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  // تحويل للتصنيع
  const handleTransferToManufacturing = async () => {
    if (transferForm.items.length === 0) {
      toast.error('الرجاء إضافة مواد للتحويل');
      return;
    }
    
    // التحقق من الكميات
    for (const item of transferForm.items) {
      if (item.quantity > item.available) {
        toast.error(`الكمية المطلوبة من ${item.raw_material_name} أكبر من المتوفر`);
        return;
      }
    }
    
    setSubmitting(true);
    try {
      await axios.post(`${API}/warehouse-to-manufacturing`, {
        items: transferForm.items.map(i => ({
          raw_material_id: i.raw_material_id,
          quantity: i.quantity
        })),
        notes: transferForm.notes
      }, { headers });
      
      toast.success('تم التحويل لقسم التصنيع بنجاح');
      setShowTransferDialog(false);
      setTransferForm({ items: [], notes: '' });
      fetchData();
    } catch (error) {
      const detail = error.response?.data?.detail;
      if (typeof detail === 'object' && detail.insufficient_materials) {
        toast.error(`مواد غير كافية: ${detail.insufficient_materials.map(m => m.name).join(', ')}`);
      } else {
        toast.error(detail || 'فشل في التحويل');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // إضافة صنف لتحويل الفرع
  const addItemToBranchTransfer = (material) => {
    const existing = branchTransferForm.items.find(i => i.raw_material_id === material.id);
    if (existing) {
      toast.info('هذا الصنف موجود بالفعل');
      return;
    }
    setBranchTransferForm(prev => ({
      ...prev,
      items: [...prev.items, {
        raw_material_id: material.id,
        raw_material_name: material.name,
        quantity: 1,
        unit: material.unit,
        available: material.quantity
      }]
    }));
  };

  // تحديث كمية تحويل الفرع
  const updateBranchTransferQty = (index, qty) => {
    setBranchTransferForm(prev => {
      const newItems = [...prev.items];
      newItems[index].quantity = parseFloat(qty) || 0;
      return { ...prev, items: newItems };
    });
  };

  // حذف صنف من تحويل الفرع
  const removeBranchTransferItem = (index) => {
    setBranchTransferForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  // تحويل للفرع
  const handleTransferToBranch = async () => {
    if (!branchTransferForm.to_branch_id) {
      toast.error('الرجاء اختيار الفرع');
      return;
    }
    if (branchTransferForm.items.length === 0) {
      toast.error('الرجاء إضافة مواد للتحويل');
      return;
    }
    
    // التحقق من الكميات
    for (const item of branchTransferForm.items) {
      if (item.quantity <= 0) {
        toast.error(`الكمية يجب أن تكون أكبر من صفر للمادة: ${item.raw_material_name}`);
        return;
      }
      if (item.quantity > item.available) {
        toast.error(`الكمية المطلوبة أكبر من المتاح للمادة: ${item.raw_material_name}`);
        return;
      }
    }
    
    setSubmitting(true);
    try {
      await axios.post(`${API}/warehouse-transfers`, {
        transfer_type: 'warehouse_to_branch',
        to_branch_id: branchTransferForm.to_branch_id,
        items: branchTransferForm.items.map(i => ({
          raw_material_id: i.raw_material_id,
          quantity: i.quantity
        })),
        notes: branchTransferForm.notes
      }, { headers });
      
      toast.success('تم التحويل للفرع بنجاح');
      setShowBranchTransferDialog(false);
      setBranchTransferForm({ to_branch_id: '', items: [], notes: '' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في التحويل');
    } finally {
      setSubmitting(false);
    }
  };

  // إضافة مكون للوصفة
  const addIngredientToRecipe = () => {
    if (!newIngredient.raw_material_id || newIngredient.quantity <= 0) {
      toast.error('اختر مادة خام وحدد الكمية');
      return;
    }
    
    // البحث في مخزون التصنيع
    const material = manufacturingInventory.find(m => m.raw_material_id === newIngredient.raw_material_id);
    if (!material) {
      toast.error('المادة غير موجودة في مخزون التصنيع');
      return;
    }
    
    const exists = productForm.recipe.find(r => r.raw_material_id === newIngredient.raw_material_id);
    if (exists) {
      toast.error('هذه المادة موجودة بالفعل في الوصفة');
      return;
    }
    
    setProductForm(prev => ({
      ...prev,
      recipe: [...prev.recipe, {
        raw_material_id: material.raw_material_id,
        raw_material_name: material.raw_material_name,
        quantity: newIngredient.quantity,
        unit: material.unit,
        cost_per_unit: material.cost_per_unit || 0
      }]
    }));
    
    setNewIngredient({ raw_material_id: '', quantity: 0 });
  };

  // حذف مكون من الوصفة
  const removeIngredientFromRecipe = (index) => {
    setProductForm(prev => ({
      ...prev,
      recipe: prev.recipe.filter((_, i) => i !== index)
    }));
  };

  // حساب تكلفة الوصفة
  const calculateRecipeCost = () => {
    return productForm.recipe.reduce((sum, ing) => sum + (ing.quantity * (ing.cost_per_unit || 0)), 0);
  };

  // إضافة منتج مصنع
  const handleAddProduct = async (e) => {
    e.preventDefault();
    if (!productForm.name || productForm.recipe.length === 0) {
      toast.error('الرجاء إدخال اسم المنتج وإضافة الوصفة');
      return;
    }
    
    setSubmitting(true);
    try {
      await axios.post(`${API}/manufactured-products`, productForm, { headers });
      toast.success('تم إضافة المنتج المصنع');
      setShowAddProductDialog(false);
      setProductForm({
        name: '',
        name_en: '',
        unit: 'قطعة',
        recipe: [],
        quantity: 0,
        min_quantity: 0,
        selling_price: 0,
        category: ''
      });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إضافة المنتج');
    } finally {
      setSubmitting(false);
    }
  };

  // تصنيع منتج
  const handleProduce = async () => {
    if (!showProduceDialog || produceQuantity <= 0) return;
    
    setSubmitting(true);
    try {
      await axios.post(`${API}/manufactured-products/${showProduceDialog.id}/produce?quantity=${produceQuantity}`, {}, { headers });
      toast.success(`تم تصنيع ${produceQuantity} ${showProduceDialog.unit} من ${showProduceDialog.name}`);
      setShowProduceDialog(null);
      setProduceQuantity(1);
      fetchData();
    } catch (error) {
      const detail = error.response?.data?.detail;
      if (typeof detail === 'object' && detail.insufficient_materials) {
        toast.error(`مواد غير كافية: ${detail.insufficient_materials.map(m => `${m.name} (متوفر: ${m.available})`).join(', ')}`);
      } else {
        toast.error(detail || 'فشل في التصنيع');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // تصفية البيانات
  const filteredRawMaterials = rawMaterials.filter(m => 
    !searchQuery || m.name.includes(searchQuery) || m.name_en?.includes(searchQuery)
  );

  const lowStockMaterials = rawMaterials.filter(m => m.quantity <= m.min_quantity);
  const lowStockProducts = manufacturedProducts.filter(p => p.quantity <= p.min_quantity);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl" data-testid="warehouse-page">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')} data-testid="back-btn">
              <ArrowRight className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Warehouse className="h-5 w-5 text-primary" />
                المخزن والتصنيع
              </h1>
              <p className="text-xs text-muted-foreground">إدارة المواد الخام والمنتجات المصنعة</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {activeTab === 'warehouse' && (
              <>
                <Button 
                  variant="outline"
                  onClick={() => setShowTransferDialog(true)}
                  data-testid="transfer-btn"
                >
                  <Send className="h-4 w-4 ml-2" />
                  تحويل للتصنيع
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => setShowBranchTransferDialog(true)}
                  className="border-green-500 text-green-600 hover:bg-green-50"
                  data-testid="branch-transfer-btn"
                >
                  <Building2 className="h-4 w-4 ml-2" />
                  تحويل للفرع
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => navigate('/purchases-new')}
                  className="border-blue-500 text-blue-600 hover:bg-blue-50"
                  data-testid="purchase-request-btn"
                >
                  <Truck className="h-4 w-4 ml-2" />
                  طلب من المشتريات
                </Button>
                <Button 
                  onClick={() => setShowAddRawMaterial(true)}
                  className="bg-primary"
                  data-testid="add-material-btn"
                >
                  <Plus className="h-4 w-4 ml-2" />
                  مادة خام
                </Button>
              </>
            )}
            {activeTab === 'manufacturing' && (
              <Button 
                onClick={() => setShowAddProductDialog(true)}
                className="bg-primary"
                data-testid="add-product-btn"
              >
                <Plus className="h-4 w-4 ml-2" />
                منتج مصنع
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 space-y-4">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-blue-500/10 border-blue-500/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Package className="h-8 w-8 text-blue-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">المواد الخام</p>
                    <p className="text-2xl font-bold">{stats.raw_materials?.count || 0}</p>
                    <p className="text-xs text-blue-500">{formatPrice(stats.raw_materials?.total_value || 0)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-purple-500/10 border-purple-500/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Beaker className="h-8 w-8 text-purple-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">مخزون التصنيع</p>
                    <p className="text-2xl font-bold">{stats.manufacturing?.count || 0}</p>
                    <p className="text-xs text-purple-500">{formatPrice(stats.manufacturing?.total_value || 0)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-green-500/10 border-green-500/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Factory className="h-8 w-8 text-green-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">المنتجات المصنعة</p>
                    <p className="text-2xl font-bold">{stats.manufactured_products?.count || 0}</p>
                    <p className="text-xs text-green-500">{formatPrice(stats.manufactured_products?.total_value || 0)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-red-500/10 border-red-500/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-8 w-8 text-red-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">نقص المخزون</p>
                    <p className="text-2xl font-bold">
                      {(stats.raw_materials?.low_stock_count || 0) + (stats.manufactured_products?.low_stock_count || 0)}
                    </p>
                    <p className="text-xs text-red-500">أصناف تحتاج إعادة تعبئة</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-4 w-full max-w-2xl">
            <TabsTrigger value="warehouse" className="gap-2" data-testid="tab-warehouse">
              <Warehouse className="h-4 w-4" />
              المخزن
            </TabsTrigger>
            <TabsTrigger value="manufacturing" className="gap-2" data-testid="tab-manufacturing">
              <Factory className="h-4 w-4" />
              التصنيع
            </TabsTrigger>
            <TabsTrigger value="transactions" className="gap-2" data-testid="tab-transactions">
              <ArrowUpCircle className="h-4 w-4" />
              الحركات
            </TabsTrigger>
            <TabsTrigger value="transfers" className="gap-2" data-testid="tab-transfers">
              <Send className="h-4 w-4" />
              التحويلات
            </TabsTrigger>
          </TabsList>

          {/* المخزن (المواد الخام) */}
          <TabsContent value="warehouse" className="space-y-4">
            {/* Low Stock Alert */}
            {lowStockMaterials.length > 0 && (
              <Card className="border-red-500/50 bg-red-500/5">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-red-500 mb-2">
                    <AlertTriangle className="h-5 w-5" />
                    <span className="font-bold">تنبيه نقص المخزون</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {lowStockMaterials.map(m => (
                      <span key={m.id} className="px-3 py-1 bg-red-500/10 text-red-500 rounded-full text-sm">
                        {m.name}: {m.quantity} {m.unit}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Search */}
            <div className="relative w-64">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10"
              />
            </div>

            {/* Materials Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredRawMaterials.map(material => (
                <Card 
                  key={material.id}
                  className={`hover:shadow-md transition-shadow ${material.quantity <= material.min_quantity ? 'ring-2 ring-red-500' : ''}`}
                  data-testid={`material-${material.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-bold">{material.name}</h3>
                        {material.name_en && <p className="text-sm text-muted-foreground">{material.name_en}</p>}
                      </div>
                      <Badge className={material.quantity <= material.min_quantity ? 'bg-red-500/20 text-red-500' : 'bg-green-500/20 text-green-500'}>
                        {material.quantity <= material.min_quantity ? 'نقص' : 'متوفر'}
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                      <div>
                        <p className="text-muted-foreground">الكمية</p>
                        <p className="text-lg font-bold">{material.quantity} {material.unit}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">الحد الأدنى</p>
                        <p className="font-medium">{material.min_quantity} {material.unit}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">التكلفة/وحدة</p>
                        <p className="font-medium">{formatPrice(material.cost_per_unit)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">القيمة الكلية</p>
                        <p className="font-medium text-primary">{formatPrice(material.total_value || material.quantity * material.cost_per_unit)}</p>
                      </div>
                    </div>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => addItemToTransfer(material)}
                    >
                      <Send className="h-4 w-4 ml-2" />
                      إضافة للتحويل
                    </Button>
                  </CardContent>
                </Card>
              ))}
              
              {filteredRawMaterials.length === 0 && (
                <Card className="col-span-full">
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>لا توجد مواد خام</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* التصنيع */}
          <TabsContent value="manufacturing" className="space-y-4">
            {/* Manufacturing Inventory */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Beaker className="h-5 w-5 text-purple-500" />
                  المواد الخام في قسم التصنيع
                </CardTitle>
              </CardHeader>
              <CardContent>
                {manufacturingInventory.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Beaker className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>لا توجد مواد في قسم التصنيع</p>
                    <p className="text-sm">قم بتحويل مواد من المخزن</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {manufacturingInventory.map(item => (
                      <div key={item.id} className="p-3 bg-purple-500/10 rounded-lg">
                        <p className="font-medium">{item.raw_material_name}</p>
                        <p className="text-lg font-bold text-purple-500">{item.quantity} {item.unit}</p>
                        <p className="text-xs text-muted-foreground">{formatPrice(item.quantity * (item.cost_per_unit || 0))}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Manufactured Products */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Factory className="h-5 w-5 text-green-500" />
                  المنتجات المصنعة (الوصفات)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {manufacturedProducts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Factory className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>لا توجد منتجات مصنعة</p>
                    <Button variant="link" onClick={() => setShowAddProductDialog(true)}>
                      إضافة منتج جديد
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {manufacturedProducts.map(product => (
                      <Card key={product.id} className={`${product.quantity <= product.min_quantity ? 'ring-2 ring-red-500' : ''}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <h3 className="font-bold text-lg">{product.name}</h3>
                                <Badge className={product.quantity <= product.min_quantity ? 'bg-red-500/20 text-red-500' : 'bg-green-500/20 text-green-500'}>
                                  {product.quantity} {product.unit}
                                </Badge>
                              </div>
                              
                              <div className="grid grid-cols-3 gap-4 text-sm mb-3">
                                <div>
                                  <p className="text-muted-foreground">تكلفة المواد</p>
                                  <p className="font-bold text-blue-500">{formatPrice(product.raw_material_cost)}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">سعر البيع</p>
                                  <p className="font-bold text-green-500">{formatPrice(product.selling_price)}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">هامش الربح</p>
                                  <p className="font-bold text-primary">{formatPrice(product.profit_margin)}</p>
                                </div>
                              </div>
                              
                              {/* Recipe */}
                              <button
                                onClick={() => setSelectedRecipe(selectedRecipe === product.id ? null : product.id)}
                                className="flex items-center gap-2 text-sm text-primary hover:text-primary/80"
                              >
                                <TreeDeciduous className="h-4 w-4" />
                                <span>الوصفة ({product.recipe?.length || 0} مكونات)</span>
                                {selectedRecipe === product.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </button>
                              
                              {selectedRecipe === product.id && (
                                <div className="mt-2 p-3 bg-muted/30 rounded-lg space-y-1">
                                  {product.recipe?.map((ing, idx) => (
                                    <div key={idx} className="flex items-center justify-between text-sm">
                                      <div className="flex items-center gap-2">
                                        <Beaker className="h-3 w-3 text-purple-500" />
                                        <span>{ing.raw_material_name}</span>
                                      </div>
                                      <span className="text-muted-foreground">{ing.quantity} {ing.unit}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            
                            <Button
                              onClick={() => setShowProduceDialog(product)}
                              className="bg-green-500 hover:bg-green-600"
                            >
                              <Factory className="h-4 w-4 ml-2" />
                              تصنيع
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* الحركات */}
          <TabsContent value="transactions" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowUpCircle className="h-5 w-5 text-primary" />
                  حركات المخزن (واردات/صادرات)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {warehouseTransactions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <ArrowUpCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>لا توجد حركات</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {warehouseTransactions.map(transaction => (
                      <div key={transaction.id} className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {transaction.type === 'incoming' ? (
                              <ArrowDownCircle className="h-5 w-5 text-green-500" />
                            ) : (
                              <ArrowUpCircle className="h-5 w-5 text-red-500" />
                            )}
                            <span className="font-bold">
                              {transaction.type === 'incoming' ? 'وارد' : 'صادر'}
                            </span>
                            {transaction.source && (
                              <Badge variant="outline">{transaction.source}</Badge>
                            )}
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {new Date(transaction.created_at).toLocaleDateString('ar-IQ')}
                          </span>
                        </div>
                        
                        {transaction.supplier_name && (
                          <p className="text-sm text-muted-foreground mb-2">
                            المورد: {transaction.supplier_name}
                          </p>
                        )}
                        
                        <div className="flex flex-wrap gap-2">
                          {transaction.items?.slice(0, 3).map((item, idx) => (
                            <span key={idx} className="px-2 py-1 bg-muted rounded text-sm">
                              {item.name}: {item.quantity} {item.unit}
                            </span>
                          ))}
                          {transaction.items?.length > 3 && (
                            <span className="px-2 py-1 text-sm text-muted-foreground">
                              +{transaction.items.length - 3} أصناف
                            </span>
                          )}
                        </div>
                        
                        {transaction.total_amount > 0 && (
                          <p className="mt-2 font-bold text-primary">
                            الإجمالي: {formatPrice(transaction.total_amount)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* التحويلات */}
          <TabsContent value="transfers" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Send className="h-5 w-5 text-primary" />
                  تحويلات المخزن
                </CardTitle>
              </CardHeader>
              <CardContent>
                {warehouseTransfers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Send className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>لا توجد تحويلات</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {warehouseTransfers.map(transfer => (
                      <div key={transfer.id} className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold">تحويل #{transfer.transfer_number}</span>
                            <Badge className={
                              transfer.status === 'pending' ? 'bg-yellow-500/20 text-yellow-500' :
                              transfer.status === 'received' ? 'bg-green-500/20 text-green-500' :
                              'bg-blue-500/20 text-blue-500'
                            }>
                              {transfer.status === 'pending' ? 'قيد الانتظار' :
                               transfer.status === 'received' ? 'تم الاستلام' : transfer.status}
                            </Badge>
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {new Date(transfer.created_at).toLocaleDateString('ar-IQ')}
                          </span>
                        </div>
                        
                        <p className="text-sm text-muted-foreground mb-2">
                          {transfer.transfer_type === 'warehouse_to_manufacturing' ? 'من المخزن إلى التصنيع' : transfer.transfer_type}
                        </p>
                        
                        <div className="flex flex-wrap gap-2">
                          {transfer.items?.map((item, idx) => (
                            <span key={idx} className="px-2 py-1 bg-purple-500/10 text-purple-500 rounded text-sm">
                              {item.raw_material_name}: {item.quantity} {item.unit}
                            </span>
                          ))}
                        </div>
                        
                        {transfer.total_cost > 0 && (
                          <p className="mt-2 font-bold text-primary">
                            التكلفة: {formatPrice(transfer.total_cost)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Dialog: إضافة مادة خام */}
      <Dialog open={showAddRawMaterial} onOpenChange={setShowAddRawMaterial}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              إضافة مادة خام جديدة
            </DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleAddRawMaterial} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>الاسم *</Label>
                <Input
                  value={rawMaterialForm.name}
                  onChange={(e) => setRawMaterialForm(prev => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label>الاسم بالإنجليزية</Label>
                <Input
                  value={rawMaterialForm.name_en}
                  onChange={(e) => setRawMaterialForm(prev => ({ ...prev, name_en: e.target.value }))}
                />
              </div>
              <div>
                <Label>الوحدة</Label>
                <Select 
                  value={rawMaterialForm.unit} 
                  onValueChange={(v) => setRawMaterialForm(prev => ({ ...prev, unit: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="كغم">كغم</SelectItem>
                    <SelectItem value="غرام">غرام</SelectItem>
                    <SelectItem value="لتر">لتر</SelectItem>
                    <SelectItem value="مل">مل</SelectItem>
                    <SelectItem value="قطعة">قطعة</SelectItem>
                    <SelectItem value="علبة">علبة</SelectItem>
                    <SelectItem value="كرتون">كرتون</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>الكمية</Label>
                <Input
                  type="number"
                  value={rawMaterialForm.quantity}
                  onChange={(e) => setRawMaterialForm(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label>الحد الأدنى</Label>
                <Input
                  type="number"
                  value={rawMaterialForm.min_quantity}
                  onChange={(e) => setRawMaterialForm(prev => ({ ...prev, min_quantity: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label>التكلفة/وحدة</Label>
                <Input
                  type="number"
                  value={rawMaterialForm.cost_per_unit}
                  onChange={(e) => setRawMaterialForm(prev => ({ ...prev, cost_per_unit: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddRawMaterial(false)}>
                إلغاء
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? <RefreshCw className="h-4 w-4 animate-spin ml-2" /> : <Plus className="h-4 w-4 ml-2" />}
                إضافة
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: تحويل للتصنيع */}
      <Dialog open={showTransferDialog} onOpenChange={setShowTransferDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" />
              تحويل مواد لقسم التصنيع
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {transferForm.items.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>لم تتم إضافة مواد</p>
                <p className="text-sm">اضغط على "إضافة للتحويل" من قائمة المواد الخام</p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted/50 px-3 py-2 font-medium text-sm">
                  المواد المختارة ({transferForm.items.length})
                </div>
                <div className="divide-y max-h-64 overflow-y-auto">
                  {transferForm.items.map((item, index) => (
                    <div key={index} className="px-3 py-2 flex items-center justify-between gap-2">
                      <div className="flex-1">
                        <span className="font-medium">{item.raw_material_name}</span>
                        <span className="text-xs text-muted-foreground mr-2">(متوفر: {item.available})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="1"
                          max={item.available}
                          value={item.quantity}
                          onChange={(e) => updateTransferItemQty(index, parseFloat(e.target.value) || 0)}
                          className="w-20 h-8"
                        />
                        <span className="text-sm">{item.unit}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500"
                          onClick={() => removeTransferItem(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div>
              <Label>ملاحظات</Label>
              <Textarea
                value={transferForm.notes}
                onChange={(e) => setTransferForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="ملاحظات اختيارية..."
                rows={2}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransferDialog(false)}>
              إلغاء
            </Button>
            <Button 
              onClick={handleTransferToManufacturing}
              disabled={transferForm.items.length === 0 || submitting}
              className="bg-primary"
            >
              {submitting ? <RefreshCw className="h-4 w-4 animate-spin ml-2" /> : <Send className="h-4 w-4 ml-2" />}
              تحويل للتصنيع
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: إضافة منتج مصنع */}
      <Dialog open={showAddProductDialog} onOpenChange={setShowAddProductDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Factory className="h-5 w-5 text-green-500" />
              إضافة منتج مصنع (وصفة)
            </DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleAddProduct} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>اسم المنتج *</Label>
                <Input
                  value={productForm.name}
                  onChange={(e) => setProductForm(prev => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label>الاسم بالإنجليزية</Label>
                <Input
                  value={productForm.name_en}
                  onChange={(e) => setProductForm(prev => ({ ...prev, name_en: e.target.value }))}
                />
              </div>
              <div>
                <Label>الوحدة</Label>
                <Select 
                  value={productForm.unit} 
                  onValueChange={(v) => setProductForm(prev => ({ ...prev, unit: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="قطعة">قطعة</SelectItem>
                    <SelectItem value="حبة">حبة</SelectItem>
                    <SelectItem value="صحن">صحن</SelectItem>
                    <SelectItem value="كغم">كغم</SelectItem>
                    <SelectItem value="لتر">لتر</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>سعر البيع</Label>
                <Input
                  type="number"
                  value={productForm.selling_price}
                  onChange={(e) => setProductForm(prev => ({ ...prev, selling_price: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>
            
            {/* الوصفة */}
            <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg space-y-3">
              <div className="flex items-center gap-2">
                <Beaker className="h-5 w-5 text-purple-500" />
                <Label className="font-bold">الوصفة (المكونات) *</Label>
              </div>
              
              {manufacturingInventory.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-yellow-500" />
                  <p className="text-sm">لا توجد مواد في قسم التصنيع</p>
                  <p className="text-xs">قم بتحويل مواد من المخزن أولاً</p>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <Select 
                      value={newIngredient.raw_material_id} 
                      onValueChange={(v) => setNewIngredient(prev => ({ ...prev, raw_material_id: v }))}
                    >
                      <SelectTrigger className="flex-1 bg-background">
                        <SelectValue placeholder="اختر مادة خام..." />
                      </SelectTrigger>
                      <SelectContent>
                        {manufacturingInventory.map(material => (
                          <SelectItem key={material.raw_material_id} value={material.raw_material_id}>
                            {material.raw_material_name} ({material.quantity} {material.unit})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="الكمية"
                      value={newIngredient.quantity || ''}
                      onChange={(e) => setNewIngredient(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))}
                      className="w-24 bg-background"
                    />
                    <Button
                      type="button"
                      size="icon"
                      className="bg-green-500 hover:bg-green-600"
                      onClick={addIngredientToRecipe}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  {productForm.recipe.length > 0 ? (
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {productForm.recipe.map((ing, index) => (
                        <div key={index} className="flex items-center justify-between bg-background rounded-lg px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Beaker className="h-4 w-4 text-purple-500" />
                            <span className="font-medium">{ing.raw_material_name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">{ing.quantity} {ing.unit}</span>
                            <span className="text-xs text-primary">({formatPrice(ing.quantity * (ing.cost_per_unit || 0))})</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-red-500"
                              onClick={() => removeIngredientFromRecipe(index)}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center justify-between pt-2 border-t border-purple-500/30">
                        <span className="font-medium">تكلفة الوحدة:</span>
                        <span className="font-bold text-primary">{formatPrice(calculateRecipeCost())}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      لم تتم إضافة مكونات بعد
                    </p>
                  )}
                </>
              )}
            </div>
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddProductDialog(false)}>
                إلغاء
              </Button>
              <Button type="submit" disabled={productForm.recipe.length === 0 || submitting}>
                {submitting ? <RefreshCw className="h-4 w-4 animate-spin ml-2" /> : <Plus className="h-4 w-4 ml-2" />}
                إضافة المنتج
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: تصنيع منتج */}
      <Dialog open={!!showProduceDialog} onOpenChange={() => setShowProduceDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Factory className="h-5 w-5 text-green-500" />
              تصنيع: {showProduceDialog?.name}
            </DialogTitle>
          </DialogHeader>
          
          {showProduceDialog && (
            <div className="space-y-4">
              <div className="p-4 bg-muted/30 rounded-lg">
                <p className="text-sm text-muted-foreground mb-2">المكونات المطلوبة لكل وحدة:</p>
                <div className="space-y-1">
                  {showProduceDialog.recipe?.map((ing, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Beaker className="h-3 w-3 text-purple-500" />
                        <span>{ing.raw_material_name}</span>
                      </div>
                      <span>{ing.quantity} {ing.unit}</span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div>
                <Label>كمية التصنيع</Label>
                <Input
                  type="number"
                  min="1"
                  value={produceQuantity}
                  onChange={(e) => setProduceQuantity(parseInt(e.target.value) || 1)}
                />
              </div>
              
              <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                <p className="text-sm font-medium text-green-500 mb-2">المواد التي سيتم خصمها:</p>
                <div className="space-y-1">
                  {showProduceDialog.recipe?.map((ing, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <span>{ing.raw_material_name}</span>
                      <span className="font-bold">{(ing.quantity * produceQuantity).toFixed(2)} {ing.unit}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProduceDialog(null)}>
              إلغاء
            </Button>
            <Button 
              onClick={handleProduce}
              disabled={submitting}
              className="bg-green-500 hover:bg-green-600"
            >
              {submitting ? <RefreshCw className="h-4 w-4 animate-spin ml-2" /> : <Factory className="h-4 w-4 ml-2" />}
              تصنيع
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: تحويل للفرع */}
      <Dialog open={showBranchTransferDialog} onOpenChange={setShowBranchTransferDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-green-500" />
              تحويل مواد للفرع
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* اختيار الفرع */}
            <div>
              <Label>الفرع المستلم *</Label>
              <Select 
                value={branchTransferForm.to_branch_id} 
                onValueChange={(v) => setBranchTransferForm(prev => ({ ...prev, to_branch_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر الفرع" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map(branch => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* المواد المتاحة */}
            <div>
              <Label className="mb-2 block">المواد الخام المتاحة</Label>
              <div className="border rounded-lg max-h-48 overflow-y-auto p-2">
                {rawMaterials.filter(m => m.quantity > 0).length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">لا توجد مواد متاحة</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {rawMaterials.filter(m => m.quantity > 0).map(material => (
                      <div 
                        key={material.id}
                        className="flex items-center justify-between p-2 bg-muted/50 rounded cursor-pointer hover:bg-muted"
                        onClick={() => addItemToBranchTransfer(material)}
                      >
                        <span className="text-sm">{material.name}</span>
                        <Badge variant="outline">{material.quantity} {material.unit}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* المواد المختارة */}
            {branchTransferForm.items.length > 0 && (
              <div>
                <Label className="mb-2 block">المواد المختارة للتحويل</Label>
                <div className="space-y-2">
                  {branchTransferForm.items.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded">
                      <span className="flex-1 font-medium">{item.raw_material_name}</span>
                      <Input 
                        type="number"
                        min="0.1"
                        step="0.1"
                        max={item.available}
                        value={item.quantity}
                        onChange={(e) => updateBranchTransferQty(idx, e.target.value)}
                        className="w-24"
                      />
                      <span className="text-sm text-muted-foreground">{item.unit}</span>
                      <span className="text-xs text-green-600">(متاح: {item.available})</span>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => removeBranchTransferItem(idx)}
                      >
                        <X className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ملاحظات */}
            <div>
              <Label>ملاحظات</Label>
              <Textarea
                value={branchTransferForm.notes}
                onChange={(e) => setBranchTransferForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="ملاحظات إضافية..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBranchTransferDialog(false)}>
              إلغاء
            </Button>
            <Button 
              onClick={handleTransferToBranch}
              disabled={submitting || branchTransferForm.items.length === 0 || !branchTransferForm.to_branch_id}
              className="bg-green-500 hover:bg-green-600"
            >
              {submitting ? <RefreshCw className="h-4 w-4 animate-spin ml-2" /> : <Send className="h-4 w-4 ml-2" />}
              تحويل للفرع
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
