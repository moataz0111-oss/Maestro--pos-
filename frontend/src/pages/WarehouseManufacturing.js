import React, { useState, useEffect } from 'react';
import { useTranslation } from '../hooks/useTranslation';
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
  Building2,
  ShoppingCart,
  Bell,
  Box,
  Receipt
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
  const { t, isRTL } = useTranslation();
  
  // تحديد الدور
  const userRole = user?.role || '';
  const isWarehouseKeeper = userRole === 'warehouse_keeper';
  const isManufacturer = userRole === 'manufacturer';
  const isPurchaser = userRole === 'purchaser';
  const isAdmin = userRole === 'admin' || userRole === 'super_admin' || userRole === 'branch_manager';
  
  // تحديد التاب الافتراضي حسب الدور
  const getDefaultTab = () => {
    if (isManufacturer) return 'manufacturing';
    if (isWarehouseKeeper) return 'warehouse';
    return 'warehouse';
  };
  
  const [activeTab, setActiveTab] = useState(getDefaultTab());
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
  const [branchRequests, setBranchRequests] = useState([]);  // طلبات الفروع
  const [manufacturingRequests, setManufacturingRequests] = useState([]);  // طلبات من المخزن
  const [warehouseNotifications, setWarehouseNotifications] = useState([]);  // إشعارات المخزن
  
  // Packaging materials states (مواد التغليف)
  const [packagingMaterials, setPackagingMaterials] = useState([]);
  const [packagingRequests, setPackagingRequests] = useState([]);
  const [showAddPackagingDialog, setShowAddPackagingDialog] = useState(false);
  const [showAddPackagingStockDialog, setShowAddPackagingStockDialog] = useState(null);
  const [packagingForm, setPackagingForm] = useState({
    name: '',
    name_en: '',
    unit: 'قطعة',
    quantity: 0,
    min_quantity: 0,
    cost_per_unit: 0,
    category: ''
  });
  const [showRequestPackagingDialog, setShowRequestPackagingDialog] = useState(false);
  const [packagingRequestItems, setPackagingRequestItems] = useState([]);
  const [packagingRequestNotes, setPackagingRequestNotes] = useState('');
  const [addPackagingStockQuantity, setAddPackagingStockQuantity] = useState(1);
  const [branchPackagingInventory, setBranchPackagingInventory] = useState([]);  // مخزون التغليف في الفرع
  const [showRequestHistoryDialog, setShowRequestHistoryDialog] = useState(false);  // سجل الطلبات
  
  // Dialog states
  const [showAddRawMaterial, setShowAddRawMaterial] = useState(false);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [showBranchTransferDialog, setShowBranchTransferDialog] = useState(false);
  const [showAddProductDialog, setShowAddProductDialog] = useState(false);
  const [showProduceDialog, setShowProduceDialog] = useState(null);
  const [showAddStockDialog, setShowAddStockDialog] = useState(null);  // زيادة كمية المنتج المصنع
  const [showAddRawMaterialStockDialog, setShowAddRawMaterialStockDialog] = useState(null);  // زيادة كمية المادة الخام
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [showRequestMaterialsDialog, setShowRequestMaterialsDialog] = useState(false);  // طلب مواد
  
  // Form states
  const [rawMaterialForm, setRawMaterialForm] = useState({
    name: '',
    name_en: '',
    unit: 'كغم',
    quantity: 0,
    min_quantity: 0,
    cost_per_unit: 0,
    waste_percentage: 0, // نسبة الهدر %
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
    piece_weight: '', // وزن القطعة بالغرام (اختياري)
    piece_weight_unit: 'غرام', // وحدة وزن القطعة
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
  const [addStockQuantity, setAddStockQuantity] = useState(1);  // كمية زيادة المخزون
  const [addRawMaterialStockQuantity, setAddRawMaterialStockQuantity] = useState(1);  // كمية زيادة المادة الخام
  
  // طلبات المواد الخام
  const [materialRequestItems, setMaterialRequestItems] = useState([]);  // قائمة المواد المطلوبة
  const [materialRequestNotes, setMaterialRequestNotes] = useState('');
  const [materialRequestPriority, setMaterialRequestPriority] = useState('normal');
  
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
        branchesRes,
        branchRequestsRes,
        manufacturingRequestsRes,
        notificationsRes,
        packagingRes,
        packagingReqRes,
        branchPkgInvRes
      ] = await Promise.all([
        axios.get(`${API}/raw-materials-new`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/manufacturing-inventory`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/manufactured-products`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/inventory-transfers`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/inventory-transactions`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/inventory-stats`, { headers }).catch(() => ({ data: null })),
        axios.get(`${API}/branches`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/branch-requests`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/manufacturing-requests`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/warehouse-notifications`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/packaging-materials`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/packaging-requests`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/branch-packaging-inventory`, { headers }).catch(() => ({ data: [] }))
      ]);
      
      setRawMaterials(rawRes.data || []);
      setManufacturingInventory(mfgInvRes.data || []);
      setManufacturedProducts(productsRes.data || []);
      setWarehouseTransfers(transfersRes.data || []);
      setWarehouseTransactions(transactionsRes.data || []);
      setStats(statsRes.data);
      setBranches(branchesRes.data || []);
      setBranchRequests(branchRequestsRes.data || []);
      setManufacturingRequests(manufacturingRequestsRes.data || []);
      setWarehouseNotifications(notificationsRes?.data || []);
      setPackagingMaterials(packagingRes.data || []);
      setPackagingRequests(packagingReqRes.data || []);
      setBranchPackagingInventory(branchPkgInvRes?.data || []);
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
      toast.error(t('الرجاء إدخال اسم المادة'));
      return;
    }
    
    setSubmitting(true);
    try {
      await axios.post(`${API}/raw-materials-new`, rawMaterialForm, { headers });
      toast.success(t('تم إضافة المادة الخام'));
      setShowAddRawMaterial(false);
      setRawMaterialForm({
        name: '',
        name_en: '',
        unit: 'كغم',
        quantity: 0,
        min_quantity: 0,
        cost_per_unit: 0,
        waste_percentage: 0,
        category: ''
      });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في إضافة المادة'));
    } finally {
      setSubmitting(false);
    }
  };
  // إضافة صنف للتحويل
  const addItemToTransfer = (material) => {
    const existing = transferForm.items.find(i => i.raw_material_id === material.id);
    if (existing) {
      toast.error(t('هذه المادة موجودة بالفعل'));
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
  
  // ==================== دوال مواد التغليف ====================
  
  // إضافة مادة تغليف جديدة
  const handleAddPackagingMaterial = async (e) => {
    e.preventDefault();
    if (!packagingForm.name) {
      toast.error(t('الرجاء إدخال اسم المادة'));
      return;
    }
    
    setSubmitting(true);
    try {
      await axios.post(`${API}/packaging-materials`, packagingForm, { headers });
      toast.success(t('تمت إضافة مادة التغليف'));
      setShowAddPackagingDialog(false);
      setPackagingForm({
        name: '',
        name_en: '',
        unit: 'قطعة',
        quantity: 0,
        min_quantity: 0,
        cost_per_unit: 0,
        category: ''
      });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في إضافة المادة'));
    } finally {
      setSubmitting(false);
    }
  };
  
  // إضافة كمية لمادة تغليف
  const handleAddPackagingStock = async () => {
    if (!showAddPackagingStockDialog || addPackagingStockQuantity <= 0) {
      toast.error(t('الرجاء إدخال كمية صحيحة'));
      return;
    }
    
    setSubmitting(true);
    try {
      await axios.post(
        `${API}/packaging-materials/${showAddPackagingStockDialog.id}/add-stock?quantity=${addPackagingStockQuantity}`,
        {},
        { headers }
      );
      toast.success(t('تمت إضافة الكمية بنجاح'));
      setShowAddPackagingStockDialog(null);
      setAddPackagingStockQuantity(1);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في إضافة الكمية'));
    } finally {
      setSubmitting(false);
    }
  };
  
  // إضافة صنف لطلب مواد التغليف
  const addItemToPackagingRequest = (material) => {
    const existing = packagingRequestItems.find(i => i.packaging_material_id === material.id);
    if (existing) {
      toast.error(t('هذه المادة موجودة بالفعل'));
      return;
    }
    
    setPackagingRequestItems(prev => [...prev, {
      packaging_material_id: material.id,
      name: material.name,
      quantity: 1,
      unit: material.unit
    }]);
  };
  
  // تحديث كمية صنف في طلب التغليف
  const updatePackagingRequestItemQty = (index, qty) => {
    setPackagingRequestItems(prev => {
      const items = [...prev];
      items[index].quantity = qty;
      return items;
    });
  };
  
  // حذف صنف من طلب التغليف
  const removePackagingRequestItem = (index) => {
    setPackagingRequestItems(prev => prev.filter((_, i) => i !== index));
  };
  
  // إرسال طلب مواد تغليف
  const handleSubmitPackagingRequest = async () => {
    if (packagingRequestItems.length === 0) {
      toast.error(t('الرجاء إضافة مواد للطلب'));
      return;
    }
    
    setSubmitting(true);
    try {
      await axios.post(`${API}/packaging-requests`, {
        items: packagingRequestItems,
        priority: 'normal',
        notes: packagingRequestNotes
      }, { headers });
      
      toast.success(t('تم إرسال الطلب بنجاح'));
      setShowRequestPackagingDialog(false);
      setPackagingRequestItems([]);
      setPackagingRequestNotes('');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في إرسال الطلب'));
    } finally {
      setSubmitting(false);
    }
  };
  
  // الموافقة على طلب تغليف
  const handleApprovePackagingRequest = async (requestId) => {
    try {
      await axios.post(`${API}/packaging-requests/${requestId}/approve`, {}, { headers });
      toast.success(t('تمت الموافقة على الطلب'));
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في الموافقة'));
    }
  };
  
  // تحويل مواد التغليف للفرع
  const handleTransferPackagingRequest = async (requestId) => {
    try {
      await axios.post(`${API}/packaging-requests/${requestId}/transfer`, {}, { headers });
      toast.success(t('تم تحويل المواد للفرع بنجاح'));
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في التحويل'));
    }
  };
  
  // ==================== نهاية دوال مواد التغليف ====================

  // تحويل للتصنيع
  const handleTransferToManufacturing = async () => {
    if (transferForm.items.length === 0) {
      toast.error(t('الرجاء إضافة مواد للتحويل'));
      return;
    }
    
    // التحقق من الكميات
    for (const item of transferForm.items) {
      if (item.quantity > item.available) {
        toast.error(t('الكمية المطلوبة أكبر من المتوفر'));
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
      
      toast.success(t('تم التحويل لقسم التصنيع بنجاح'));
      setShowTransferDialog(false);
      setTransferForm({ items: [], notes: '' });
      fetchData();
    } catch (error) {
      const detail = error.response?.data?.detail;
      if (typeof detail === 'object' && detail.insufficient_materials) {
        toast.error(t('مواد غير كافية'));
      } else {
        toast.error(detail || t('فشل في التحويل'));
      }
    } finally {
      setSubmitting(false);
    }
  };
  // إضافة صنف لتحويل الفرع
  const addItemToBranchTransfer = (product) => {
    const existing = branchTransferForm.items.find(i => i.product_id === product.id);
    if (existing) {
      toast.info(t('هذا المنتج موجود بالفعل'));
      return;
    }
    setBranchTransferForm(prev => ({
      ...prev,
      items: [...prev.items, {
        product_id: product.id,
        product_name: product.name,
        quantity: 1,
        unit: product.unit || 'قطعة',
        available: product.quantity
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
      toast.error(t('الرجاء اختيار الفرع'));
      return;
    }
    if (branchTransferForm.items.length === 0) {
      toast.error(t('الرجاء إضافة منتجات للتحويل'));
      return;
    }
    
    // التحقق من الكميات
    for (const item of branchTransferForm.items) {
      if (item.quantity <= 0) {
        toast.error(t('الكمية يجب أن تكون أكبر من صفر'));
        return;
      }
      if (item.quantity > item.available) {
        toast.error(t('الكمية المطلوبة أكبر من المتاح'));
        return;
      }
    }
    
    setSubmitting(true);
    try {
      await axios.post(`${API}/warehouse-transfers`, {
        transfer_type: 'manufacturing_to_branch',
        to_branch_id: branchTransferForm.to_branch_id,
        items: branchTransferForm.items.map(i => ({
          product_id: i.product_id,
          quantity: i.quantity
        })),
        notes: branchTransferForm.notes
      }, { headers });
      
      toast.success(t('تم التحويل للفرع بنجاح'));
      setShowBranchTransferDialog(false);
      setBranchTransferForm({ to_branch_id: '', items: [], notes: '' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في التحويل'));
    } finally {
      setSubmitting(false);
    }
  };
  
  // تنفيذ طلب فرع
  const handleFulfillRequest = async (requestId) => {
    try {
      setSubmitting(true);
      await axios.post(`${API}/branch-requests/${requestId}/fulfill`, {}, { headers });
      toast.success(t('تم تنفيذ الطلب وتحويل المنتجات للفرع'));
      fetchData();
    } catch (error) {
      const detail = error.response?.data?.detail;
      if (typeof detail === 'object' && detail.insufficient_products) {
        const products = detail.insufficient_products.map(p => `${p.name}: طلب ${p.requested} متوفر ${p.available}`).join('\n');
        toast.error(`${t('كمية غير كافية')}\n${products}`);
      } else {
        toast.error(detail || t('فشل في تنفيذ الطلب'));
      }
    } finally {
      setSubmitting(false);
    }
  };
  
  // إضافة مكون للوصفة
  const addIngredientToRecipe = () => {
    if (!newIngredient.raw_material_id || newIngredient.quantity <= 0) {
      toast.error(t('اختر مادة خام وحدد الكمية'));
      return;
    }
    
    // البحث في مخزون التصنيع
    const material = manufacturingInventory.find(m => m.raw_material_id === newIngredient.raw_material_id);
    if (!material) {
      toast.error(t('المادة غير موجودة في مخزون التصنيع'));
      return;
    }
    
    const exists = productForm.recipe.find(r => r.raw_material_id === newIngredient.raw_material_id);
    if (exists) {
      toast.error(t('هذه المادة موجودة بالفعل في الوصفة'));
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
      toast.error(t('الرجاء إدخال اسم المنتج وإضافة الوصفة'));
      return;
    }
    
    setSubmitting(true);
    try {
      await axios.post(`${API}/manufactured-products`, productForm, { headers });
      toast.success(t('تم إضافة المنتج المصنع'));
      setShowAddProductDialog(false);
      setProductForm({
        name: '',
        name_en: '',
        unit: 'قطعة',
        piece_weight: '',
        piece_weight_unit: 'غرام',
        recipe: [],
        quantity: 0,
        min_quantity: 0,
        selling_price: 0,
        category: ''
      });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في إضافة المنتج'));
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
      toast.success(t('تم التصنيع بنجاح'));
      setShowProduceDialog(null);
      setProduceQuantity(1);
      fetchData();
    } catch (error) {
      const detail = error.response?.data?.detail;
      if (typeof detail === 'object' && detail.insufficient_materials) {
        toast.error(t('مواد غير كافية'));
      } else {
        toast.error(detail || t('فشل في التصنيع'));
      }
    } finally {
      setSubmitting(false);
    }
  };
  
  // زيادة كمية المنتج مباشرة (بدون خصم مواد)
  const handleAddStock = async () => {
    if (!showAddStockDialog || addStockQuantity <= 0) return;
    
    setSubmitting(true);
    try {
      await axios.post(`${API}/manufactured-products/${showAddStockDialog.id}/add-stock?quantity=${addStockQuantity}`, {}, { headers });
      toast.success(t('تم زيادة الكمية بنجاح'));
      setShowAddStockDialog(null);
      setAddStockQuantity(1);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في زيادة الكمية'));
    } finally {
      setSubmitting(false);
    }
  };
  
  // زيادة كمية المادة الخام مباشرة
  const handleAddRawMaterialStock = async () => {
    if (!showAddRawMaterialStockDialog || addRawMaterialStockQuantity <= 0) return;
    
    setSubmitting(true);
    try {
      await axios.post(`${API}/raw-materials-new/${showAddRawMaterialStockDialog.id}/add-stock?quantity=${addRawMaterialStockQuantity}`, {}, { headers });
      toast.success(t('تم زيادة الكمية بنجاح'));
      setShowAddRawMaterialStockDialog(null);
      setAddRawMaterialStockQuantity(1);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في زيادة الكمية'));
    } finally {
      setSubmitting(false);
    }
  };
  
  // إضافة مادة لقائمة الطلب
  const addMaterialToRequest = (material) => {
    const existing = materialRequestItems.find(item => item.material_id === material.id);
    if (existing) {
      setMaterialRequestItems(prev => prev.map(item =>
        item.material_id === material.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setMaterialRequestItems(prev => [...prev, {
        material_id: material.id,
        material_name: material.name,
        unit: material.unit,
        quantity: 1,
        available_quantity: material.quantity,
        cost_per_unit: material.cost_per_unit
      }]);
    }
    toast.success(t('تم إضافة') + ` ${material.name}` + t('للطلب'));
  };
  
  // حذف مادة من قائمة الطلب
  const removeMaterialFromRequest = (materialId) => {
    setMaterialRequestItems(prev => prev.filter(item => item.material_id !== materialId));
  };
  
  // إرسال طلب المواد الخام (من التصنيع للمخزن)
  const handleSubmitMaterialRequest = async () => {
    if (materialRequestItems.length === 0) {
      toast.error(t('يجب إضافة مواد للطلب'));
      return;
    }
    
    setSubmitting(true);
    try {
      const userData = JSON.parse(localStorage.getItem('user') || '{}');
      await axios.post(`${API}/manufacturing-requests`, {
        items: materialRequestItems.map(item => ({
          material_id: item.material_id,
          quantity: item.quantity
        })),
        priority: materialRequestPriority,
        notes: materialRequestNotes,
        requested_by: userData.id,
        requested_by_name: userData.name || userData.email
      }, { headers });
      
      toast.success(t('تم إرسال طلب المواد بنجاح'));
      setShowRequestMaterialsDialog(false);
      setMaterialRequestItems([]);
      setMaterialRequestNotes('');
      setMaterialRequestPriority('normal');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في إرسال الطلب'));
    } finally {
      setSubmitting(false);
    }
  };
  
  // تنفيذ طلب المواد من المخزن
  const handleFulfillManufacturingRequest = async (requestId) => {
    setSubmitting(true);
    try {
      await axios.post(`${API}/manufacturing-requests/${requestId}/fulfill`, {}, { headers });
      toast.success(t('تم تنفيذ الطلب وتحويل المواد للتصنيع'));
      fetchData();
    } catch (error) {
      const detail = error.response?.data?.detail;
      if (typeof detail === 'object' && detail.insufficient_materials) {
        const materials = detail.insufficient_materials.map(m => `${m.name}: طلب ${m.needed} متوفر ${m.available}`).join('\n');
        toast.error(t('مواد غير كافية') + ':\n' + materials);
      } else {
        toast.error(detail || t('فشل في تنفيذ الطلب'));
      }
    } finally {
      setSubmitting(false);
    }
  };
  
  // رفض طلب
  const handleRejectManufacturingRequest = async (requestId) => {
    setSubmitting(true);
    try {
      await axios.patch(`${API}/manufacturing-requests/${requestId}/status`, null, {
        headers,
        params: { status: 'rejected' }
      });
      toast.success(t('تم رفض الطلب'));
      fetchData();
    } catch (error) {
      toast.error(t('فشل في رفض الطلب'));
    } finally {
      setSubmitting(false);
    }
  };
  
  // استلام مشتريات من إشعار
  const handleReceiveFromNotification = async (notificationId) => {
    setSubmitting(true);
    try {
      await axios.post(`${API}/warehouse-notifications/${notificationId}/receive`, {}, { headers });
      toast.success(t('تم استلام المشتريات وإضافتها للمخزن'));
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في استلام المشتريات'));
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
                {t('المخزن والتصنيع')}
              </h1>
              <p className="text-xs text-muted-foreground">{t('إدارة المواد الخام والمنتجات المصنعة')}</p>
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
                  {t('تحويل للتصنيع')}
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => navigate('/purchases-new')}
                  className="border-blue-500 text-blue-600 hover:bg-blue-50"
                  data-testid="purchase-request-btn"
                >
                  <Truck className="h-4 w-4 ml-2" />
                  {t('طلب من المشتريات')}
                </Button>
                <Button 
                  onClick={() => setShowAddRawMaterial(true)}
                  className="bg-primary"
                  data-testid="add-material-btn"
                >
                  <Plus className="h-4 w-4 ml-2" />
                  {t('مادة خام')}
                </Button>
              </>
            )}
            {activeTab === 'manufacturing' && (
              <>
                <Button 
                  variant="outline"
                  onClick={() => setShowBranchTransferDialog(true)}
                  className="border-green-500 text-green-600 hover:bg-green-50"
                  data-testid="branch-transfer-btn"
                >
                  <Building2 className="h-4 w-4 ml-2" />
                  {t('تحويل للفرع')}
                </Button>
                <Button 
                  onClick={() => setShowAddProductDialog(true)}
                  className="bg-primary"
                  data-testid="add-product-btn"
                >
                  <Plus className="h-4 w-4 ml-2" />
                  {t('منتج مصنع')}
                </Button>
              </>
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
                    <p className="text-sm text-muted-foreground">{t('المواد الخام')}</p>
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
                    <p className="text-sm text-muted-foreground">{t('مخزون التصنيع')}</p>
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
                    <p className="text-sm text-muted-foreground">{t('المنتجات المصنعة')}</p>
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
                    <p className="text-sm text-muted-foreground">{t('نقص المخزون')}</p>
                    <p className="text-2xl font-bold">
                      {(stats.raw_materials?.low_stock_count || 0) + (stats.manufactured_products?.low_stock_count || 0)}
                    </p>
                    <p className="text-xs text-red-500">{t('أصناف تحتاج إعادة تعبئة')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex flex-wrap gap-2 h-auto p-2 bg-muted/50 rounded-lg w-full justify-start">
            {/* تاب المخزن - للمدير وأمين المخزن فقط */}
            {(isAdmin || isWarehouseKeeper) && (
              <TabsTrigger value="warehouse" className="gap-2 px-4 py-2" data-testid="tab-warehouse">
                <Warehouse className="h-4 w-4" />
                {t('المخزن')}
              </TabsTrigger>
            )}
            {/* تاب طلبات التصنيع - للمدير وأمين المخزن (يرون الطلبات الواردة) */}
            {(isAdmin || isWarehouseKeeper) && (
              <TabsTrigger value="mfg-requests" className="gap-2 px-4 py-2 relative" data-testid="tab-mfg-requests">
                <BoxSelect className="h-4 w-4" />
                {t('طلبات التصنيع')}
                {manufacturingRequests.filter(r => r.status === 'pending').length > 0 && (
                  <Badge className="absolute -top-2 -right-2 bg-orange-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                    {manufacturingRequests.filter(r => r.status === 'pending').length}
                  </Badge>
                )}
              </TabsTrigger>
            )}
            {/* تاب الورقيات/التغليف - للمدير وأمين المخزن فقط */}
            {(isAdmin || isWarehouseKeeper) && (
              <TabsTrigger value="packaging" className="gap-2 px-4 py-2 relative" data-testid="tab-packaging">
                <Box className="h-4 w-4" />
                {t('الورقيات')}
                {packagingRequests.filter(r => r.status === 'pending').length > 0 && (
                  <Badge className="absolute -top-2 -right-2 bg-amber-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                    {packagingRequests.filter(r => r.status === 'pending').length}
                  </Badge>
                )}
              </TabsTrigger>
            )}
            {/* تاب التصنيع - للمدير ومسؤول التصنيع */}
            {(isAdmin || isManufacturer) && (
              <TabsTrigger value="manufacturing" className="gap-2 px-4 py-2" data-testid="tab-manufacturing">
                <Factory className="h-4 w-4" />
                {t('التصنيع')}
              </TabsTrigger>
            )}
            {/* تاب طلبات الفروع - للمدير ومسؤول التصنيع */}
            {(isAdmin || isManufacturer) && (
              <TabsTrigger value="branch-requests" className="gap-2 px-4 py-2 relative" data-testid="tab-branch-requests">
                <Building2 className="h-4 w-4" />
                {t('طلبات الفروع')}
                {branchRequests.filter(r => r.status === 'pending').length > 0 && (
                  <Badge className="absolute -top-2 -right-2 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                    {branchRequests.filter(r => r.status === 'pending').length}
                  </Badge>
                )}
              </TabsTrigger>
            )}
            {/* تاب الحركات - للجميع */}
            {(isAdmin || isWarehouseKeeper) && (
              <TabsTrigger value="transactions" className="gap-2 px-4 py-2" data-testid="tab-transactions">
                <ArrowUpCircle className="h-4 w-4" />
                {t('الحركات')}
              </TabsTrigger>
            )}
            {/* تاب التحويلات - للمدير وأمين المخزن */}
            {(isAdmin || isWarehouseKeeper || isManufacturer) && (
              <TabsTrigger value="transfers" className="gap-2 px-4 py-2" data-testid="tab-transfers">
                <Send className="h-4 w-4" />
                {t('التحويلات')}
              </TabsTrigger>
            )}
          </TabsList>
          {/* المخزن (المواد الخام) */}
          <TabsContent value="warehouse" className="space-y-4">
            {/* زر طلب شراء جديد */}
            {(isAdmin || isWarehouseKeeper) && (
              <Card className="border-green-500/30 bg-green-500/5">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <ShoppingCart className="h-8 w-8 text-green-500" />
                      <div>
                        <h3 className="font-bold">{t('طلب شراء جديد')}</h3>
                        <p className="text-sm text-muted-foreground">{t('إنشاء طلب شراء مواد خام من المشتريات')}</p>
                      </div>
                    </div>
                    <Button
                      onClick={() => navigate('/purchasing')}
                      className="bg-green-500 hover:bg-green-600"
                      data-testid="go-to-purchasing-btn"
                    >
                      <ShoppingCart className="h-4 w-4 ml-2" />
                      {t('المشتريات')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
            
            {/* إشعارات المشتريات الجاهزة للاستلام */}
            {warehouseNotifications.filter(n => n.status === 'unread' && n.type === 'purchase_delivery').length > 0 && (
              <Card className="border-green-500 bg-green-500/5">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Bell className="h-5 w-5 text-green-500 animate-bounce" />
                    <span className="font-bold text-green-600">{t('مشتريات جاهزة للاستلام')}</span>
                    <Badge className="bg-green-500 text-white">{warehouseNotifications.filter(n => n.status === 'unread' && n.type === 'purchase_delivery').length}</Badge>
                  </div>
                  <div className="space-y-3">
                    {warehouseNotifications.filter(n => n.status === 'unread' && n.type === 'purchase_delivery').map(notification => (
                      <div key={notification.id} className="p-3 bg-background rounded-lg border border-green-500/30">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium">{notification.title}</p>
                            <p className="text-sm text-muted-foreground">{notification.message}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Date(notification.created_at).toLocaleDateString('ar-EG', {
                                year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                              })}
                            </p>
                          </div>
                          <Button 
                            onClick={() => handleReceiveFromNotification(notification.id)}
                            className="bg-green-500 hover:bg-green-600"
                            disabled={submitting}
                            size="sm"
                          >
                            {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4 ml-1" />}
                            {t('استلام')}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            
            {/* Low Stock Alert */}
            {lowStockMaterials.length > 0 && (
              <Card className="border-red-500/50 bg-red-500/5">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-red-500 mb-2">
                    <AlertTriangle className="h-5 w-5" />
                    <span className="font-bold">{t('تنبيه نقص المخزون')}</span>
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
                placeholder={t('بحث...')}
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
                  className={`hover:shadow-md transition-shadow ${material.quantity <= material.min_quantity ? 'ring-2 ring-red-500 animate-pulse' : ''}`}
                  data-testid={`material-${material.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-bold">{material.name}</h3>
                        {material.name_en && <p className="text-sm text-muted-foreground">{material.name_en}</p>}
                      </div>
                      <div className="flex flex-col gap-1 items-end">
                        <Badge className={material.quantity <= material.min_quantity ? 'bg-red-500/20 text-red-500' : 'bg-green-500/20 text-green-500'}>
                          {material.quantity <= material.min_quantity ? t('نقص') : t('متوفر')}
                        </Badge>
                        {material.quantity <= material.min_quantity && (
                          <span className="text-xs text-red-500 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {t('أقل من الحد الأدنى')}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {/* إحصائيات المخزون */}
                    <div className="grid grid-cols-3 gap-2 p-2 bg-muted/30 rounded-lg mb-3">
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">{t('إجمالي الوارد')}</p>
                        <p className="font-bold text-purple-500">{material.total_received || material.quantity || 0}</p>
                      </div>
                      <div className="text-center border-x border-muted">
                        <p className="text-xs text-muted-foreground">{t('المحول للتصنيع')}</p>
                        <p className="font-bold text-blue-500">{material.transferred_to_manufacturing || 0}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">{t('المتبقي')}</p>
                        <p className="font-bold text-green-500">{material.quantity || 0}</p>
                      </div>
                    </div>
                    
                    {/* شريط التقدم */}
                    {(material.total_received || 0) > 0 && (
                      <div className="mb-3">
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${material.quantity <= material.min_quantity ? 'bg-gradient-to-r from-red-500 to-orange-500' : 'bg-gradient-to-r from-blue-500 to-green-500'}`}
                            style={{ width: `${Math.min(100, ((material.quantity || 0) / (material.total_received || 1)) * 100)}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground text-center mt-1">
                          {Math.round(((material.quantity || 0) / (material.total_received || 1)) * 100)}% {t('متبقي من الوارد')}
                        </p>
                      </div>
                    )}
                    
                    <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                      <div>
                        <p className="text-muted-foreground">{t('الكمية')}</p>
                        <p className="text-lg font-bold">{material.quantity} {material.unit}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{t('الحد الأدنى')}</p>
                        <p className="font-medium">{material.min_quantity} {material.unit}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{t('التكلفة/وحدة')}</p>
                        <p className="font-medium">{formatPrice(material.cost_per_unit)}</p>
                      </div>
                      {material.waste_percentage > 0 && (
                        <div>
                          <p className="text-muted-foreground">{t('نسبة الهدر')}</p>
                          <p className="font-medium text-orange-500">{material.waste_percentage}%</p>
                        </div>
                      )}
                      {material.effective_cost_per_unit > 0 && material.effective_cost_per_unit !== material.cost_per_unit && (
                        <div>
                          <p className="text-muted-foreground">{t('التكلفة الفعلية')}</p>
                          <p className="font-medium text-orange-600">{formatPrice(material.effective_cost_per_unit)}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-muted-foreground">{t('القيمة الكلية')}</p>
                        <p className="font-medium text-primary">{formatPrice(material.total_value || material.quantity * material.cost_per_unit)}</p>
                      </div>
                    </div>
                    
                    {/* أزرار الإجراءات */}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => addItemToTransfer(material)}
                      >
                        <Send className="h-4 w-4 ml-2" />
                        {t('إضافة للتحويل')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-purple-500 text-purple-600 hover:bg-purple-50"
                        onClick={() => setShowAddRawMaterialStockDialog(material)}
                        data-testid="add-raw-material-stock-btn"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              
              {filteredRawMaterials.length === 0 && (
                <Card className="col-span-full">
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>{t('لا توجد مواد خام')}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
          
          {/* طلبات التصنيع (الواردة من التصنيع للمخزن) */}
          <TabsContent value="mfg-requests" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BoxSelect className="h-5 w-5 text-orange-500" />
                  {t('طلبات المواد الخام الواردة من التصنيع')}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {t('هذه الطلبات وردت من قسم التصنيع وتحتاج لتنفيذها من المخزن')}
                </p>
              </CardHeader>
              <CardContent>
                {manufacturingRequests.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <BoxSelect className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>{t('لا توجد طلبات واردة من التصنيع')}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {manufacturingRequests.map(request => (
                      <div key={request.id} className={`p-4 border rounded-lg ${request.status === 'pending' ? 'border-orange-500 bg-orange-500/5' : request.status === 'fulfilled' ? 'border-green-500 bg-green-500/5' : 'border-gray-300'}`}>
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-lg">{t('طلب')} #{request.request_number}</span>
                            <Badge className={
                              request.status === 'pending' ? 'bg-orange-500/20 text-orange-500' :
                              request.status === 'fulfilled' ? 'bg-green-500/20 text-green-500' :
                              request.status === 'rejected' ? 'bg-red-500/20 text-red-500' :
                              'bg-gray-500/20 text-gray-500'
                            }>
                              {request.status === 'pending' ? t('بانتظار التنفيذ') :
                               request.status === 'fulfilled' ? t('تم التنفيذ') :
                               request.status === 'rejected' ? t('مرفوض') : request.status}
                            </Badge>
                            {request.priority === 'urgent' && (
                              <Badge className="bg-red-500 text-white">{t('مستعجل')}</Badge>
                            )}
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {new Date(request.created_at).toLocaleDateString('ar-EG', {
                              year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                            })}
                          </span>
                        </div>
                        
                        {request.requested_by_name && (
                          <p className="text-sm text-muted-foreground mb-2">
                            {t('طلب بواسطة')}: <span className="font-medium">{request.requested_by_name}</span>
                          </p>
                        )}
                        
                        {/* المواد المطلوبة */}
                        <div className="bg-muted/30 rounded-lg p-3 mb-3">
                          <p className="text-sm font-medium mb-2">{t('المواد المطلوبة')}:</p>
                          <div className="space-y-1">
                            {request.items?.map((item, idx) => (
                              <div key={idx} className="flex items-center justify-between text-sm">
                                <span>{item.material_name}</span>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{item.quantity} {item.unit}</span>
                                  {item.available_quantity !== undefined && (
                                    <span className={`text-xs ${item.available_quantity >= item.quantity ? 'text-green-500' : 'text-red-500'}`}>
                                      ({t('متوفر')}: {item.available_quantity})
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="border-t mt-2 pt-2 flex justify-between font-bold">
                            <span>{t('إجمالي التكلفة')}</span>
                            <span className="text-primary">{formatPrice(request.total_cost || 0)}</span>
                          </div>
                        </div>
                        
                        {request.notes && (
                          <p className="text-sm bg-muted/20 p-2 rounded mb-3">
                            <span className="font-medium">{t('ملاحظات')}: </span>{request.notes}
                          </p>
                        )}
                        
                        {/* أزرار الإجراءات */}
                        {request.status === 'pending' && (
                          <div className="flex gap-2">
                            <Button
                              onClick={() => handleFulfillManufacturingRequest(request.id)}
                              className="flex-1 bg-green-500 hover:bg-green-600"
                              disabled={submitting}
                            >
                              {submitting ? <RefreshCw className="h-4 w-4 animate-spin ml-2" /> : <CheckCircle className="h-4 w-4 ml-2" />}
                              {t('تنفيذ وتحويل للتصنيع')}
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => handleRejectManufacturingRequest(request.id)}
                              className="border-red-500 text-red-500 hover:bg-red-50"
                              disabled={submitting}
                            >
                              <X className="h-4 w-4 ml-2" />
                              {t('رفض')}
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* الورقيات/التغليف */}
          <TabsContent value="packaging" className="space-y-4">
            {/* زر إضافة مادة تغليف جديدة */}
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Box className="h-8 w-8 text-amber-500" />
                    <div>
                      <h3 className="font-bold">{t('مواد التغليف والورقيات')}</h3>
                      <p className="text-sm text-muted-foreground">{t('إدارة الأكياس والعلب والورق')}</p>
                    </div>
                  </div>
                  <Button
                    onClick={() => setShowAddPackagingDialog(true)}
                    className="bg-amber-500 hover:bg-amber-600"
                    data-testid="add-packaging-btn"
                  >
                    <Plus className="h-4 w-4 ml-2" />
                    {t('إضافة صنف')}
                  </Button>
                </div>
              </CardContent>
            </Card>
            
            {/* طلبات مواد التغليف المعلقة */}
            {packagingRequests.filter(r => r.status === 'pending').length > 0 && (
              <Card className="border-orange-500/50 bg-orange-500/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-orange-600">
                    <Bell className="h-5 w-5" />
                    {t('طلبات تغليف جديدة')} ({packagingRequests.filter(r => r.status === 'pending').length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {packagingRequests.filter(r => r.status === 'pending').map(request => (
                      <div key={request.id} className="p-4 bg-background rounded-lg border">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <p className="font-bold">#{request.request_number}</p>
                            <p className="text-sm text-muted-foreground">{request.from_branch_name || t('فرع غير محدد')}</p>
                            <p className="text-xs text-muted-foreground">{new Date(request.created_at).toLocaleString('ar-IQ')}</p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleApprovePackagingRequest(request.id)}
                              className="text-green-600 border-green-600"
                            >
                              <CheckCircle className="h-4 w-4 ml-1" />
                              {t('موافقة')}
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleTransferPackagingRequest(request.id)}
                              className="bg-amber-500 hover:bg-amber-600"
                            >
                              <Send className="h-4 w-4 ml-1" />
                              {t('تحويل')}
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {request.items?.map((item, idx) => (
                            <div key={idx} className="p-2 bg-amber-500/10 rounded text-sm">
                              <p className="font-medium">{item.name}</p>
                              <p className="text-muted-foreground">{item.quantity} {item.unit}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            
            {/* قائمة مواد التغليف */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Box className="h-5 w-5 text-amber-500" />
                  {t('مخزون مواد التغليف')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {packagingMaterials.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Box className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>{t('لا توجد مواد تغليف')}</p>
                    <p className="text-sm">{t('اضغط على "إضافة صنف" لإضافة مادة جديدة')}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {packagingMaterials.map(material => (
                      <div key={material.id} className="p-4 bg-muted/30 rounded-lg border hover:border-amber-500/50 transition-colors">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold">{material.name}</h4>
                              {material.name_en && <span className="text-sm text-muted-foreground">({material.name_en})</span>}
                              {material.category && (
                                <Badge variant="outline" className="text-xs">{material.category}</Badge>
                              )}
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
                              <div>
                                <p className="text-xs text-muted-foreground">{t('الكمية المتوفرة')}</p>
                                <p className="font-bold text-lg">{material.quantity} {material.unit}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">{t('إجمالي المستلم')}</p>
                                <p className="font-medium text-blue-600">{material.total_received || 0}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">{t('المحول للفروع')}</p>
                                <p className="font-medium text-orange-600">{material.transferred_to_branches || 0}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">{t('سعر الوحدة')}</p>
                                <p className="font-medium">{formatPrice(material.cost_per_unit)}</p>
                              </div>
                            </div>
                            {/* شريط التقدم */}
                            <div className="mt-3">
                              <div className="flex justify-between text-xs mb-1">
                                <span>{t('المتبقي')}: {material.remaining_quantity || material.quantity}</span>
                                <span>{t('القيمة')}: {formatPrice(material.total_value || 0)}</span>
                              </div>
                              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full ${material.quantity <= material.min_quantity ? 'bg-red-500' : 'bg-amber-500'}`}
                                  style={{ width: `${Math.min(100, (material.quantity / (material.total_received || material.quantity || 1)) * 100)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col gap-2 mr-4">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setShowAddPackagingStockDialog(material)}
                              className="gap-1"
                            >
                              <Plus className="h-4 w-4" />
                              {t('إضافة كمية')}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* التصنيع */}
          <TabsContent value="manufacturing" className="space-y-4">
            {/* زر طلب مواد من المخزن */}
            <Card className="border-orange-500/30 bg-orange-500/5">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <BoxSelect className="h-8 w-8 text-orange-500" />
                    <div>
                      <h3 className="font-bold">{t('طلب مواد خام من المخزن')}</h3>
                      <p className="text-sm text-muted-foreground">{t('أنشئ طلب لتوفير المواد الخام من المخزن')}</p>
                    </div>
                  </div>
                  <Button
                    onClick={() => setShowRequestMaterialsDialog(true)}
                    className="bg-orange-500 hover:bg-orange-600"
                    data-testid="request-materials-btn"
                  >
                    <Plus className="h-4 w-4 ml-2" />
                    {t('طلب جديد')}
                  </Button>
                </div>
                {materialRequestItems.length > 0 && (
                  <div className="mt-3 p-3 bg-background rounded-lg">
                    <p className="text-sm font-medium mb-2">{t('المواد في قائمة الطلب')} ({materialRequestItems.length}):</p>
                    <div className="flex flex-wrap gap-2">
                      {materialRequestItems.map(item => (
                        <span key={item.material_id} className="px-2 py-1 bg-orange-500/10 text-orange-500 rounded-full text-sm flex items-center gap-1">
                          {item.material_name} ({item.quantity} {item.unit})
                          <button onClick={() => removeMaterialFromRequest(item.material_id)} className="hover:text-red-500">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            
            {/* Manufacturing Inventory */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Beaker className="h-5 w-5 text-purple-500" />
                  {t('المواد الخام في قسم التصنيع')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {manufacturingInventory.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Beaker className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>{t('لا توجد مواد في قسم التصنيع')}</p>
                    <p className="text-sm">{t('قم بتحويل مواد من المخزن أو أنشئ طلب مواد')}</p>
                    <Button onClick={() => setShowRequestMaterialsDialog(true)} className="mt-3 bg-orange-500 hover:bg-orange-600">
                      <Plus className="h-4 w-4 ml-2" />
                      {t('طلب مواد من المخزن')}
                    </Button>
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
                  {t('المنتجات المصنعة (الوصفات)')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {manufacturedProducts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Factory className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>{t('لا توجد منتجات مصنعة')}</p>
                    <Button variant="link" onClick={() => setShowAddProductDialog(true)}>
                      {t('إضافة منتج جديد')}</Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {manufacturedProducts.map(product => (
                      <Card key={product.id} className={`${product.quantity <= product.min_quantity ? 'ring-2 ring-red-500' : ''}`} data-testid={`product-${product.id}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <h3 className="font-bold text-lg">{product.name}</h3>
                                <Badge className={product.quantity <= product.min_quantity ? 'bg-red-500/20 text-red-500' : 'bg-green-500/20 text-green-500'}>
                                  {t('المتبقي')}: {product.quantity} {product.unit}
                                </Badge>
                                {product.piece_weight && (
                                  <Badge variant="outline" className="text-orange-500 border-orange-500">
                                    {t('القطعة')} = {product.piece_weight} {product.piece_weight_unit || 'غرام'}
                                  </Badge>
                                )}
                              </div>
                              
                              {/* إحصائيات الكمية */}
                              <div className="grid grid-cols-3 gap-2 p-2 bg-muted/30 rounded-lg mb-3">
                                <div className="text-center">
                                  <p className="text-xs text-muted-foreground">{t('إجمالي المُصنّع')}</p>
                                  <p className="font-bold text-purple-500">{product.total_produced || product.quantity || 0}</p>
                                </div>
                                <div className="text-center border-x border-muted">
                                  <p className="text-xs text-muted-foreground">{t('المحول للفروع')}</p>
                                  <p className="font-bold text-blue-500">{product.transferred_quantity || 0}</p>
                                </div>
                                <div className="text-center">
                                  <p className="text-xs text-muted-foreground">{t('المتبقي')}</p>
                                  <p className="font-bold text-green-500">{product.quantity || 0}</p>
                                </div>
                              </div>
                              
                              {/* شريط التقدم */}
                              {(product.total_produced || 0) > 0 && (
                                <div className="mb-3">
                                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                    <div 
                                      className="h-full bg-gradient-to-r from-blue-500 to-green-500"
                                      style={{ width: `${Math.min(100, ((product.quantity || 0) / (product.total_produced || 1)) * 100)}%` }}
                                    />
                                  </div>
                                  <p className="text-xs text-muted-foreground text-center mt-1">
                                    {Math.round(((product.quantity || 0) / (product.total_produced || 1)) * 100)}% {t('متبقي من الإنتاج')}
                                  </p>
                                </div>
                              )}
                              
                              <div className="grid grid-cols-3 gap-4 text-sm mb-3">
                                <div>
                                  <p className="text-muted-foreground">{t('تكلفة المواد')}</p>
                                  <p className="font-bold text-blue-500">{formatPrice(product.raw_material_cost)}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">{t('سعر البيع')}</p>
                                  <p className="font-bold text-green-500">{formatPrice(product.selling_price)}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">{t('هامش الربح')}</p>
                                  <p className="font-bold text-primary">{formatPrice(product.profit_margin)}</p>
                                </div>
                              </div>
                              
                              {/* Recipe */}
                              <button
                                onClick={() => setSelectedRecipe(selectedRecipe === product.id ? null : product.id)}
                                className="flex items-center gap-2 text-sm text-primary hover:text-primary/80"
                              >
                                <TreeDeciduous className="h-4 w-4" />
                                <span>{t('الوصفة')} ({product.recipe?.length || 0} {t('مكونات')})</span>
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
                            
                            {/* أزرار الإجراءات */}
                            <div className="flex flex-col gap-2">
                              <Button
                                onClick={() => setShowProduceDialog(product)}
                                className="bg-green-500 hover:bg-green-600"
                                data-testid="produce-btn"
                              >
                                <Factory className="h-4 w-4 ml-2" />
                                {t('تصنيع')}
                              </Button>
                              <Button
                                onClick={() => setShowAddStockDialog(product)}
                                variant="outline"
                                className="border-purple-500 text-purple-600 hover:bg-purple-50"
                                data-testid="add-stock-btn"
                              >
                                <Plus className="h-4 w-4 ml-2" />
                                {t('زيادة الكمية')}
                              </Button>
                            </div>
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
                  {t('حركات المخزن (واردات/صادرات)')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {warehouseTransactions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <ArrowUpCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>{t('لا توجد حركات')}</p>
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
                              {transaction.type === 'incoming' ? t('وارد') : t('صادر')}
                            </span>
                            {transaction.source && (
                              <Badge variant="outline">{transaction.source}</Badge>
                            )}
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {new Date(transaction.created_at).toLocaleDateString('en-US')}
                          </span>
                        </div>
                        
                        {transaction.supplier_name && (
                          <p className="text-sm text-muted-foreground mb-2">{t('المورد')}: {transaction.supplier_name}</p>
                        )}
                        
                        <div className="flex flex-wrap gap-2">
                          {transaction.items?.slice(0, 3).map((item, idx) => (
                            <span key={idx} className="px-2 py-1 bg-muted rounded text-sm">
                              {item.name}: {item.quantity} {item.unit}
                            </span>
                          ))}
                          {transaction.items?.length > 3 && (
                            <span className="px-2 py-1 text-sm text-muted-foreground">+{transaction.items.length - 3} {t('أصناف')}</span>
                          )}
                        </div>
                        
                        {transaction.total_amount > 0 && (
                          <p className="mt-2 font-bold text-primary">{t('الإجمالي')}: {formatPrice(transaction.total_amount)}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* طلبات الفروع */}
          <TabsContent value="branch-requests" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  {t('طلبات الفروع الواردة')}
                  {branchRequests.filter(r => r.status === 'pending').length > 0 && (
                    <Badge className="bg-red-500">{branchRequests.filter(r => r.status === 'pending').length} {t('جديد')}</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {branchRequests.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>{t('لا توجد طلبات من الفروع')}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {branchRequests.map(request => (
                      <div key={request.id} className={`p-4 border rounded-lg ${request.status === 'pending' ? 'border-orange-500 bg-orange-500/5' : ''}`}>
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-bold text-lg">{t('طلب')} #{request.request_number}</span>
                              <Badge className={
                                request.status === 'pending' ? 'bg-orange-500/20 text-orange-500' :
                                request.status === 'approved' ? 'bg-blue-500/20 text-blue-500' :
                                request.status === 'processing' ? 'bg-purple-500/20 text-purple-500' :
                                request.status === 'shipped' ? 'bg-cyan-500/20 text-cyan-500' :
                                request.status === 'delivered' ? 'bg-green-500/20 text-green-500' :
                                'bg-red-500/20 text-red-500'
                              }>
                                {request.status === 'pending' ? t('جديد - بانتظار التنفيذ') :
                                 request.status === 'approved' ? t('موافق عليه') :
                                 request.status === 'processing' ? t('قيد التجهيز') :
                                 request.status === 'shipped' ? t('تم الشحن') :
                                 request.status === 'delivered' ? t('تم التسليم') :
                                 request.status === 'cancelled' ? t('ملغي') : request.status}
                              </Badge>
                              {request.priority === 'urgent' && (
                                <Badge className="bg-red-500">{t('مستعجل')}</Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground flex items-center gap-2">
                              <Building2 className="h-4 w-4" />
                              {t('إلى')}: <span className="font-medium text-foreground">{request.to_branch_name}</span>
                            </p>
                            {request.requested_by_name && (
                              <p className="text-sm text-muted-foreground">
                                {t('طلب بواسطة')}: <span className="font-medium">{request.requested_by_name}</span>
                              </p>
                            )}
                          </div>
                          <div className="text-left">
                            <p className="text-xs text-muted-foreground">
                              {new Date(request.created_at).toLocaleDateString('ar-EG', {
                                year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                              })}
                            </p>
                          </div>
                        </div>
                        
                        {/* المنتجات المطلوبة */}
                        <div className="bg-muted/30 rounded-lg p-3 mb-3">
                          <p className="text-sm font-medium mb-2">{t('المنتجات المطلوبة')}:</p>
                          <div className="space-y-2">
                            {request.items?.map((item, idx) => (
                              <div key={idx} className="flex items-center justify-between text-sm">
                                <span>{item.product_name}</span>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline">{item.quantity} {item.unit}</Badge>
                                  <span className={item.available_quantity >= item.quantity ? 'text-green-500' : 'text-red-500'}>
                                    ({t('متوفر')}: {item.available_quantity || 0})
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="mt-2 pt-2 border-t flex justify-between">
                            <span className="font-medium">{t('إجمالي التكلفة')}:</span>
                            <span className="font-bold text-primary">{formatPrice(request.total_cost || 0)}</span>
                          </div>
                        </div>
                        
                        {request.notes && (
                          <p className="text-sm text-muted-foreground mb-3 p-2 bg-yellow-500/10 rounded">
                            <strong>{t('ملاحظات')}:</strong> {request.notes}
                          </p>
                        )}
                        
                        {/* أزرار الإجراءات */}
                        {(request.status === 'pending' || request.status === 'approved' || request.status === 'processing') && (
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700"
                              onClick={() => handleFulfillRequest(request.id)}
                              disabled={submitting}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              {t('تنفيذ وتحويل للفرع')}
                            </Button>
                          </div>
                        )}
                        
                        {request.status === 'delivered' && (
                          <div className="flex items-center gap-2 text-green-500">
                            <CheckCircle className="h-5 w-5" />
                            <span className="font-medium">{t('تم التسليم')}</span>
                            {request.delivered_at && (
                              <span className="text-sm text-muted-foreground">
                                - {new Date(request.delivered_at).toLocaleDateString('ar-EG')}
                              </span>
                            )}
                          </div>
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
                  {t('تحويلات المخزن')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {warehouseTransfers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Send className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>{t('لا توجد تحويلات')}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {warehouseTransfers.map(transfer => (
                      <div key={transfer.id} className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold">{t('تحويل')} #{transfer.transfer_number}</span>
                            <Badge className={
                              transfer.status === 'pending' ? 'bg-yellow-500/20 text-yellow-500' :
                              transfer.status === 'received' ? 'bg-green-500/20 text-green-500' :
                              'bg-blue-500/20 text-blue-500'
                            }>
                              {transfer.status === 'pending' ? t('قيد الانتظار') :
                               transfer.status === 'received' ? t('تم الاستلام') : transfer.status}
                            </Badge>
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {new Date(transfer.created_at).toLocaleDateString('en-US')}
                          </span>
                        </div>
                        
                        <p className="text-sm text-muted-foreground mb-2">
                          {transfer.transfer_type === 'warehouse_to_manufacturing' ? t('من المخزن إلى التصنيع') : transfer.transfer_type}
                        </p>
                        
                        <div className="flex flex-wrap gap-2">
                          {transfer.items?.map((item, idx) => (
                            <span key={idx} className="px-2 py-1 bg-purple-500/10 text-purple-500 rounded text-sm">
                              {item.raw_material_name}: {item.quantity} {item.unit}
                            </span>
                          ))}
                        </div>
                        
                        {transfer.total_cost > 0 && (
                          <p className="mt-2 font-bold text-primary">{t('التكلفة')}: {formatPrice(transfer.total_cost)}</p>
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
              {t('إضافة مادة خام جديدة')}
            </DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleAddRawMaterial} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('الاسم *')}</Label>
                <Input
                  value={rawMaterialForm.name}
                  onChange={(e) => setRawMaterialForm(prev => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label>{t('الاسم بالإنجليزية')}</Label>
                <Input
                  value={rawMaterialForm.name_en}
                  onChange={(e) => setRawMaterialForm(prev => ({ ...prev, name_en: e.target.value }))}
                />
              </div>
              <div>
                <Label>{t('الوحدة')}</Label>
                <Select 
                  value={rawMaterialForm.unit} 
                  onValueChange={(v) => setRawMaterialForm(prev => ({ ...prev, unit: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="كغم">{t('كغم')}</SelectItem>
                    <SelectItem value="غرام">{t('غرام')}</SelectItem>
                    <SelectItem value="لتر">{t('لتر')}</SelectItem>
                    <SelectItem value="مل">{t('مل')}</SelectItem>
                    <SelectItem value="قطعة">{t('قطعة')}</SelectItem>
                    <SelectItem value="علبة">{t('علبة')}</SelectItem>
                    <SelectItem value="كرتون">{t('كرتون')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('الكمية')}</Label>
                <Input
                  type="number"
                  value={rawMaterialForm.quantity}
                  onChange={(e) => setRawMaterialForm(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label>{t('الحد الأدنى')}</Label>
                <Input
                  type="number"
                  value={rawMaterialForm.min_quantity}
                  onChange={(e) => setRawMaterialForm(prev => ({ ...prev, min_quantity: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label>{t('التكلفة/وحدة')}</Label>
                <Input
                  type="number"
                  value={rawMaterialForm.cost_per_unit}
                  onChange={(e) => setRawMaterialForm(prev => ({ ...prev, cost_per_unit: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label>{t('نسبة الهدر %')}</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={rawMaterialForm.waste_percentage}
                  onChange={(e) => setRawMaterialForm(prev => ({ ...prev, waste_percentage: parseFloat(e.target.value) || 0 }))}
                  placeholder="مثال: 10 للحم"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {rawMaterialForm.waste_percentage > 0 && rawMaterialForm.cost_per_unit > 0 && (
                    <>
                      {t('التكلفة الفعلية بعد الهدر')}: {' '}
                      <span className="font-bold text-orange-500">
                        {formatPrice(rawMaterialForm.cost_per_unit / (1 - rawMaterialForm.waste_percentage / 100))}
                      </span>
                    </>
                  )}
                </p>
              </div>
            </div>
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddRawMaterial(false)}>
                {t('إلغاء')}</Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? <RefreshCw className="h-4 w-4 animate-spin ml-2" /> : <Plus className="h-4 w-4 ml-2" />}
                {t('إضافة')}
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
              {t('تحويل مواد لقسم التصنيع')}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {transferForm.items.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{t('لم تتم إضافة مواد')}</p>
                <p className="text-sm">{t('اضغط على "إضافة للتحويل" من قائمة المواد الخام')}</p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted/50 px-3 py-2 font-medium text-sm">
                  {t('المواد المختارة')} ({transferForm.items.length})
                </div>
                <div className="divide-y max-h-64 overflow-y-auto">
                  {transferForm.items.map((item, index) => (
                    <div key={index} className="px-3 py-2 flex items-center justify-between gap-2">
                      <div className="flex-1">
                        <span className="font-medium">{item.raw_material_name}</span>
                        <span className="text-xs text-muted-foreground mr-2">{t('(متوفر: {item.available})')}</span>
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
              <Label>{t('ملاحظات')}</Label>
              <Textarea
                value={transferForm.notes}
                onChange={(e) => setTransferForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder={t('ملاحظات اختيارية...')}
                rows={2}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransferDialog(false)}>
              {t('إلغاء')}</Button>
            <Button 
              onClick={handleTransferToManufacturing}
              disabled={transferForm.items.length === 0 || submitting}
              className="bg-primary"
            >
              {submitting ? <RefreshCw className="h-4 w-4 animate-spin ml-2" /> : <Send className="h-4 w-4 ml-2" />}
              {t('تحويل للتصنيع')}
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
              {t('إضافة منتج مصنع (وصفة)')}
            </DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleAddProduct} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('اسم المنتج *')}</Label>
                <Input
                  value={productForm.name}
                  onChange={(e) => setProductForm(prev => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label>{t('الاسم بالإنجليزية')}</Label>
                <Input
                  value={productForm.name_en}
                  onChange={(e) => setProductForm(prev => ({ ...prev, name_en: e.target.value }))}
                />
              </div>
              <div>
                <Label>{t('الوحدة')}</Label>
                <Select 
                  value={productForm.unit} 
                  onValueChange={(v) => setProductForm(prev => ({ ...prev, unit: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="قطعة">{t('قطعة')}</SelectItem>
                    <SelectItem value="حبة">{t('حبة')}</SelectItem>
                    <SelectItem value="صحن">{t('صحن')}</SelectItem>
                    <SelectItem value="كغم">{t('كغم')}</SelectItem>
                    <SelectItem value="غرام">{t('غرام')}</SelectItem>
                    <SelectItem value="لتر">{t('لتر')}</SelectItem>
                    <SelectItem value="مل">{t('مل')}</SelectItem>
                    <SelectItem value="علبة">{t('علبة')}</SelectItem>
                    <SelectItem value="كرتون">{t('كرتون')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* حقل وزن القطعة - يظهر فقط عند اختيار قطعة */}
              {(productForm.unit === 'قطعة' || productForm.unit === 'حبة' || productForm.unit === 'صحن') && (
                <div className="col-span-2">
                  <Label>{t('وزن القطعة (اختياري)')}</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      placeholder={t('مثال: 100')}
                      value={productForm.piece_weight}
                      onChange={(e) => setProductForm(prev => ({ ...prev, piece_weight: e.target.value }))}
                      className="flex-1"
                    />
                    <Select 
                      value={productForm.piece_weight_unit} 
                      onValueChange={(v) => setProductForm(prev => ({ ...prev, piece_weight_unit: v }))}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="غرام">{t('غرام')}</SelectItem>
                        <SelectItem value="كغم">{t('كغم')}</SelectItem>
                        <SelectItem value="مل">{t('مل')}</SelectItem>
                        <SelectItem value="لتر">{t('لتر')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('مثال: القطعة = 100 غرام من اللحم')}
                  </p>
                </div>
              )}
              
              <div>
                <Label>{t('سعر البيع')}</Label>
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
                <Label className="font-bold">{t('الوصفة (المكونات) *')}</Label>
              </div>
              
              {manufacturingInventory.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-yellow-500" />
                  <p className="text-sm">{t('لا توجد مواد في قسم التصنيع')}</p>
                  <p className="text-xs">{t('قم بتحويل مواد من المخزن أولاً')}</p>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <Select 
                      value={newIngredient.raw_material_id} 
                      onValueChange={(v) => setNewIngredient(prev => ({ ...prev, raw_material_id: v }))}
                    >
                      <SelectTrigger className="flex-1 bg-background">
                        <SelectValue placeholder={t('اختر مادة خام...')} />
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
                      placeholder={t('الكمية')}
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
                        <span className="font-medium">{t('تكلفة الوحدة:')}</span>
                        <span className="font-bold text-primary">{formatPrice(calculateRecipeCost())}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">{t('لم تتم إضافة مكونات بعد')}</p>
                  )}
                </>
              )}
            </div>
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddProductDialog(false)}>
                {t('إلغاء')}</Button>
              <Button type="submit" disabled={productForm.recipe.length === 0 || submitting}>
                {submitting ? <RefreshCw className="h-4 w-4 animate-spin ml-2" /> : <Plus className="h-4 w-4 ml-2" />}
                {t('إضافة المنتج')}
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
              {t('تصنيع:')} {showProduceDialog?.name}
            </DialogTitle>
          </DialogHeader>
          
          {showProduceDialog && (
            <div className="space-y-4">
              <div className="p-4 bg-muted/30 rounded-lg">
                <p className="text-sm text-muted-foreground mb-2">{t('المكونات المطلوبة لكل وحدة:')}</p>
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
                <Label>{t('كمية التصنيع')}</Label>
                <Input
                  type="number"
                  min="1"
                  value={produceQuantity}
                  onChange={(e) => setProduceQuantity(parseInt(e.target.value) || 1)}
                />
              </div>
              
              <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                <p className="text-sm font-medium text-green-500 mb-2">{t('المواد التي سيتم خصمها:')}</p>
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
              {t('إلغاء')}</Button>
            <Button 
              onClick={handleProduce}
              disabled={submitting}
              className="bg-green-500 hover:bg-green-600"
            >
              {submitting ? <RefreshCw className="h-4 w-4 animate-spin ml-2" /> : <Factory className="h-4 w-4 ml-2" />}
              {t('تصنيع')}
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
              {t('تحويل منتجات للفرع')}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* اختيار الفرع */}
            <div>
              <Label>{t('الفرع المستلم *')}</Label>
              <Select 
                value={branchTransferForm.to_branch_id} 
                onValueChange={(v) => setBranchTransferForm(prev => ({ ...prev, to_branch_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('اختر الفرع')} />
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
            {/* المنتجات المصنعة المتاحة */}
            <div>
              <Label className="mb-2 block">{t('المنتجات المصنعة المتاحة')}</Label>
              <div className="border rounded-lg max-h-48 overflow-y-auto p-2">
                {manufacturingInventory.filter(m => m.quantity > 0).length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">{t('لا توجد منتجات متاحة')}</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {manufacturingInventory.filter(m => m.quantity > 0).map(product => (
                      <div 
                        key={product.id}
                        className="flex items-center justify-between p-2 bg-muted/50 rounded cursor-pointer hover:bg-muted"
                        onClick={() => addItemToBranchTransfer({
                          id: product.id,
                          name: product.name,
                          quantity: product.quantity,
                          unit: product.unit || 'قطعة'
                        })}
                      >
                        <span className="text-sm">{product.name}</span>
                        <Badge variant="outline">{product.quantity} {product.unit || 'قطعة'}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {/* المنتجات المختارة */}
            {branchTransferForm.items.length > 0 && (
              <div>
                <Label className="mb-2 block">{t('المنتجات المختارة للتحويل')}</Label>
                <div className="space-y-2">
                  {branchTransferForm.items.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded">
                      <span className="flex-1 font-medium text-foreground">{item.product_name}</span>
                      <Input 
                        type="number"
                        min="1"
                        step="1"
                        max={item.available}
                        value={item.quantity}
                        onChange={(e) => updateBranchTransferQty(idx, e.target.value)}
                        className="w-24 bg-white dark:bg-gray-800 text-black dark:text-white border-gray-300 dark:border-gray-600"
                      />
                      <span className="text-sm text-muted-foreground">{item.unit}</span>
                      <span className="text-xs text-green-600 dark:text-green-400">{t('(متاح: {item.available})')}</span>
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
              <Label>{t('ملاحظات')}</Label>
              <Textarea
                value={branchTransferForm.notes}
                onChange={(e) => setBranchTransferForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder={t('ملاحظات إضافية...')}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBranchTransferDialog(false)}>
              {t('إلغاء')}</Button>
            <Button 
              onClick={handleTransferToBranch}
              disabled={submitting || branchTransferForm.items.length === 0 || !branchTransferForm.to_branch_id}
              className="bg-green-500 hover:bg-green-600"
            >
              {submitting ? <RefreshCw className="h-4 w-4 animate-spin ml-2" /> : <Send className="h-4 w-4 ml-2" />}
              {t('تحويل للفرع')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Dialog: زيادة كمية المنتج */}
      <Dialog open={!!showAddStockDialog} onOpenChange={() => { setShowAddStockDialog(null); setAddStockQuantity(1); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-purple-500" />
              {t('زيادة كمية المنتج')}
            </DialogTitle>
          </DialogHeader>
          
          {showAddStockDialog && (
            <div className="space-y-4">
              <div className="p-4 bg-purple-500/10 rounded-lg">
                <h3 className="font-bold text-lg mb-2">{showAddStockDialog.name}</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">{t('الكمية الحالية')}</p>
                    <p className="font-bold text-green-500">{showAddStockDialog.quantity} {showAddStockDialog.unit}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t('إجمالي المُصنّع')}</p>
                    <p className="font-bold text-purple-500">{showAddStockDialog.total_produced || showAddStockDialog.quantity || 0}</p>
                  </div>
                </div>
              </div>
              
              <div>
                <Label>{t('الكمية المراد إضافتها')}</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Button 
                    type="button"
                    variant="outline" 
                    size="icon"
                    onClick={() => setAddStockQuantity(Math.max(1, addStockQuantity - 1))}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Input
                    type="number"
                    min="1"
                    value={addStockQuantity}
                    onChange={(e) => setAddStockQuantity(parseFloat(e.target.value) || 1)}
                    className="w-24 text-center text-lg font-bold"
                  />
                  <Button 
                    type="button"
                    variant="outline" 
                    size="icon"
                    onClick={() => setAddStockQuantity(addStockQuantity + 1)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">{showAddStockDialog.unit}</span>
                </div>
              </div>
              
              <div className="p-3 bg-green-500/10 rounded-lg text-center">
                <p className="text-sm text-muted-foreground">{t('الكمية بعد الإضافة')}</p>
                <p className="text-xl font-bold text-green-500">
                  {(showAddStockDialog.quantity || 0) + addStockQuantity} {showAddStockDialog.unit}
                </p>
              </div>
              
              <p className="text-xs text-muted-foreground text-center">
                {t('ملاحظة: هذه الإضافة لا تخصم مواد خام، استخدم زر "تصنيع" لخصم المواد')}
              </p>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddStockDialog(null); setAddStockQuantity(1); }}>
              {t('إلغاء')}
            </Button>
            <Button 
              onClick={handleAddStock}
              disabled={submitting || addStockQuantity <= 0}
              className="bg-purple-500 hover:bg-purple-600"
            >
              {submitting ? <RefreshCw className="h-4 w-4 animate-spin ml-2" /> : <Plus className="h-4 w-4 ml-2" />}
              {t('إضافة الكمية')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Dialog: زيادة كمية المادة الخام */}
      <Dialog open={!!showAddRawMaterialStockDialog} onOpenChange={() => { setShowAddRawMaterialStockDialog(null); setAddRawMaterialStockQuantity(1); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-purple-500" />
              {t('زيادة كمية المادة الخام')}
            </DialogTitle>
          </DialogHeader>
          
          {showAddRawMaterialStockDialog && (
            <div className="space-y-4">
              <div className="p-4 bg-purple-500/10 rounded-lg">
                <h3 className="font-bold text-lg mb-2">{showAddRawMaterialStockDialog.name}</h3>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">{t('الكمية الحالية')}</p>
                    <p className="font-bold text-green-500">{showAddRawMaterialStockDialog.quantity} {showAddRawMaterialStockDialog.unit}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t('إجمالي الوارد')}</p>
                    <p className="font-bold text-purple-500">{showAddRawMaterialStockDialog.total_received || showAddRawMaterialStockDialog.quantity || 0}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t('المحول للتصنيع')}</p>
                    <p className="font-bold text-blue-500">{showAddRawMaterialStockDialog.transferred_to_manufacturing || 0}</p>
                  </div>
                </div>
              </div>
              
              {/* تحذير انخفاض المخزون */}
              {showAddRawMaterialStockDialog.quantity <= showAddRawMaterialStockDialog.min_quantity && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  <p className="text-sm text-red-500">
                    {t('تحذير: المخزون أقل من الحد الأدنى')} ({showAddRawMaterialStockDialog.min_quantity} {showAddRawMaterialStockDialog.unit})
                  </p>
                </div>
              )}
              
              <div>
                <Label>{t('الكمية المراد إضافتها')}</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Button 
                    type="button"
                    variant="outline" 
                    size="icon"
                    onClick={() => setAddRawMaterialStockQuantity(Math.max(1, addRawMaterialStockQuantity - 1))}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Input
                    type="number"
                    min="1"
                    step="0.5"
                    value={addRawMaterialStockQuantity}
                    onChange={(e) => setAddRawMaterialStockQuantity(parseFloat(e.target.value) || 1)}
                    className="w-24 text-center text-lg font-bold"
                  />
                  <Button 
                    type="button"
                    variant="outline" 
                    size="icon"
                    onClick={() => setAddRawMaterialStockQuantity(addRawMaterialStockQuantity + 1)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">{showAddRawMaterialStockDialog.unit}</span>
                </div>
              </div>
              
              <div className="p-3 bg-green-500/10 rounded-lg text-center">
                <p className="text-sm text-muted-foreground">{t('الكمية بعد الإضافة')}</p>
                <p className="text-xl font-bold text-green-500">
                  {(showAddRawMaterialStockDialog.quantity || 0) + addRawMaterialStockQuantity} {showAddRawMaterialStockDialog.unit}
                </p>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddRawMaterialStockDialog(null); setAddRawMaterialStockQuantity(1); }}>
              {t('إلغاء')}
            </Button>
            <Button 
              onClick={handleAddRawMaterialStock}
              disabled={submitting || addRawMaterialStockQuantity <= 0}
              className="bg-purple-500 hover:bg-purple-600"
            >
              {submitting ? <RefreshCw className="h-4 w-4 animate-spin ml-2" /> : <Plus className="h-4 w-4 ml-2" />}
              {t('إضافة الكمية')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Dialog: طلب مواد خام من المخزن */}
      <Dialog open={showRequestMaterialsDialog} onOpenChange={setShowRequestMaterialsDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BoxSelect className="h-5 w-5 text-orange-500" />
              {t('طلب مواد خام من المخزن')}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* اختيار المواد المتاحة */}
            <div>
              <Label>{t('اختر المواد المطلوبة')}</Label>
              <div className="grid grid-cols-2 gap-2 mt-2 max-h-48 overflow-y-auto p-2 border rounded-lg">
                {rawMaterials.map(material => (
                  <button
                    key={material.id}
                    type="button"
                    onClick={() => addMaterialToRequest(material)}
                    className="p-2 text-right bg-muted/30 hover:bg-orange-500/10 rounded-lg transition-colors"
                  >
                    <p className="font-medium text-sm">{material.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('متوفر')}: {material.quantity} {material.unit}
                    </p>
                  </button>
                ))}
              </div>
            </div>
            
            {/* المواد المختارة */}
            {materialRequestItems.length > 0 && (
              <div>
                <Label>{t('المواد المطلوبة')} ({materialRequestItems.length})</Label>
                <div className="space-y-2 mt-2">
                  {materialRequestItems.map(item => (
                    <div key={item.material_id} className="flex items-center justify-between p-3 bg-orange-500/10 rounded-lg">
                      <div className="flex items-center gap-3">
                        <button onClick={() => removeMaterialFromRequest(item.material_id)} className="text-red-500 hover:text-red-700">
                          <X className="h-4 w-4" />
                        </button>
                        <div>
                          <p className="font-medium">{item.material_name}</p>
                          <p className="text-xs text-muted-foreground">{t('متوفر')}: {item.available_quantity} {item.unit}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          type="button"
                          variant="outline" 
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setMaterialRequestItems(prev => prev.map(i =>
                            i.material_id === item.material_id
                              ? { ...i, quantity: Math.max(1, i.quantity - 1) }
                              : i
                          ))}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => setMaterialRequestItems(prev => prev.map(i =>
                            i.material_id === item.material_id
                              ? { ...i, quantity: parseFloat(e.target.value) || 1 }
                              : i
                          ))}
                          className="w-20 text-center"
                        />
                        <Button 
                          type="button"
                          variant="outline" 
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setMaterialRequestItems(prev => prev.map(i =>
                            i.material_id === item.material_id
                              ? { ...i, quantity: i.quantity + 1 }
                              : i
                          ))}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                        <span className="text-sm w-12">{item.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* التكلفة التقديرية */}
                <div className="p-3 bg-muted/30 rounded-lg mt-3">
                  <div className="flex justify-between font-bold">
                    <span>{t('التكلفة التقديرية')}</span>
                    <span className="text-primary">
                      {formatPrice(materialRequestItems.reduce((sum, item) => sum + (item.quantity * item.cost_per_unit), 0))}
                    </span>
                  </div>
                </div>
              </div>
            )}
            
            {/* الأولوية */}
            <div>
              <Label>{t('الأولوية')}</Label>
              <div className="flex gap-2 mt-2">
                <Button
                  type="button"
                  variant={materialRequestPriority === 'normal' ? 'default' : 'outline'}
                  onClick={() => setMaterialRequestPriority('normal')}
                  className={materialRequestPriority === 'normal' ? 'bg-blue-500' : ''}
                >
                  {t('عادي')}
                </Button>
                <Button
                  type="button"
                  variant={materialRequestPriority === 'urgent' ? 'default' : 'outline'}
                  onClick={() => setMaterialRequestPriority('urgent')}
                  className={materialRequestPriority === 'urgent' ? 'bg-red-500' : ''}
                >
                  {t('مستعجل')}
                </Button>
              </div>
            </div>
            
            {/* ملاحظات */}
            <div>
              <Label>{t('ملاحظات')}</Label>
              <Textarea
                value={materialRequestNotes}
                onChange={(e) => setMaterialRequestNotes(e.target.value)}
                placeholder={t('أضف ملاحظات للطلب (اختياري)')}
                className="mt-1"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowRequestMaterialsDialog(false);
              setMaterialRequestItems([]);
              setMaterialRequestNotes('');
              setMaterialRequestPriority('normal');
            }}>
              {t('إلغاء')}
            </Button>
            <Button 
              onClick={handleSubmitMaterialRequest}
              disabled={submitting || materialRequestItems.length === 0}
              className="bg-orange-500 hover:bg-orange-600"
            >
              {submitting ? <RefreshCw className="h-4 w-4 animate-spin ml-2" /> : <Send className="h-4 w-4 ml-2" />}
              {t('إرسال الطلب')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Dialog إضافة مادة تغليف جديدة */}
      <Dialog open={showAddPackagingDialog} onOpenChange={setShowAddPackagingDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Box className="h-5 w-5 text-amber-500" />
              {t('إضافة مادة تغليف جديدة')}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddPackagingMaterial} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('اسم المادة')}</Label>
                <Input
                  value={packagingForm.name}
                  onChange={(e) => setPackagingForm({...packagingForm, name: e.target.value})}
                  placeholder={t('مثال: كيس ورقي كبير')}
                  required
                />
              </div>
              <div>
                <Label>{t('الاسم بالإنجليزية')}</Label>
                <Input
                  value={packagingForm.name_en}
                  onChange={(e) => setPackagingForm({...packagingForm, name_en: e.target.value})}
                  placeholder="Large Paper Bag"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>{t('الوحدة')}</Label>
                <Select value={packagingForm.unit} onValueChange={(v) => setPackagingForm({...packagingForm, unit: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="قطعة">{t('قطعة')}</SelectItem>
                    <SelectItem value="كيس">{t('كيس')}</SelectItem>
                    <SelectItem value="علبة">{t('علبة')}</SelectItem>
                    <SelectItem value="رول">{t('رول')}</SelectItem>
                    <SelectItem value="ورقة">{t('ورقة')}</SelectItem>
                    <SelectItem value="حزمة">{t('حزمة')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('الكمية')}</Label>
                <Input
                  type="number"
                  value={packagingForm.quantity}
                  onChange={(e) => setPackagingForm({...packagingForm, quantity: parseFloat(e.target.value) || 0})}
                  min="0"
                />
              </div>
              <div>
                <Label>{t('الحد الأدنى')}</Label>
                <Input
                  type="number"
                  value={packagingForm.min_quantity}
                  onChange={(e) => setPackagingForm({...packagingForm, min_quantity: parseFloat(e.target.value) || 0})}
                  min="0"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('سعر الوحدة')}</Label>
                <Input
                  type="number"
                  value={packagingForm.cost_per_unit}
                  onChange={(e) => setPackagingForm({...packagingForm, cost_per_unit: parseFloat(e.target.value) || 0})}
                  min="0"
                />
              </div>
              <div>
                <Label>{t('الفئة')}</Label>
                <Select value={packagingForm.category} onValueChange={(v) => setPackagingForm({...packagingForm, category: v})}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('اختر الفئة')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="أكياس">{t('أكياس')}</SelectItem>
                    <SelectItem value="علب">{t('علب')}</SelectItem>
                    <SelectItem value="ورق">{t('ورق')}</SelectItem>
                    <SelectItem value="أدوات">{t('أدوات')}</SelectItem>
                    <SelectItem value="أخرى">{t('أخرى')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddPackagingDialog(false)}>
                {t('إلغاء')}
              </Button>
              <Button type="submit" disabled={submitting} className="bg-amber-500 hover:bg-amber-600">
                {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                <span className="mr-2">{t('إضافة')}</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      
      {/* Dialog إضافة كمية لمادة تغليف */}
      <Dialog open={!!showAddPackagingStockDialog} onOpenChange={() => setShowAddPackagingStockDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-green-500" />
              {t('إضافة كمية')}
            </DialogTitle>
          </DialogHeader>
          {showAddPackagingStockDialog && (
            <div className="space-y-4">
              <div className="p-3 bg-amber-500/10 rounded-lg">
                <p className="font-bold">{showAddPackagingStockDialog.name}</p>
                <p className="text-sm text-muted-foreground">
                  {t('الكمية الحالية')}: {showAddPackagingStockDialog.quantity} {showAddPackagingStockDialog.unit}
                </p>
              </div>
              <div>
                <Label>{t('الكمية المضافة')}</Label>
                <Input
                  type="number"
                  value={addPackagingStockQuantity}
                  onChange={(e) => setAddPackagingStockQuantity(parseFloat(e.target.value) || 0)}
                  min="1"
                  className="mt-1"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddPackagingStockDialog(null)}>
                  {t('إلغاء')}
                </Button>
                <Button onClick={handleAddPackagingStock} disabled={submitting} className="bg-green-500 hover:bg-green-600">
                  {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  <span className="mr-2">{t('إضافة')}</span>
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Dialog: سجل طلبات التغليف */}
      <Dialog open={showRequestHistoryDialog} onOpenChange={setShowRequestHistoryDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-blue-500" />
              {t('سجل طلبات التغليف')}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {packagingRequests.filter(r => r.created_by === user?.id).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{t('لم ترسل أي طلبات بعد')}</p>
              </div>
            ) : (
              packagingRequests
                .filter(r => r.created_by === user?.id)
                .map(request => (
                  <div key={request.id} className="p-4 bg-muted/30 rounded-lg border">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="font-bold text-lg">#{request.request_number}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(request.created_at).toLocaleString('ar-IQ')}
                        </p>
                      </div>
                      <Badge className={
                        request.status === 'pending' ? 'bg-yellow-500' :
                        request.status === 'approved' ? 'bg-blue-500' :
                        request.status === 'transferred' ? 'bg-green-500' :
                        'bg-red-500'
                      }>
                        {request.status === 'pending' ? t('قيد الانتظار') :
                         request.status === 'approved' ? t('تمت الموافقة') :
                         request.status === 'transferred' ? t('تم التحويل') :
                         t('ملغي')}
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
                      {request.items?.map((item, idx) => (
                        <div key={idx} className="p-2 bg-amber-500/10 rounded text-sm">
                          <p className="font-medium">{item.name}</p>
                          <p className="text-muted-foreground">{item.quantity} {item.unit}</p>
                        </div>
                      ))}
                    </div>
                    
                    {request.notes && (
                      <p className="text-sm text-muted-foreground bg-background/50 p-2 rounded">
                        <strong>{t('ملاحظات')}:</strong> {request.notes}
                      </p>
                    )}
                    
                    {request.status === 'transferred' && request.transferred_at && (
                      <p className="text-xs text-green-600 mt-2">
                        {t('تم التحويل بتاريخ')}: {new Date(request.transferred_at).toLocaleString('ar-IQ')}
                      </p>
                    )}
                  </div>
                ))
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRequestHistoryDialog(false)}>
              {t('إغلاق')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
