import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { ScrollArea } from '../components/ui/scroll-area';
import {
  Package,
  Plus,
  Search,
  AlertTriangle,
  Trash2,
  Edit,
  ChefHat,
  Calculator,
  TrendingUp,
  Home,
  Boxes,
  Scale,
  Clock,
  DollarSign,
  Percent,
  AlertCircle,
  Check
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const API = API_URL;

const CATEGORIES = [
  { id: 'meat', name: 'لحوم ودواجن', icon: '🥩' },
  { id: 'seafood', name: 'مأكولات بحرية', icon: '🦐' },
  { id: 'vegetables', name: 'خضروات', icon: '🥬' },
  { id: 'fruits', name: 'فواكه', icon: '🍎' },
  { id: 'dairy', name: 'ألبان وبيض', icon: '🥛' },
  { id: 'grains', name: 'حبوب ونشويات', icon: '🌾' },
  { id: 'spices', name: 'توابل وبهارات', icon: '🌶️' },
  { id: 'oils', name: 'زيوت ودهون', icon: '🫒' },
  { id: 'beverages', name: 'مشروبات', icon: '🥤' },
  { id: 'packaging', name: 'تغليف', icon: '📦' },
  { id: 'general', name: 'عام', icon: '📋' }
];

const UNITS = [
  { id: 'kg', name: 'كيلوغرام', symbol: 'كغ' },
  { id: 'g', name: 'غرام', symbol: 'غ' },
  { id: 'l', name: 'لتر', symbol: 'ل' },
  { id: 'ml', name: 'مليلتر', symbol: 'مل' },
  { id: 'piece', name: 'حبة', symbol: 'حبة' },
  { id: 'box', name: 'علبة', symbol: 'علبة' },
  { id: 'pack', name: 'باكيت', symbol: 'باكيت' }
];

export default function Recipes() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('materials');
  const [materials, setMaterials] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [products, setProducts] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  
  const [materialDialogOpen, setMaterialDialogOpen] = useState(false);
  const [recipeDialogOpen, setRecipeDialogOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState(null);
  
  const [materialForm, setMaterialForm] = useState({
    name: '', name_en: '', unit: 'kg', unit_cost: 0,
    current_stock: 0, min_stock: 0, max_stock: 0, category: 'general'
  });
  
  const [recipeForm, setRecipeForm] = useState({
    product_id: '', ingredients: [], labor_cost: 0,
    overhead_cost: 0, portions: 1, preparation_time: 0, instructions: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      const [materialsRes, recipesRes, productsRes, alertsRes] = await Promise.all([
        axios.get(`${API}/recipes/materials`, { headers }),
        axios.get(`${API}/recipes`, { headers }),
        axios.get(`${API}/products`, { headers }),
        axios.get(`${API}/recipes/alerts/low-stock`, { headers })
      ]);
      
      setMaterials(materialsRes.data);
      setRecipes(recipesRes.data);
      setProducts(productsRes.data);
      setAlerts(alertsRes.data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMaterial = async (e) => {
    e.preventDefault();
    
    if (!materialForm.name || !materialForm.unit) {
      toast.error('الاسم والوحدة مطلوبان');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      if (editingMaterial) {
        await axios.put(`${API}/recipes/materials/${editingMaterial.id}`, materialForm, { headers });
        toast.success('تم تحديث المادة');
      } else {
        await axios.post(`${API}/recipes/materials`, materialForm, { headers });
        toast.success('تم إضافة المادة');
      }
      
      setMaterialDialogOpen(false);
      resetMaterialForm();
      fetchData();
    } catch (error) {
      toast.error('فشل في حفظ المادة');
    }
  };

  const handleDeleteMaterial = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه المادة؟')) return;
    
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API}/recipes/materials/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('تم الحذف');
      fetchData();
    } catch (error) {
      toast.error('فشل في الحذف');
    }
  };

  const handleSaveRecipe = async (e) => {
    e.preventDefault();
    
    if (!recipeForm.product_id || recipeForm.ingredients.length === 0) {
      toast.error('اختر المنتج وأضف المكونات');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/recipes`, recipeForm, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success('تم إنشاء الوصفة');
      setRecipeDialogOpen(false);
      resetRecipeForm();
      fetchData();
    } catch (error) {
      toast.error('فشل في إنشاء الوصفة');
    }
  };

  const handleDeleteRecipe = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه الوصفة؟')) return;
    
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API}/recipes/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('تم الحذف');
      fetchData();
    } catch (error) {
      toast.error('فشل في الحذف');
    }
  };

  const resetMaterialForm = () => {
    setMaterialForm({
      name: '', name_en: '', unit: 'kg', unit_cost: 0,
      current_stock: 0, min_stock: 0, max_stock: 0, category: 'general'
    });
    setEditingMaterial(null);
  };

  const resetRecipeForm = () => {
    setRecipeForm({
      product_id: '', ingredients: [], labor_cost: 0,
      overhead_cost: 0, portions: 1, preparation_time: 0, instructions: ''
    });
  };

  const editMaterial = (material) => {
    setEditingMaterial(material);
    setMaterialForm(material);
    setMaterialDialogOpen(true);
  };

  const addIngredient = () => {
    setRecipeForm({
      ...recipeForm,
      ingredients: [...recipeForm.ingredients, { material_id: '', quantity: 0 }]
    });
  };

  const updateIngredient = (index, field, value) => {
    const newIngredients = [...recipeForm.ingredients];
    newIngredients[index][field] = value;
    setRecipeForm({ ...recipeForm, ingredients: newIngredients });
  };

  const removeIngredient = (index) => {
    const newIngredients = recipeForm.ingredients.filter((_, i) => i !== index);
    setRecipeForm({ ...recipeForm, ingredients: newIngredients });
  };

  const filteredMaterials = materials.filter(m => {
    const matchesSearch = m.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || m.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const getCategoryInfo = (catId) => CATEGORIES.find(c => c.id === catId) || CATEGORIES[10];
  const getUnitSymbol = (unitId) => UNITS.find(u => u.id === unitId)?.symbol || unitId;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
            <Home className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <ChefHat className="h-6 w-6 text-primary" />
              الوصفات والمواد الخام
            </h1>
            <p className="text-sm text-muted-foreground">إدارة المواد الخام ووصفات المنتجات</p>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <Card className="mb-6 border-red-500/30 bg-red-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <div>
                <p className="font-bold text-red-500">تنبيهات المخزون ({alerts.length})</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {alerts.slice(0, 5).map((alert, i) => (
                    <Badge key={i} variant="destructive" className="text-xs">
                      {alert.material_name}: {alert.current_stock} / {alert.min_stock} {alert.unit}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="materials" className="gap-2">
            <Boxes className="h-4 w-4" /> المواد الخام
          </TabsTrigger>
          <TabsTrigger value="recipes" className="gap-2">
            <ChefHat className="h-4 w-4" /> الوصفات
          </TabsTrigger>
        </TabsList>

        {/* Materials Tab */}
        <TabsContent value="materials">
          <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pr-10"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="التصنيف" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                {CATEGORIES.map(cat => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.icon} {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => { resetMaterialForm(); setMaterialDialogOpen(true); }}>
              <Plus className="h-4 w-4 ml-2" /> إضافة مادة
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredMaterials.map((material) => {
              const cat = getCategoryInfo(material.category);
              const isLowStock = material.current_stock <= material.min_stock;
              
              return (
                <Card key={material.id} className={`border-border/50 ${isLowStock ? 'border-red-500/50' : ''}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{cat.icon}</span>
                        <div>
                          <h3 className="font-bold text-foreground">{material.name}</h3>
                          <p className="text-xs text-muted-foreground">{cat.name}</p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => editMaterial(material)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteMaterial(material.id)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">المخزون الحالي:</span>
                        <span className={`font-bold ${isLowStock ? 'text-red-500' : 'text-foreground'}`}>
                          {material.current_stock} {getUnitSymbol(material.unit)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">سعر الوحدة:</span>
                        <span className="text-foreground">{material.unit_cost} د.ع</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">الحد الأدنى:</span>
                        <span className="text-foreground">{material.min_stock} {getUnitSymbol(material.unit)}</span>
                      </div>
                    </div>

                    {isLowStock && (
                      <div className="mt-3 p-2 bg-red-500/10 rounded-lg flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-red-500" />
                        <span className="text-xs text-red-500">المخزون منخفض!</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Recipes Tab */}
        <TabsContent value="recipes">
          <div className="flex justify-end mb-4">
            <Button onClick={() => { resetRecipeForm(); setRecipeDialogOpen(true); }}>
              <Plus className="h-4 w-4 ml-2" /> إنشاء وصفة
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recipes.map((recipe) => (
              <Card key={recipe.id} className="border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-foreground text-lg">{recipe.product_name}</h3>
                      <p className="text-xs text-muted-foreground">{recipe.ingredients?.length} مكون</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteRecipe(recipe.id)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div className="bg-muted/30 rounded-lg p-2 text-center">
                      <DollarSign className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
                      <p className="text-xs text-muted-foreground">التكلفة</p>
                      <p className="font-bold text-foreground">{recipe.final_cost?.toFixed(0)}</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-2 text-center">
                      <TrendingUp className="h-4 w-4 text-green-500 mx-auto mb-1" />
                      <p className="text-xs text-muted-foreground">السعر</p>
                      <p className="font-bold text-foreground">{recipe.selling_price?.toFixed(0)}</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-2 text-center">
                      <Percent className="h-4 w-4 text-primary mx-auto mb-1" />
                      <p className="text-xs text-muted-foreground">الربح</p>
                      <p className="font-bold text-green-500">{recipe.profit_margin?.toFixed(0)}%</p>
                    </div>
                  </div>

                  {recipe.preparation_time > 0 && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span>وقت التحضير: {recipe.preparation_time} دقيقة</span>
                    </div>
                  )}

                  <div className="mt-3 pt-3 border-t border-border/50">
                    <p className="text-xs text-muted-foreground mb-2">المكونات:</p>
                    <div className="flex flex-wrap gap-1">
                      {recipe.ingredients?.slice(0, 5).map((ing, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {ing.material_name}: {ing.quantity} {ing.unit}
                        </Badge>
                      ))}
                      {recipe.ingredients?.length > 5 && (
                        <Badge variant="outline" className="text-xs">
                          +{recipe.ingredients.length - 5} آخر
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {recipes.length === 0 && (
            <Card className="border-border/50">
              <CardContent className="py-12 text-center">
                <ChefHat className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg text-muted-foreground">لا توجد وصفات</p>
                <p className="text-sm text-muted-foreground">أنشئ وصفة لحساب تكاليف منتجاتك</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Material Dialog */}
      <Dialog open={materialDialogOpen} onOpenChange={setMaterialDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {editingMaterial ? 'تعديل مادة خام' : 'إضافة مادة خام'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveMaterial} className="space-y-4">
            <div>
              <Label>اسم المادة *</Label>
              <Input
                value={materialForm.name}
                onChange={(e) => setMaterialForm({ ...materialForm, name: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>الوحدة *</Label>
                <Select
                  value={materialForm.unit}
                  onValueChange={(v) => setMaterialForm({ ...materialForm, unit: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNITS.map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>التصنيف</Label>
                <Select
                  value={materialForm.category}
                  onValueChange={(v) => setMaterialForm({ ...materialForm, category: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>سعر الوحدة (د.ع)</Label>
              <Input
                type="number"
                value={materialForm.unit_cost}
                onChange={(e) => setMaterialForm({ ...materialForm, unit_cost: parseFloat(e.target.value) || 0 })}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>المخزون الحالي</Label>
                <Input
                  type="number"
                  value={materialForm.current_stock}
                  onChange={(e) => setMaterialForm({ ...materialForm, current_stock: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>الحد الأدنى</Label>
                <Input
                  type="number"
                  value={materialForm.min_stock}
                  onChange={(e) => setMaterialForm({ ...materialForm, min_stock: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>الحد الأقصى</Label>
                <Input
                  type="number"
                  value={materialForm.max_stock}
                  onChange={(e) => setMaterialForm({ ...materialForm, max_stock: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setMaterialDialogOpen(false)} className="flex-1">
                إلغاء
              </Button>
              <Button type="submit" className="flex-1">
                {editingMaterial ? 'تحديث' : 'إضافة'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Recipe Dialog */}
      <Dialog open={recipeDialogOpen} onOpenChange={setRecipeDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground">إنشاء وصفة جديدة</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveRecipe} className="space-y-4">
            <div>
              <Label>المنتج *</Label>
              <Select
                value={recipeForm.product_id}
                onValueChange={(v) => setRecipeForm({ ...recipeForm, product_id: v })}
              >
                <SelectTrigger><SelectValue placeholder="اختر المنتج" /></SelectTrigger>
                <SelectContent>
                  {products.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name} - {p.price} د.ع</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>المكونات *</Label>
                <Button type="button" variant="outline" size="sm" onClick={addIngredient}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <ScrollArea className="h-[200px] border rounded-lg p-2">
                {recipeForm.ingredients.map((ing, index) => (
                  <div key={index} className="flex items-center gap-2 mb-2">
                    <Select
                      value={ing.material_id}
                      onValueChange={(v) => updateIngredient(index, 'material_id', v)}
                    >
                      <SelectTrigger className="flex-1"><SelectValue placeholder="المادة" /></SelectTrigger>
                      <SelectContent>
                        {materials.map(m => (
                          <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      placeholder="الكمية"
                      value={ing.quantity}
                      onChange={(e) => updateIngredient(index, 'quantity', parseFloat(e.target.value) || 0)}
                      className="w-24"
                    />
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeIngredient(index)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ))}
                {recipeForm.ingredients.length === 0 && (
                  <p className="text-center text-muted-foreground py-4">أضف المكونات</p>
                )}
              </ScrollArea>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>تكلفة العمالة</Label>
                <Input
                  type="number"
                  value={recipeForm.labor_cost}
                  onChange={(e) => setRecipeForm({ ...recipeForm, labor_cost: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>تكاليف إضافية</Label>
                <Input
                  type="number"
                  value={recipeForm.overhead_cost}
                  onChange={(e) => setRecipeForm({ ...recipeForm, overhead_cost: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>عدد الحصص</Label>
                <Input
                  type="number"
                  value={recipeForm.portions}
                  onChange={(e) => setRecipeForm({ ...recipeForm, portions: parseInt(e.target.value) || 1 })}
                />
              </div>
              <div>
                <Label>وقت التحضير (دقيقة)</Label>
                <Input
                  type="number"
                  value={recipeForm.preparation_time}
                  onChange={(e) => setRecipeForm({ ...recipeForm, preparation_time: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div>
              <Label>تعليمات التحضير</Label>
              <Textarea
                value={recipeForm.instructions}
                onChange={(e) => setRecipeForm({ ...recipeForm, instructions: e.target.value })}
                rows={3}
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setRecipeDialogOpen(false)} className="flex-1">
                إلغاء
              </Button>
              <Button type="submit" className="flex-1">
                إنشاء الوصفة
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
