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
import {
  ArrowRight,
  Package,
  Plus,
  Minus,
  AlertTriangle,
  Search,
  Filter,
  Edit,
  ArrowUpCircle,
  ArrowDownCircle,
  Beaker,
  ChevronDown,
  ChevronUp,
  TreeDeciduous,
  Eye
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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

export default function Inventory() {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  
  const [items, setItems] = useState([]);
  const [finishedProducts, setFinishedProducts] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [itemType, setItemType] = useState('raw');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [transactionDialog, setTransactionDialog] = useState(null);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    name_en: '',
    unit: 'كغم',
    quantity: 0,
    min_quantity: 0,
    cost_per_unit: 0,
    item_type: 'raw',
    recipe: []  // الوصفة للمنتجات النهائية
  });
  const [recipeIngredient, setRecipeIngredient] = useState({
    raw_material_id: '',
    quantity: 0
  });
  const [transactionData, setTransactionData] = useState({
    quantity: 0,
    notes: ''
  });

  useEffect(() => {
    fetchData();
  }, [selectedBranch, itemType]);

  const fetchData = async () => {
    try {
      const [itemsRes, branchesRes, finishedRes, rawRes] = await Promise.all([
        axios.get(`${API}/inventory`, { params: { branch_id: selectedBranch, item_type: itemType } }),
        axios.get(`${API}/branches`),
        axios.get(`${API}/finished-products`),
        axios.get(`${API}/raw-materials`)
      ]);

      setItems(itemsRes.data);
      setBranches(branchesRes.data);
      setFinishedProducts(finishedRes.data || []);
      setRawMaterials(rawRes.data || []);

      if (!selectedBranch && branchesRes.data.length > 0) {
        setSelectedBranch(branchesRes.data[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch inventory:', error);
      toast.error('فشل في تحميل المخزون');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // إذا كان منتج نهائي وله وصفة، استخدم API المنتجات النهائية
      if (formData.item_type === 'finished' && formData.recipe.length > 0) {
        await axios.post(`${API}/finished-products`, {
          name: formData.name,
          name_en: formData.name_en,
          unit: formData.unit,
          quantity: formData.quantity,
          min_quantity: formData.min_quantity,
          selling_price: formData.cost_per_unit,
          recipe: formData.recipe,
          category: 'general'
        });
      } else {
        await axios.post(`${API}/inventory`, {
          ...formData,
          branch_id: selectedBranch
        });
      }
      toast.success('تم إضافة الصنف');
      setDialogOpen(false);
      setFormData({
        name: '',
        name_en: '',
        unit: 'كغم',
        quantity: 0,
        min_quantity: 0,
        cost_per_unit: 0,
        item_type: itemType,
        recipe: []
      });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إضافة الصنف');
    }
  };

  // إضافة مكون للوصفة
  const addIngredientToRecipe = () => {
    if (!recipeIngredient.raw_material_id || recipeIngredient.quantity <= 0) {
      toast.error('اختر مادة خام وحدد الكمية');
      return;
    }

    const material = rawMaterials.find(m => m.id === recipeIngredient.raw_material_id);
    if (!material) return;

    // التحقق من عدم التكرار
    const exists = formData.recipe.find(r => r.raw_material_id === recipeIngredient.raw_material_id);
    if (exists) {
      toast.error('هذه المادة موجودة بالفعل في الوصفة');
      return;
    }

    const newIngredient = {
      raw_material_id: material.id,
      raw_material_name: material.name,
      quantity: recipeIngredient.quantity,
      unit: material.unit,
      cost_per_unit: material.cost_per_unit || 0
    };

    setFormData(prev => ({
      ...prev,
      recipe: [...prev.recipe, newIngredient]
    }));

    setRecipeIngredient({ raw_material_id: '', quantity: 0 });
    toast.success(`تمت إضافة ${material.name}`);
  };

  // حذف مكون من الوصفة
  const removeIngredientFromRecipe = (index) => {
    setFormData(prev => ({
      ...prev,
      recipe: prev.recipe.filter((_, i) => i !== index)
    }));
  };

  // حساب تكلفة الوصفة
  const calculateRecipeCost = () => {
    return formData.recipe.reduce((sum, ing) => sum + (ing.quantity * (ing.cost_per_unit || 0)), 0);
  };

  const handleTransaction = async (type) => {
    try {
      await axios.post(`${API}/inventory/transaction`, {
        inventory_id: transactionDialog.id,
        transaction_type: type,
        quantity: transactionData.quantity,
        notes: transactionData.notes
      });
      toast.success(type === 'in' ? 'تم إضافة الكمية' : 'تم سحب الكمية');
      setTransactionDialog(null);
      setTransactionData({ quantity: 0, notes: '' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في تنفيذ العملية');
    }
  };

  const filteredItems = items.filter(item => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return item.name.toLowerCase().includes(query) || item.name_en?.toLowerCase().includes(query);
    }
    return true;
  });

  const lowStockItems = items.filter(i => i.quantity <= i.min_quantity);
  const totalValue = items.reduce((sum, i) => sum + (i.quantity * i.cost_per_unit), 0);

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
    <div className="min-h-screen bg-background" data-testid="inventory-page">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-border/50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')} data-testid="back-btn">
              <ArrowRight className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold font-cairo text-foreground">إدارة المخزون</h1>
              <p className="text-sm text-muted-foreground">
                {itemType === 'raw' ? 'المواد الخام' : 'المنتجات النهائية'}
              </p>
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

            {hasRole(['admin', 'manager', 'supervisor']) && (
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-primary text-primary-foreground" data-testid="add-item-btn">
                    <Plus className="h-4 w-4 ml-2" />
                    إضافة صنف
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="text-foreground">إضافة صنف جديد</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-foreground">الاسم</Label>
                        <Input
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          required
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-foreground">الاسم بالإنجليزية</Label>
                        <Input
                          value={formData.name_en}
                          onChange={(e) => setFormData({ ...formData, name_en: e.target.value })}
                          className="mt-1"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-foreground">الوحدة</Label>
                        <Select 
                          value={formData.unit} 
                          onValueChange={(v) => setFormData({ ...formData, unit: v })}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="كغم">كغم</SelectItem>
                            <SelectItem value="كيلو">كيلو</SelectItem>
                            <SelectItem value="غرام">غرام</SelectItem>
                            <SelectItem value="لتر">لتر</SelectItem>
                            <SelectItem value="مل">مل</SelectItem>
                            <SelectItem value="قطعة">قطعة</SelectItem>
                            <SelectItem value="حبة">حبة</SelectItem>
                            <SelectItem value="علبة">علبة</SelectItem>
                            <SelectItem value="كرتون">كرتون</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-foreground">النوع</Label>
                        <Select 
                          value={formData.item_type} 
                          onValueChange={(v) => setFormData({ ...formData, item_type: v })}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="raw">مادة خام</SelectItem>
                            <SelectItem value="finished">منتج نهائي</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label className="text-foreground">الكمية</Label>
                        <Input
                          type="number"
                          value={formData.quantity}
                          onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) || 0 })}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-foreground">الحد الأدنى</Label>
                        <Input
                          type="number"
                          value={formData.min_quantity}
                          onChange={(e) => setFormData({ ...formData, min_quantity: parseFloat(e.target.value) || 0 })}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-foreground">التكلفة/وحدة</Label>
                        <Input
                          type="number"
                          value={formData.cost_per_unit}
                          onChange={(e) => setFormData({ ...formData, cost_per_unit: parseFloat(e.target.value) || 0 })}
                          className="mt-1"
                        />
                      </div>
                    </div>
                    
                    {/* قسم الوصفات - للمنتجات النهائية فقط */}
                    {formData.item_type === 'finished' && (
                      <div className="border border-blue-500/30 rounded-lg p-4 bg-blue-500/5">
                        <div className="flex items-center gap-2 mb-3">
                          <Beaker className="h-5 w-5 text-blue-500" />
                          <Label className="text-foreground font-bold">الوصفة (المكونات)</Label>
                        </div>
                        
                        {/* إضافة مكون جديد */}
                        <div className="flex gap-2 mb-3">
                          <Select 
                            value={recipeIngredient.raw_material_id} 
                            onValueChange={(v) => setRecipeIngredient(prev => ({ ...prev, raw_material_id: v }))}
                          >
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder="اختر مادة خام..." />
                            </SelectTrigger>
                            <SelectContent className="max-h-48 overflow-y-auto">
                              {rawMaterials.map(material => (
                                <SelectItem key={material.id} value={material.id}>
                                  <div className="flex items-center justify-between gap-2 w-full">
                                    <span>{material.name}</span>
                                    <span className="text-xs text-muted-foreground">({material.unit})</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            type="number"
                            min="0.01"
                            step="0.01"
                            placeholder="الكمية"
                            value={recipeIngredient.quantity || ''}
                            onChange={(e) => setRecipeIngredient(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))}
                            className="w-24"
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
                        
                        {/* قائمة المكونات المضافة */}
                        {formData.recipe.length > 0 ? (
                          <div className="space-y-2 max-h-40 overflow-y-auto">
                            {formData.recipe.map((ing, index) => (
                              <div 
                                key={index} 
                                className="flex items-center justify-between bg-background rounded-lg px-3 py-2"
                              >
                                <div className="flex items-center gap-2">
                                  <Beaker className="h-4 w-4 text-blue-500" />
                                  <span className="font-medium">{ing.raw_material_name}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-muted-foreground">
                                    {ing.quantity} {ing.unit}
                                  </span>
                                  <span className="text-xs text-primary">
                                    ({formatPrice(ing.quantity * (ing.cost_per_unit || 0))})
                                  </span>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-destructive hover:text-destructive"
                                    onClick={() => removeIngredientFromRecipe(index)}
                                  >
                                    <Minus className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                            {/* إجمالي تكلفة الوصفة */}
                            <div className="flex items-center justify-between pt-2 border-t border-border/50 mt-2">
                              <span className="font-medium">تكلفة الوحدة (محسوبة):</span>
                              <span className="font-bold text-primary">{formatPrice(calculateRecipeCost())}</span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            لم تتم إضافة مكونات بعد. اختر مادة خام وحدد الكمية ثم اضغط +
                          </p>
                        )}
                      </div>
                    )}
                    
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

      <div className="max-w-7xl mx-auto px-6 py-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card className="border-border/50 bg-card">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
                <Package className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">إجمالي الأصناف</p>
                <p className="text-2xl font-bold text-foreground">{items.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-12 h-12 bg-destructive/10 rounded-xl flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">نقص المخزون</p>
                <p className="text-2xl font-bold text-foreground">{lowStockItems.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-12 h-12 bg-green-500/10 rounded-xl flex items-center justify-center">
                <span className="text-lg font-bold text-green-500">د.ع</span>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">قيمة المخزون</p>
                <p className="text-2xl font-bold text-foreground tabular-nums">{formatPrice(totalValue, false)}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs & Search */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <Tabs value={itemType} onValueChange={setItemType} className="flex-1">
            <TabsList>
              <TabsTrigger value="raw">المواد الخام</TabsTrigger>
              <TabsTrigger value="finished">المنتجات النهائية</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative w-64">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="بحث..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-10"
              data-testid="search-input"
            />
          </div>
        </div>

        {/* Low Stock Alert */}
        {lowStockItems.length > 0 && (
          <Card className="border-destructive/50 bg-destructive/5 mb-6">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-destructive mb-2">
                <AlertTriangle className="h-5 w-5" />
                <span className="font-bold">تنبيه نقص المخزون</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {lowStockItems.map(item => (
                  <span key={item.id} className="px-3 py-1 bg-destructive/10 text-destructive rounded-full text-sm">
                    {item.name}: {item.quantity} {item.unit}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Items Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map(item => (
            <Card 
              key={item.id}
              className={`border-border/50 bg-card ${item.quantity <= item.min_quantity ? 'ring-2 ring-destructive' : ''}`}
              data-testid={`item-card-${item.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-foreground">{item.name}</h3>
                    {item.name_en && <p className="text-sm text-muted-foreground">{item.name_en}</p>}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    item.quantity <= item.min_quantity 
                      ? 'bg-destructive/10 text-destructive' 
                      : 'bg-green-500/10 text-green-500'
                  }`}>
                    {item.quantity <= item.min_quantity ? 'نقص' : 'متوفر'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                  <div>
                    <p className="text-muted-foreground">الكمية</p>
                    <p className="text-xl font-bold tabular-nums text-foreground">{item.quantity} <span className="text-sm font-normal">{item.unit}</span></p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">الحد الأدنى</p>
                    <p className="font-medium text-foreground">{item.min_quantity} {item.unit}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">التكلفة/وحدة</p>
                    <p className="font-medium text-foreground">{formatPrice(item.cost_per_unit)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">القيمة الكلية</p>
                    <p className="font-medium text-primary">{formatPrice(item.quantity * item.cost_per_unit)}</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setTransactionDialog({ ...item, type: 'in' })}
                    data-testid={`add-qty-${item.id}`}
                  >
                    <ArrowUpCircle className="h-4 w-4 ml-1 text-green-500" />
                    إضافة
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setTransactionDialog({ ...item, type: 'out' })}
                    data-testid={`remove-qty-${item.id}`}
                  >
                    <ArrowDownCircle className="h-4 w-4 ml-1 text-red-500" />
                    سحب
                  </Button>
                </div>
                
                {/* عرض الوصفة للمنتجات النهائية */}
                {item.item_type === 'finished' && item.recipe && item.recipe.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border/50">
                    <button
                      onClick={() => setSelectedRecipe(selectedRecipe === item.id ? null : item.id)}
                      className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 w-full"
                    >
                      <TreeDeciduous className="h-4 w-4" />
                      <span>شجرة المواد ({item.recipe.length} مكونات)</span>
                      {selectedRecipe === item.id ? <ChevronUp className="h-4 w-4 mr-auto" /> : <ChevronDown className="h-4 w-4 mr-auto" />}
                    </button>
                    {selectedRecipe === item.id && (
                      <div className="mt-2 space-y-1 bg-muted/30 rounded-lg p-2">
                        {item.recipe.map((ing, idx) => (
                          <div key={idx} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <Beaker className="h-3 w-3 text-blue-500" />
                              <span>{ing.raw_material_name}</span>
                            </div>
                            <span className="text-muted-foreground">{ing.quantity} {ing.unit}</span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between text-sm font-medium pt-2 border-t border-border/50 mt-2">
                          <span>تكلفة الوحدة</span>
                          <span className="text-primary">{formatPrice(item.cost_per_unit)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* قسم شجرة المواد - نظرة شاملة */}
        {itemType === 'finished' && finishedProducts.filter(p => p.recipe && p.recipe.length > 0).length > 0 && (
          <Card className="border-border/50 bg-card mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <TreeDeciduous className="h-5 w-5 text-primary" />
                شجرة المواد - نظرة شاملة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {finishedProducts.filter(p => p.recipe && p.recipe.length > 0).map(product => (
                  <div key={product.id} className="border border-border/50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Package className="h-5 w-5 text-primary" />
                        <span className="font-bold text-foreground">{product.name}</span>
                      </div>
                      <span className="text-sm text-muted-foreground">التكلفة: {formatPrice(product.cost_per_unit)}</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                      {product.recipe.map((ing, idx) => (
                        <div key={idx} className="flex items-center gap-2 bg-blue-500/10 text-blue-600 px-3 py-2 rounded-lg text-sm">
                          <Beaker className="h-4 w-4 flex-shrink-0" />
                          <span className="truncate">{ing.raw_material_name}</span>
                          <span className="font-bold mr-auto">{ing.quantity} {ing.unit}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {filteredItems.length === 0 && (
          <Card className="border-border/50 bg-card">
            <CardContent className="py-12 text-center">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">لا توجد أصناف</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Transaction Dialog */}
      <Dialog open={!!transactionDialog} onOpenChange={() => setTransactionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {transactionDialog?.type === 'in' ? 'إضافة كمية' : 'سحب كمية'} - {transactionDialog?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-foreground">الكمية الحالية</Label>
              <p className="text-lg font-bold text-foreground">{transactionDialog?.quantity} {transactionDialog?.unit}</p>
            </div>
            <div>
              <Label className="text-foreground">الكمية</Label>
              <Input
                type="number"
                value={transactionData.quantity}
                onChange={(e) => setTransactionData({ ...transactionData, quantity: parseFloat(e.target.value) || 0 })}
                min="0"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-foreground">ملاحظات</Label>
              <Input
                value={transactionData.notes}
                onChange={(e) => setTransactionData({ ...transactionData, notes: e.target.value })}
                placeholder="سبب العملية..."
                className="mt-1"
              />
            </div>
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setTransactionDialog(null)} className="flex-1">
                إلغاء
              </Button>
              <Button
                onClick={() => handleTransaction(transactionDialog?.type)}
                className={`flex-1 ${transactionDialog?.type === 'in' ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'} text-white`}
                disabled={transactionData.quantity <= 0}
              >
                {transactionDialog?.type === 'in' ? 'إضافة' : 'سحب'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
