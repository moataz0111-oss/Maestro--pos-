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
  Receipt,
  ArrowUpDown,
  TrendingUp,
  TrendingDown,
  Pencil,
  Trash2,
  DollarSign,
  Edit,
  Check,
  AlertCircle
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
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import StockoutPredictionDialog, { StockoutPredictionBanner } from '../components/StockoutPrediction';
import { MonthlyStocktakeButton } from '../components/MonthlyStocktake';
import { showApiError } from '../utils/apiError';
const API = API_URL;

// ⭐ Safe extraction of FastAPI error messages — يمنع React Error #31 عند تمرير
// مصفوفة كائنات Pydantic ValidationError إلى toast.error
const safeDetail = (error, fallback = 'حدث خطأ') => {
  const d = error?.response?.data?.detail;
  if (!d) return fallback;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) {
    // مصفوفة Pydantic v2 errors → استخرج .msg من أول خطأ
    const msgs = d.map(e => (typeof e === 'string' ? e : (e?.msg || ''))).filter(Boolean);
    return msgs.join(' · ') || fallback;
  }
  if (typeof d === 'object') return d.msg || d.message || fallback;
  return String(d) || fallback;
};

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
  // ⭐ Dialog: التنفيذ الجزئي لطلب التصنيع (تعديل الكميات حسب المتوفر)
  const [mfgFulfillDialog, setMfgFulfillDialog] = useState({ open: false, request: null, qtyOverrides: {}, partial: false, notes: '' });
  const [warehouseNotifications, setWarehouseNotifications] = useState([]);  // إشعارات المخزن
  
  // Packaging materials states (مواد التغليف)
  const [packagingMaterials, setPackagingMaterials] = useState([]);
  const [packagingRequests, setPackagingRequests] = useState([]);
  const [showAddPackagingDialog, setShowAddPackagingDialog] = useState(false);

  // === تعديل/حذف مادة خام (للمالك، قبل التحويل فقط) ===
  const [editRawMaterial, setEditRawMaterial] = useState(null);  // null أو الكائن
  // ⭐ تصحيح إداري لمادة محوّلة (تخطئ إدخال غرام بدل كغم مثلاً)
  const [adminCorrection, setAdminCorrection] = useState(null);
  const [deleteRawMaterial, setDeleteRawMaterial] = useState(null);  // null أو الكائن
  
  // === طلب شراء جديد للمشتريات (يبدأ بحالة pending_owner_approval) ===
  const [showPurchaseRequestModal, setShowPurchaseRequestModal] = useState(false);
  const [purchaseRequestItems, setPurchaseRequestItems] = useState([{ raw_material_id: '', name: '', quantity: 0, unit: 'kg', notes: '' }]);
  const [showStockoutDialog, setShowStockoutDialog] = useState(false);
  const [purchaseRequestPriority, setPurchaseRequestPriority] = useState('normal');
  const [purchaseRequestNotes, setPurchaseRequestNotes] = useState('');
  const [warehouseRequestsList, setWarehouseRequestsList] = useState([]);

  // === مزامنة شاملة للوصفات اليتيمة ===
  const [syncOrphansResult, setSyncOrphansResult] = useState(null);  // {success, scanned, orphans_total, linked, ...}
  const [syncOrphansLoading, setSyncOrphansLoading] = useState(false);
  
  // === Owner notification & details modal ===
  const [showOwnerDetailsModal, setShowOwnerDetailsModal] = useState(false);
  const [selectedRequestForDetails, setSelectedRequestForDetails] = useState(null);
  const lastNotifiedRequestIdsRef = React.useRef(new Set());
  
  // === حركات المخزن ===
  const [movements, setMovements] = useState([]);
  const [movementsSummary, setMovementsSummary] = useState({ total_in: 0, total_out: 0, total_in_value: 0, total_out_value: 0 });
  const [movementsDaily, setMovementsDaily] = useState([]);
  const [movementsStartDate, setMovementsStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1); // أول الشهر
    return d.toISOString().split('T')[0];
  });
  const [movementsEndDate, setMovementsEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [movementsTypeFilter, setMovementsTypeFilter] = useState('all');
  const [movementsCategoryFilter, setMovementsCategoryFilter] = useState('all');
  const [movementsRangeKey, setMovementsRangeKey] = useState('month');
  const [selectedMovement, setSelectedMovement] = useState(null);
  
  const applyMovementsRange = (key) => {
    setMovementsRangeKey(key);
    if (key === 'custom') return;
    const end = new Date();
    const start = new Date();
    if (key === 'today') {
      // same day
    } else if (key === 'week') {
      start.setDate(end.getDate() - 6);
    } else if (key === 'month') {
      start.setDate(1);
    }
    setMovementsStartDate(start.toISOString().split('T')[0]);
    setMovementsEndDate(end.toISOString().split('T')[0]);
  };
  
  const fetchInventoryMovements = async () => {
    try {
      const params = { start_date: movementsStartDate, end_date: movementsEndDate };
      if (movementsTypeFilter !== 'all') params.movement_type = movementsTypeFilter;
      if (movementsCategoryFilter !== 'all') params.category = movementsCategoryFilter;
      const res = await axios.get(`${API}/inventory-movements`, { params });
      setMovements(res.data?.movements || []);
      setMovementsSummary(res.data?.summary || { total_in: 0, total_out: 0, total_in_value: 0, total_out_value: 0 });
      setMovementsDaily(res.data?.daily || []);
    } catch (_e) { /* ignore */ }
  };
  
  useEffect(() => {
    fetchInventoryMovements();
  }, [movementsStartDate, movementsEndDate, movementsTypeFilter, movementsCategoryFilter]);

  // اجلب طلبات الشراء (للمالك لرؤية المعلقة، ولأمين المخزن لرؤية حالة طلباته)
  const fetchPurchaseRequests = async () => {
    try {
      const res = await axios.get(`${API}/warehouse-purchase-requests`);
      const list = res.data || [];
      setWarehouseRequestsList(list);
      
      // === إشعار صوتي للمالك عند ورود طلب جديد بانتظار الموافقة ===
      if (isAdmin) {
        const pending = list.filter(r => r.status === 'pending_owner_approval');
        const newOnes = pending.filter(r => !lastNotifiedRequestIdsRef.current.has(r.id));
        if (newOnes.length > 0 && lastNotifiedRequestIdsRef.current.size > 0) {
          // شغّل beep عبر Web Audio API (بدون ملف خارجي)
          try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            // beep متكرر 3 مرات لجلب الانتباه
            [0, 0.25, 0.5].forEach(delay => {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.frequency.value = 880; // A5
              osc.type = 'sine';
              gain.gain.setValueAtTime(0, ctx.currentTime + delay);
              gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + delay + 0.02);
              gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.18);
              osc.start(ctx.currentTime + delay);
              osc.stop(ctx.currentTime + delay + 0.2);
            });
          } catch (_e) { /* ignore audio errors (e.g., autoplay block) */ }
          
          newOnes.forEach(req => {
            toast.info(
              `${t('طلب شراء جديد بانتظار موافقتك')}: #${req.request_number} — ${req.created_by_name || t('المخزن')}`,
              {
                duration: 10000,
                action: {
                  label: t('عرض التفاصيل'),
                  onClick: () => {
                    setSelectedRequestForDetails(req);
                    setShowOwnerDetailsModal(true);
                  }
                }
              }
            );
          });
        }
        // حدّث الـ ref لمنع التكرار
        pending.forEach(r => lastNotifiedRequestIdsRef.current.add(r.id));
      }
    } catch (_e) { /* ignore */ }
  };

  useEffect(() => {
    fetchPurchaseRequests();
    const id = setInterval(fetchPurchaseRequests, 30000);
    return () => clearInterval(id);
  }, []);

  // ⭐ إشعارات قسم التصنيع — Bell + Popover بدلاً من Toast فوري متطاير
  const [mfgNotifications, setMfgNotifications] = useState([]);
  const [showNotifPopover, setShowNotifPopover] = useState(false);
  useEffect(() => {
    const fetchMfgNotifications = async () => {
      try {
        const res = await axios.get(`${API}/manufacturing-notifications/unread`, { headers });
        setMfgNotifications(res.data || []);
      } catch (_) { /* silent */ }
    };
    fetchMfgNotifications();
    const intervalId = setInterval(fetchMfgNotifications, 20000);
    return () => clearInterval(intervalId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ackMfgNotification = async (id, action) => {
    try {
      await axios.post(`${API}/manufacturing-notifications/${id}/ack`, { action }, { headers });
    } catch (_) { /* silent */ }
    setMfgNotifications(prev => prev.filter(n => n.id !== id));
    fetchData();
  };

  const approvePurchaseRequest = async (id) => {
    try {
      await axios.post(`${API}/warehouse-purchase-requests/${id}/approve`);
      toast.success(t('تمت الموافقة وأُرسل الطلب للمشتريات'));
      fetchPurchaseRequests();
    } catch (err) {
      showApiError(err, t('فشل'));
    }
  };

  const rejectPurchaseRequest = async (id) => {
    const reason = window.prompt(t('سبب الرفض (اختياري):'), '') || '';
    try {
      await axios.post(`${API}/warehouse-purchase-requests/${id}/reject`, { reason });
      toast.success(t('تم رفض الطلب'));
      fetchPurchaseRequests();
    } catch (err) {
      showApiError(err, t('فشل'));
    }
  };
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
    category: '',
    pack_quantity: '',
    pack_unit: 'غرام',
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
    source: 'raw',  // ⭐ 'raw' (مادة خام) أو 'manufactured' (منتج مُصنّع سابقاً)
    raw_material_id: '',
    manufactured_product_id: '',
    quantity: 0,
    input_unit: '' // الوحدة التي اختارها المستخدم لإدخال الكمية (يُحوَّل لوحدة المادة)
  });

  // ⭐ تعديل/تعريف pack info (محتوى العلبة/الكرتون) inline من شاشة الوصفة
  const [packInfoEdit, setPackInfoEdit] = useState(null);

  // ⭐ تعديل وصفة منتج مصنّع موجود
  const [showEditRecipeDialog, setShowEditRecipeDialog] = useState(null); // المنتج الجاري تعديله
  const [editRecipeForm, setEditRecipeForm] = useState({
    recipe: [],
    piece_weight: '',
    piece_weight_unit: 'غرام',
    reason: '',
    name: '',
    name_en: '',
  });
  const [editNewIngredient, setEditNewIngredient] = useState({
    raw_material_id: '',
    quantity: 0,
    input_unit: '',
  });
  const [savingRecipe, setSavingRecipe] = useState(false);
  
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
      const payload = { ...rawMaterialForm };
      // تنظيف pack_* — إن لم تكن الوحدة قطعة/علبة/كرتون، نُلغيها كي لا تُحفظ بالخطأ
      if (!['قطعة', 'علبة', 'كرتون'].includes(payload.unit)) {
        payload.pack_quantity = null;
        payload.pack_unit = null;
      } else {
        const pq = parseFloat(payload.pack_quantity);
        payload.pack_quantity = (pq && pq > 0) ? pq : null;
        if (!payload.pack_quantity) payload.pack_unit = null;
      }
      await axios.post(`${API}/raw-materials-new`, payload, { headers });
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
        category: '',
        pack_quantity: '',
        pack_unit: 'غرام',
      });
      fetchData();
    } catch (error) {
      showApiError(error, t('فشل في إضافة المادة'));
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
      showApiError(error, t('فشل في إضافة المادة'));
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
      showApiError(error, t('فشل في إضافة الكمية'));
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
      showApiError(error, t('فشل في إرسال الطلب'));
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
      showApiError(error, t('فشل في الموافقة'));
    }
  };
  
  // تحويل مواد التغليف للفرع
  const handleTransferPackagingRequest = async (requestId) => {
    try {
      await axios.post(`${API}/packaging-requests/${requestId}/transfer`, {}, { headers });
      toast.success(t('تم تحويل المواد للفرع بنجاح'));
      fetchData();
    } catch (error) {
      showApiError(error, t('فشل في التحويل'));
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
        showApiError(error, t('فشل في التحويل'));
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
      showApiError(error, t('فشل في التحويل'));
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
        showApiError(error, t('فشل في تنفيذ الطلب'));
      }
    } finally {
      setSubmitting(false);
    }
  };
  
  // 🔁 تحويل وحدات الوزن/الحجم — يُرجع الكمية بوحدة المادة الأصلية + ملاحظة بالتحويل
  // مثال: المستخدم أدخل 100 غرام، والمادة بالكغم → يُحوَّل إلى 0.1 كغم.
  const _UNIT_GROUPS = {
    weight: { 'غرام': 0.001, 'كغم': 1, 'كيلو': 1, 'كجم': 1, 'gram': 0.001, 'kg': 1 },
    volume: { 'مل': 0.001, 'لتر': 1, 'ml': 0.001, 'liter': 1, 'l': 1 },
    count: { 'قطعة': 1, 'حبة': 1, 'piece': 1, 'علبة': 1, 'كرتون': 1, 'صحن': 1 },
  };
  const _findUnitGroup = (u) => {
    if (!u) return null;
    const k = String(u).trim();
    for (const [g, units] of Object.entries(_UNIT_GROUPS)) {
      if (Object.prototype.hasOwnProperty.call(units, k)) return g;
    }
    return null;
  };
  const convertQuantityToMaterialUnit = (qty, inputUnit, materialUnit) => {
    const n = Number(qty) || 0;
    if (!inputUnit || inputUnit === materialUnit) return { qty: n, converted: false };
    const gIn = _findUnitGroup(inputUnit);
    const gMat = _findUnitGroup(materialUnit);
    if (!gIn || !gMat || gIn !== gMat) return { qty: n, converted: false }; // لا تحويل بين عائلات مختلفة
    const baseIn = _UNIT_GROUPS[gIn][inputUnit];   // قيمة الإدخال بالوحدة الأساسية
    const baseMat = _UNIT_GROUPS[gMat][materialUnit];
    const inBaseQty = n * baseIn;
    const converted = Math.round((inBaseQty / baseMat) * 1e6) / 1e6; // قرّب لإزالة floating-point noise
    return { qty: converted, converted: true, fromUnit: inputUnit, toUnit: materialUnit };
  };

  // قائمة وحدات الإدخال المتاحة لمادة معيّنة (نفس عائلتها)
  // إن كانت المادة بوحدة قطعية لكن لها وزن داخلي (pack_quantity + pack_unit) — نُضيف وحدات الإدخال من عائلة الوزن/الحجم.
  const availableInputUnitsFor = (materialUnit, packUnit) => {
    const g = _findUnitGroup(materialUnit);
    if (!g) return [materialUnit].filter(Boolean);
    const own = Object.keys(_UNIT_GROUPS[g]).filter(u => !['gram','kg','ml','liter','l','piece'].includes(u));
    // إن كانت المادة "قطعية" (count) ولها pack_unit ضمن عائلة أخرى — أضف وحدات تلك العائلة
    if (g === 'count' && packUnit) {
      const pg = _findUnitGroup(packUnit);
      if (pg && pg !== 'count') {
        const extra = Object.keys(_UNIT_GROUPS[pg]).filter(u => !['gram','kg','ml','liter','l','piece'].includes(u));
        return [...own, ...extra];
      }
    }
    return own;
  };

  // البحث عن معلومات التعبئة (pack_quantity + pack_unit) لمادة من قائمة المواد الخام الرئيسية
  const _packInfoFor = (materialId) => {
    const m = rawMaterials.find(r => r.id === materialId);
    if (!m) return null;
    const pq = Number(m.pack_quantity || 0);
    const pu = m.pack_unit;
    if (pq > 0 && pu) return { pack_quantity: pq, pack_unit: pu };
    return null;
  };

  // ⭐ تنسيق ذكي للكميات في الواجهة:
  // - يحذف floating-point noise (0.17500000000000002 → 0.175)
  // - يُحوّل تلقائياً للوحدة الأنسب (0.175 كغم → 175 غرام)
  // - يُرجع { value, unit, text }
  const formatRecipeQuantity = (rawQty, rawUnit) => {
    const qty = Number(rawQty) || 0;
    const unit = rawUnit || '';
    const grp = _findUnitGroup(unit);
    let displayQty = qty;
    let displayUnit = unit;
    // تحويل وزن: إذا < 1 كغم → غرام
    if (grp === 'weight') {
      const baseFactor = _UNIT_GROUPS.weight[unit] || 1; // 0.001 لـ غرام، 1 لـ كغم
      const grams = qty * baseFactor * 1000;
      if (qty < 1 && ['كغم','كيلو','كجم','kg'].includes(unit) && grams >= 1) {
        displayQty = grams;
        displayUnit = 'غرام';
      }
    }
    // تحويل حجم: إذا < 1 لتر → مل
    if (grp === 'volume') {
      const baseFactor = _UNIT_GROUPS.volume[unit] || 1;
      const ml = qty * baseFactor * 1000;
      if (qty < 1 && ['لتر','liter','l'].includes(unit) && ml >= 1) {
        displayQty = ml;
        displayUnit = 'مل';
      }
    }
    // إزالة floating-point noise: قرّب إلى 3 خانات عشرية ثم أزل الأصفار اللاحقة
    let rounded = Math.round(displayQty * 1000) / 1000;
    let str = rounded.toString();
    if (str.includes('.')) {
      str = str.replace(/\.?0+$/, '');
    }
    return { value: rounded, unit: displayUnit, text: `${str} ${displayUnit}`.trim() };
  };

  // ⭐ تحويل بين عائلات مختلفة (وزن/حجم → قطعة) باستخدام pack info
  // مثال: 9 كغم → قطعة (إذا كانت القطعة = 4.5 كغم) ⇒ 2 قطعة
  const convertWithPackInfo = (qty, inputUnit, materialUnit, packInfo) => {
    if (!packInfo) return null;
    const gIn = _findUnitGroup(inputUnit);
    const gPack = _findUnitGroup(packInfo.pack_unit);
    if (!gIn || !gPack || gIn !== gPack) return null;
    // حوّل كمية الإدخال إلى وحدة pack الأساسية
    const baseIn = _UNIT_GROUPS[gIn][inputUnit];
    const basePack = _UNIT_GROUPS[gPack][packInfo.pack_unit];
    const qtyInPackUnit = (Number(qty) || 0) * baseIn / basePack;
    // قسمة على وزن القطعة الواحدة → عدد القطع
    const pieces = qtyInPackUnit / packInfo.pack_quantity;
    const piecesRounded = Math.round(pieces * 1e6) / 1e6;
    return { qty: piecesRounded, converted: true, fromUnit: inputUnit, toUnit: materialUnit, via: `${packInfo.pack_quantity} ${packInfo.pack_unit}/${materialUnit}` };
  };

  // ⭐ حفظ pack_info لمادة خام (يُحدّث rawMaterials لتمكين تحويل الوحدات)
  const savePackInfo = async () => {
    if (!packInfoEdit?.material_id || !packInfoEdit?.pack_quantity || !packInfoEdit?.pack_unit) {
      toast.error(t('أكمل الكمية والوحدة'));
      return;
    }
    try {
      await axios.put(`${API}/raw-materials/${packInfoEdit.material_id}`, {
        pack_quantity: Number(packInfoEdit.pack_quantity),
        pack_unit: packInfoEdit.pack_unit,
      }, { headers });
      toast.success(t('تم حفظ محتوى العلبة'));
      setPackInfoEdit(null);
      await fetchData(); // إعادة تحميل rawMaterials ليحدّث الوحدات المتاحة في الـ select
    } catch (error) {
      showApiError(error, t('فشل في حفظ محتوى العلبة'));
    }
  };

  // ⭐ احتساب تكلفة الوحدة لمنتج مُصنّع (لاستخدامه عند ربط منتج مصنع كمكوّن في وصفة أخرى)
  const _computeMfgUnitCost = (mp) => {
    if (!mp) return 0;
    const batchCost = Number(mp.raw_material_cost_after_waste) || Number(mp.production_cost) || Number(mp.raw_material_cost) || 0;
    const _W = { 'غرام': 1, 'كغم': 1000, 'كيلو': 1000, 'كجم': 1000, 'gram': 1, 'kg': 1000, 'مل': 1, 'لتر': 1000 };
    const pw = Number(mp.piece_weight || 0);
    const pwu = mp.piece_weight_unit || 'غرام';
    const pieceGrams = pw * (_W[pwu] || 1);
    let totalGrams = 0;
    const _COUNT = new Set(['قطعة','حبة','علبة','كرتون','صحن','piece']);
    for (const ing of (mp.recipe || [])) {
      const q = Number(ing.quantity || 0);
      const f = _W[ing.unit];
      if (f) totalGrams += q * f;
      else if (_COUNT.has(ing.unit)) {
        const mat = rawMaterials?.find?.(r => r.id === ing.raw_material_id);
        if (mat?.pack_quantity && mat?.pack_unit) {
          const pf = _W[mat.pack_unit] || 0;
          if (pf > 0) totalGrams += q * Number(mat.pack_quantity) * pf;
        }
      }
    }
    const calcYield = (pieceGrams > 0 && totalGrams > 0) ? totalGrams / pieceGrams : 0;
    const denom = calcYield || Number(mp.quantity) || 1;
    return batchCost / denom;
  };

  // إضافة مكون للوصفة (يدعم مادة خام أو منتج مُصنّع)
  const addIngredientToRecipe = () => {
    if (newIngredient.quantity <= 0) {
      toast.error(t('حدد الكمية'));
      return;
    }
    // ─── منتج مُصنّع كمكوّن ───
    if (newIngredient.source === 'manufactured') {
      if (!newIngredient.manufactured_product_id) {
        toast.error(t('اختر المنتج المُصنّع'));
        return;
      }
      const mp = manufacturedProducts.find(m => m.id === newIngredient.manufactured_product_id);
      if (!mp) {
        toast.error(t('المنتج المُصنّع غير موجود'));
        return;
      }
      // منع التكرار
      const exists = productForm.recipe.find(r => r.manufactured_product_id === mp.id);
      if (exists) {
        toast.error(t('هذا المنتج موجود بالفعل في الوصفة'));
        return;
      }
      // ⭐ تحويل الكمية المُدخلة إلى عدد حبات (وحدة المنتج الأصلية) بناءً على piece_weight
      const _W = { 'غرام': 1, 'كغم': 1000, 'كيلو': 1000, 'كجم': 1000, 'gram': 1, 'kg': 1000, 'مل': 1, 'لتر': 1000, 'ml': 1, 'liter': 1000, 'l': 1000 };
      const mpUnit = mp.unit || 'حبة';
      const inputUnit = newIngredient.input_unit || mpUnit;
      let qty = Number(newIngredient.quantity);
      // إذا اختار المستخدم وحدة وزن مختلفة عن وحدة المنتج → حوّل عبر piece_weight
      if (inputUnit !== mpUnit) {
        const fIn = _W[inputUnit];
        const pw = Number(mp.piece_weight || 0);
        const pwu = mp.piece_weight_unit || 'غرام';
        const fPw = _W[pwu];
        if (fIn && pw > 0 && fPw) {
          const pieceGrams = pw * fPw;
          const qtyInGrams = qty * fIn;
          const piecesCount = qtyInGrams / pieceGrams;
          toast.info(`${t('تم تحويل')} ${qty} ${inputUnit} → ${piecesCount.toFixed(3)} ${mpUnit} (1 ${mpUnit} = ${pw} ${pwu})`);
          qty = Math.round(piecesCount * 1e6) / 1e6;
        }
      }
      const unitCost = _computeMfgUnitCost ? _computeMfgUnitCost(mp) : 0;
      setProductForm(prev => ({
        ...prev,
        recipe: [...prev.recipe, {
          manufactured_product_id: mp.id,
          raw_material_name: mp.name,
          quantity: qty,
          unit: mpUnit,
          cost_per_unit: unitCost,
          waste_percentage: 0,
          source: 'manufactured',
          input_unit: inputUnit,
          input_quantity: Number(newIngredient.quantity) || 0,
        }]
      }));
      setNewIngredient({ source: 'manufactured', raw_material_id: '', manufactured_product_id: '', quantity: 0, input_unit: '' });
      toast.success(t('تمت إضافة المنتج المُصنّع للوصفة'));
      return;
    }
    // ─── مادة خام (السلوك الأصلي) ───
    if (!newIngredient.raw_material_id) {
      toast.error(t('اختر مادة خام وحدد الكمية'));
      return;
    }
    // البحث في مخزون التصنيع (يدعم كلا اسمي الحقول للتوافق مع البيانات القديمة)
    const material = manufacturingInventory.find(m =>
      (m.material_id || m.raw_material_id) === newIngredient.raw_material_id
    );
    if (!material) {
      toast.error(t('المادة غير موجودة في مخزون التصنيع'));
      return;
    }
    // جلب نسبة الهدر من جدول raw_materials الأصلي (لأن manufacturing_inventory لا يحفظها)
    const rawMaster = rawMaterials.find(m => m.id === newIngredient.raw_material_id);
    const wastePct = rawMaster?.waste_percentage || material.waste_percentage || 0;
    
    const exists = productForm.recipe.find(r => r.raw_material_id === newIngredient.raw_material_id);
    if (exists) {
      toast.error(t('هذه المادة موجودة بالفعل في الوصفة'));
      return;
    }
    
    const matId = material.material_id || material.raw_material_id;
    const matName = material.material_name || material.raw_material_name || rawMaster?.name || '';
    // 🔁 حوّل الكمية المُدخلة بوحدة المستخدم إلى وحدة المادة الأصلية
    const inputUnit = newIngredient.input_unit || material.unit;
    let conv = convertQuantityToMaterialUnit(newIngredient.quantity, inputUnit, material.unit);
    // إن كانت العائلتان مختلفتين (مثلاً قطعة ↔ كغم) — حاول استخدام معلومات التعبئة
    if (!conv.converted && inputUnit !== material.unit) {
      const packInfo = _packInfoFor(matId);
      const packConv = convertWithPackInfo(newIngredient.quantity, inputUnit, material.unit, packInfo);
      if (packConv) conv = packConv;
    }
    if (conv.converted) {
      toast.info(`${t('تم تحويل')} ${newIngredient.quantity} ${inputUnit} → ${conv.qty.toFixed(3)} ${material.unit}${conv.via ? ` (${conv.via})` : ''}`);
    }
    setProductForm(prev => ({
      ...prev,
      recipe: [...prev.recipe, {
        raw_material_id: matId,
        raw_material_name: matName,
        quantity: conv.qty,
        unit: material.unit,
        cost_per_unit: material.cost_per_unit || 0,
        waste_percentage: wastePct,
        // معلومات التحويل (للعرض)
        input_unit: inputUnit,
        input_quantity: Number(newIngredient.quantity) || 0,
        source: 'raw',
      }]
    }));
    
    setNewIngredient({ source: 'raw', raw_material_id: '', manufactured_product_id: '', quantity: 0, input_unit: '' });
  };
  // ⭐ مزامنة الوصفة لتطابق الكمية المُصنّعة فعلياً (ضبط نسبي للمكونات)
  // ⭐ Sync Recipe — Step 1: حساب الفرق وعرض معاينة قبل التطبيق
  const [syncPreview, setSyncPreview] = useState(null);

  const syncRecipeToProducedQty = (product) => {
    try {
      const _W = {
        'غرام': 1, 'كغم': 1000, 'كيلو': 1000, 'كجم': 1000, 'gram': 1, 'kg': 1000,
        'مل': 1, 'لتر': 1000, 'ml': 1, 'liter': 1000, 'l': 1000
      };
      const _COUNT = new Set(['قطعة', 'حبة', 'علبة', 'كرتون', 'صحن', 'piece']);
      const pw = Number(product.piece_weight || 0);
      const pwu = product.piece_weight_unit || 'غرام';
      const pieceGrams = pw * (_W[pwu] || 1);
      let totalGrams = 0;
      for (const ing of (product.recipe || [])) {
        const q = Number(ing.quantity || 0);
        const f = _W[ing.unit];
        if (f) {
          totalGrams += q * f;
        } else if (_COUNT.has(ing.unit)) {
          const mat = rawMaterials?.find?.(r => r.id === ing.raw_material_id);
          if (mat && mat.pack_quantity && mat.pack_unit) {
            const pf = _W[mat.pack_unit] || 0;
            if (pf > 0) totalGrams += q * Number(mat.pack_quantity) * pf;
          }
        }
      }
      const calcYield = (pieceGrams > 0 && totalGrams > 0) ? totalGrams / pieceGrams : 0;
      const targetQty = Number(product.quantity || 0);
      if (calcYield <= 0 || targetQty <= 0) {
        toast.error(t('لا يمكن المزامنة — تأكد من وجود وزن قطعة + كمية مُصنّعة'));
        return;
      }
      const scale = targetQty / calcYield;
      if (Math.abs(scale - 1.0) < 0.0001) {
        toast.info(t('الوصفة متطابقة مع الكمية المُصنّعة — لا حاجة للمزامنة'));
        return;
      }

      // بناء جدول المقارنة
      const rows = (product.recipe || []).map(ing => {
        const oldQty = Number(ing.quantity) || 0;
        const newQty = Math.round(oldQty * scale * 1e6) / 1e6;
        const oldCost = oldQty * (Number(ing.cost_per_unit) || 0);
        const newCost = newQty * (Number(ing.cost_per_unit) || 0);
        return {
          raw_material_id: ing.raw_material_id,
          name: ing.raw_material_name || rawMaterials?.find?.(r => r.id === ing.raw_material_id)?.name || '—',
          unit: ing.unit,
          oldQty,
          newQty,
          delta: newQty - oldQty,
          oldCost,
          newCost,
          cost_per_unit: Number(ing.cost_per_unit) || 0,
          waste_percentage: Number(ing.waste_percentage) || 0,
        };
      });
      const totalOldCost = rows.reduce((s, r) => s + r.oldCost, 0);
      const totalNewCost = rows.reduce((s, r) => s + r.newCost, 0);

      setSyncPreview({
        product,
        scale,
        calcYield,
        targetQty,
        rows,
        totalOldCost,
        totalNewCost,
      });
    } catch (e) {
      toast.error(t('فشل في حساب المعاينة'));
    }
  };

  // ⭐ Sync Recipe — Step 2: تطبيق المعاينة بعد تأكيد المستخدم
  const applySyncPreview = async () => {
    if (!syncPreview) return;
    try {
      const { product, scale, targetQty, rows } = syncPreview;
      const newRecipe = rows.map(r => ({
        raw_material_id: r.raw_material_id,
        raw_material_name: r.name,
        quantity: r.newQty,
        unit: r.unit,
        cost_per_unit: r.cost_per_unit,
        waste_percentage: r.waste_percentage,
      }));
      await axios.patch(`${API}/manufactured-products/${product.id}/recipe`, {
        recipe: newRecipe,
        piece_weight: product.piece_weight,
        piece_weight_unit: product.piece_weight_unit,
        reason: `مزامنة الوصفة مع الكمية المُصنّعة (${targetQty} ${product.unit || 'حبة'}) — عامل التحجيم ×${scale.toFixed(6)}`,
      }, { headers });
      toast.success(t('تمت مزامنة الوصفة بنجاح') + ` (×${scale.toFixed(4)})`);
      setSyncPreview(null);
      fetchData();
    } catch (error) {
      showApiError(error, t('فشلت المزامنة'));
    }
  };

  // حذف مكون من الوصفة
  const removeIngredientFromRecipe = (index) => {
    setProductForm(prev => ({
      ...prev,
      recipe: prev.recipe.filter((_, i) => i !== index)
    }));
  };

  // ===================== ⭐ تعديل وصفة منتج موجود =====================
  const openEditRecipe = (product) => {
    setEditRecipeForm({
      recipe: (product.recipe || []).map(ing => ({
        raw_material_id: ing.raw_material_id,
        raw_material_name: ing.raw_material_name,
        quantity: Number(ing.quantity) || 0,
        unit: ing.unit,
        cost_per_unit: Number(ing.cost_per_unit) || 0,
        waste_percentage: Number(ing.waste_percentage) || 0,
        input_unit: ing.input_unit || ing.unit,
        input_quantity: ing.input_quantity ?? ing.quantity,
      })),
      piece_weight: product.piece_weight ?? '',
      piece_weight_unit: product.piece_weight_unit || 'غرام',
      reason: '',
      name: product.name || '',
      name_en: product.name_en || '',
    });
    setEditNewIngredient({ raw_material_id: '', quantity: 0, input_unit: '' });
    setShowEditRecipeDialog(product);
  };

  const addIngredientToEditRecipe = () => {
    if (!editNewIngredient.raw_material_id || editNewIngredient.quantity <= 0) {
      toast.error(t('اختر مادة خام وحدد الكمية'));
      return;
    }
    const material = manufacturingInventory.find(m =>
      (m.material_id || m.raw_material_id) === editNewIngredient.raw_material_id
    );
    if (!material) {
      toast.error(t('المادة غير موجودة في مخزون التصنيع'));
      return;
    }
    const rawMaster = rawMaterials.find(m => m.id === editNewIngredient.raw_material_id);
    const wastePct = rawMaster?.waste_percentage || material.waste_percentage || 0;

    const exists = editRecipeForm.recipe.find(r => r.raw_material_id === editNewIngredient.raw_material_id);
    if (exists) {
      toast.error(t('هذه المادة موجودة بالفعل في الوصفة'));
      return;
    }
    const matId = material.material_id || material.raw_material_id;
    const matName = material.material_name || material.raw_material_name || rawMaster?.name || '';
    const inputUnit = editNewIngredient.input_unit || material.unit;
    let conv = convertQuantityToMaterialUnit(editNewIngredient.quantity, inputUnit, material.unit);
    if (!conv.converted && inputUnit !== material.unit) {
      const packInfo = _packInfoFor(matId);
      const packConv = convertWithPackInfo(editNewIngredient.quantity, inputUnit, material.unit, packInfo);
      if (packConv) conv = packConv;
    }
    if (conv.converted) {
      toast.info(`${t('تم تحويل')} ${editNewIngredient.quantity} ${inputUnit} → ${conv.qty.toFixed(3)} ${material.unit}${conv.via ? ` (${conv.via})` : ''}`);
    }
    setEditRecipeForm(prev => ({
      ...prev,
      recipe: [...prev.recipe, {
        raw_material_id: matId,
        raw_material_name: matName,
        quantity: conv.qty,
        unit: material.unit,
        cost_per_unit: material.cost_per_unit || 0,
        waste_percentage: wastePct,
        input_unit: inputUnit,
        input_quantity: Number(editNewIngredient.quantity) || 0,
      }]
    }));
    setEditNewIngredient({ raw_material_id: '', quantity: 0, input_unit: '' });
  };

  const removeIngredientFromEditRecipe = (index) => {
    setEditRecipeForm(prev => ({
      ...prev,
      recipe: prev.recipe.filter((_, i) => i !== index)
    }));
  };

  const updateEditIngredientQty = (index, qty) => {
    setEditRecipeForm(prev => ({
      ...prev,
      recipe: prev.recipe.map((ing, i) => i === index ? { ...ing, quantity: parseFloat(qty) || 0 } : ing)
    }));
  };

  const calculateEditRecipeCost = () => {
    return editRecipeForm.recipe.reduce((s, ing) => s + (Number(ing.quantity || 0) * Number(ing.cost_per_unit || 0)), 0);
  };
  const calculateEditRecipeCostAfterWaste = () => {
    return editRecipeForm.recipe.reduce((s, ing) => {
      const baseCost = Number(ing.cost_per_unit || 0);
      const wastePct = Number(ing.waste_percentage || 0);
      const effective = wastePct > 0 && wastePct < 100 ? baseCost / (1 - wastePct / 100) : baseCost;
      return s + Number(ing.quantity || 0) * effective;
    }, 0);
  };

  const handleUpdateRecipe = async () => {
    if (!showEditRecipeDialog) return;
    if (editRecipeForm.recipe.length === 0) {
      toast.error(t('الوصفة لا يمكن أن تكون فارغة'));
      return;
    }
    setSavingRecipe(true);
    try {
      const payload = {
        recipe: editRecipeForm.recipe.map(ing => {
          const base = {
            raw_material_name: ing.raw_material_name,
            quantity: Number(ing.quantity) || 0,
            unit: ing.unit,
            cost_per_unit: Number(ing.cost_per_unit) || 0,
            waste_percentage: Number(ing.waste_percentage) || 0,
          };
          // ⭐ احفظ المعرّف الصحيح بحسب نوع المكوّن (مادة خام أو منتج مُصنّع)
          if (ing.manufactured_product_id) {
            base.manufactured_product_id = ing.manufactured_product_id;
            base.source = ing.source || 'manufactured';
            if (ing.raw_material_id) base.raw_material_id = ing.raw_material_id;
          } else {
            base.raw_material_id = ing.raw_material_id;
            if (ing.source) base.source = ing.source;
          }
          return base;
        }),
        piece_weight: editRecipeForm.piece_weight !== '' ? Number(editRecipeForm.piece_weight) : null,
        piece_weight_unit: editRecipeForm.piece_weight_unit || null,
        reason: editRecipeForm.reason || '',
        name: editRecipeForm.name || undefined,
        name_en: editRecipeForm.name_en || undefined,
      };
      await axios.patch(`${API}/manufactured-products/${showEditRecipeDialog.id}/recipe`, payload, { headers });
      toast.success(t('تم تحديث الوصفة بنجاح'));
      setShowEditRecipeDialog(null);
      fetchData();
    } catch (error) {
      showApiError(error, t('فشل في تحديث الوصفة'));
    } finally {
      setSavingRecipe(false);
    }
  };
  // حساب تكلفة الوصفة (قيمتان: قبل الهدر + بعد الهدر)
  const calculateRecipeCost = () => {
    // قبل الهدر = الكمية × تكلفة الوحدة الأصلية
    return productForm.recipe.reduce((sum, ing) => sum + (ing.quantity * (ing.cost_per_unit || 0)), 0);
  };
  const calculateRecipeCostAfterWaste = () => {
    // بعد الهدر = الكمية × التكلفة الفعلية (cost / (1 - waste_pct/100))
    return productForm.recipe.reduce((sum, ing) => {
      const baseCost = ing.cost_per_unit || 0;
      const wastePct = ing.waste_percentage || 0;
      const effectiveCost = wastePct > 0 ? baseCost / (1 - wastePct / 100) : baseCost;
      return sum + (ing.quantity * effectiveCost);
    }, 0);
  };

  // ⭐ مجموع وزن المكونات (للوزن فقط — يتجاهل المكونات الحجمية أو القطعية)
  // يُرجع: { total_grams, has_weight_ingredients }
  const calculateRecipeTotalWeight = () => {
    let totalGrams = 0;
    let hasWeight = false;
    for (const ing of productForm.recipe) {
      const grp = _findUnitGroup(ing.unit);
      if (grp !== 'weight') continue;
      hasWeight = true;
      // حوّل لـ غرام (الوحدة الأساسية)
      const factor = _UNIT_GROUPS.weight[ing.unit] || 0;
      totalGrams += Number(ing.quantity || 0) * factor * 1000; // base×1000 = grams
    }
    return { total_grams: totalGrams, has_weight: hasWeight };
  };

  // ⭐ احتساب عدد القطع المنتجة من الدفعة (إذا كان وزن القطعة محدداً)
  const calculatePiecesFromBatch = () => {
    const { total_grams, has_weight } = calculateRecipeTotalWeight();
    if (!has_weight) return null;
    const pw = Number(productForm.piece_weight || 0);
    if (!pw || pw <= 0) return null;
    const pwUnit = productForm.piece_weight_unit || 'غرام';
    const factor = _UNIT_GROUPS.weight[pwUnit] || 0.001;
    const pieceGrams = pw * factor * 1000;
    if (pieceGrams <= 0) return null;
    return {
      total_grams,
      piece_grams: pieceGrams,
      pieces_count: Math.floor(total_grams / pieceGrams),
    };
  };
  // 🔧 مزامنة شاملة: ربط مكونات الوصفات اليتيمة بأسمائها تلقائياً
  const handleSyncOrphanIngredients = async () => {
    if (!window.confirm(t('سيتم فحص جميع الوصفات وربط المكونات اليتيمة بأسمائها تلقائياً. هل تريد المتابعة؟'))) {
      return;
    }
    setSyncOrphansLoading(true);
    try {
      const res = await axios.post(`${API}/manufactured-products/sync-orphan-ingredients`, {}, { headers });
      setSyncOrphansResult(res.data);
      const linkedCount = res.data.linked || 0;
      const miSynced = res.data.mfg_inventory_synced || 0;
      if (linkedCount > 0 || miSynced > 0) {
        toast.success(`${t('تمت المزامنة')}: ${linkedCount} ${t('مكوّن')} + ${miSynced} ${t('سجل تصنيع')}`);
        fetchData();
      } else if (res.data.orphans_total === 0 && (res.data.mfg_inventory_orphans || []).length === 0) {
        toast.info(t('لا توجد مشاكل. كل البيانات سليمة!'));
      } else {
        toast.info(`${t('لم يتم ربط أي مكوّن')} (${res.data.unmatched_count} ${t('غير متطابق')})`);
      }
    } catch (error) {
      showApiError(error, t('فشل في المزامنة الشاملة'));
    } finally {
      setSyncOrphansLoading(false);
    }
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
      // ✨ تكلفة التصنيع = مجموع تكاليف المكونات بعد نسبة الهدر (التكلفة الفعلية)
      // قبل الهدر = للمحاسبة على الموردين | بعد الهدر = للاحتساب في المبيعات
      const costBeforeWaste = calculateRecipeCost();
      const costAfterWaste = calculateRecipeCostAfterWaste();
      const payload = {
        ...productForm,
        production_cost: parseFloat(costAfterWaste.toFixed(2)),  // التكلفة المعتمدة
        cost_before_waste: parseFloat(costBeforeWaste.toFixed(2)),  // مرجعية للموردين
        // نُبقي selling_price = 0 (هذا حقل قديم، التكلفة هي الأهم؛ سعر البيع يُحدَّد في قائمة الطعام)
        selling_price: 0,
      };
      await axios.post(`${API}/manufactured-products`, payload, { headers });
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
      showApiError(error, t('فشل في إضافة المنتج'));
    } finally {
      setSubmitting(false);
    }
  };
  // تصنيع منتج
  const handleProduce = async () => {
    if (!showProduceDialog || produceQuantity <= 0) return;
    
    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/manufactured-products/${showProduceDialog.id}/produce?quantity=${produceQuantity}`, {}, { headers });
      const d = res.data || {};
      if (d.recipe_scaled) {
        toast.success(
          t('تم التصنيع بنجاح') +
          ` · ${t('تم تعديل الوصفة تلقائياً لتُنتج بالضبط')} ${produceQuantity} ${showProduceDialog.unit || 'حبة'} (${t('عامل')}: ×${d.scale_factor})`
        );
      } else {
        toast.success(t('تم التصنيع بنجاح'));
      }
      setShowProduceDialog(null);
      setProduceQuantity(1);
      fetchData();
    } catch (error) {
      const detail = error.response?.data?.detail;
      if (typeof detail === 'object' && detail.insufficient_materials) {
        // ⭐ عرض تفصيل المواد الناقصة في Toast
        const list = detail.insufficient_materials
          .map(m => `• ${m.name}: ${t('مطلوب')} ${formatRecipeQuantity(m.needed, m.unit).text} · ${t('متوفر')} ${formatRecipeQuantity(m.available, m.unit).text}`)
          .join('\n');
        toast.error(`${t('مواد غير كافية')}\n${list}`, { duration: 10000, style: { whiteSpace: 'pre-line' } });
      } else {
        showApiError(error, t('فشل في التصنيع'));
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
      const res = await axios.post(`${API}/manufactured-products/${showAddStockDialog.id}/add-stock?quantity=${addStockQuantity}`, {}, { headers });
      const d = res.data || {};
      if (d.recipe_scaled) {
        toast.success(
          t('تم زيادة الكمية بنجاح') +
          ` · ${t('تمت مزامنة الوصفة تلقائياً')} (×${d.scale_factor})`
        );
      } else {
        toast.success(t('تم زيادة الكمية بنجاح'));
      }
      setShowAddStockDialog(null);
      setAddStockQuantity(1);
      fetchData();
    } catch (error) {
      showApiError(error, t('فشل في زيادة الكمية'));
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
      showApiError(error, t('فشل في زيادة الكمية'));
    } finally {
      setSubmitting(false);
    }
  };

  // === تعديل المادة الخام (قبل التحويل فقط) ===
  const handleUpdateRawMaterial = async () => {
    if (!editRawMaterial) return;
    setSubmitting(true);
    try {
      const payload = {
        name: editRawMaterial.name,
        unit: editRawMaterial.unit,
        quantity: parseFloat(editRawMaterial.quantity) || 0,
        cost_per_unit: parseFloat(editRawMaterial.cost_per_unit) || 0,
        min_quantity: parseFloat(editRawMaterial.min_quantity) || 0,
        category: editRawMaterial.category || null,
        waste_percentage: parseFloat(editRawMaterial.waste_percentage) || 0,
        pack_quantity: ['قطعة', 'علبة', 'كرتون'].includes(editRawMaterial.unit)
          ? (parseFloat(editRawMaterial.pack_quantity) || null)
          : null,
        pack_unit: ['قطعة', 'علبة', 'كرتون'].includes(editRawMaterial.unit) && parseFloat(editRawMaterial.pack_quantity) > 0
          ? (editRawMaterial.pack_unit || 'غرام')
          : null,
      };
      await axios.put(`${API}/raw-materials-new/${editRawMaterial.id}`, payload, { headers });
      toast.success(t('تم تحديث المادة بنجاح'));
      setEditRawMaterial(null);
      fetchData();
    } catch (error) {
      showApiError(error, t('فشل في تحديث المادة'));
    } finally {
      setSubmitting(false);
    }
  };

  // === حذف المادة الخام (قبل التحويل فقط، للمالك) ===
  const handleDeleteRawMaterial = async () => {
    if (!deleteRawMaterial) return;
    setSubmitting(true);
    try {
      await axios.delete(`${API}/raw-materials-new/${deleteRawMaterial.id}`, { headers });
      toast.success(t('تم حذف المادة بنجاح'));
      setDeleteRawMaterial(null);
      fetchData();
    } catch (error) {
      showApiError(error, t('فشل في حذف المادة'));
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
      showApiError(error, t('فشل في إرسال الطلب'));
    } finally {
      setSubmitting(false);
    }
  };
  
  // تنفيذ طلب المواد من المخزن
  const handleFulfillManufacturingRequest = async (requestId, customItems = null, partial = false, notesToMfg = '') => {
    setSubmitting(true);
    try {
      const body = {};
      if (customItems) body.items = customItems;
      if (partial) {
        body.partial = true;
        if (notesToMfg) body.notes_to_manufacturing = notesToMfg;
      }
      const res = await axios.post(`${API}/manufacturing-requests/${requestId}/fulfill`, body, { headers });
      const isPartial = res.data?.partial;
      toast.success(isPartial
        ? t('تم التنفيذ الجزئي — تم إخطار قسم التصنيع بالكميات المتبقية')
        : t('تم تنفيذ الطلب وتحويل المواد للتصنيع'));
      // أغلق dialog إن كان مفتوحاً
      setMfgFulfillDialog({ open: false, request: null, qtyOverrides: {}, partial: false, notes: '' });
      fetchData();
    } catch (error) {
      const detail = error.response?.data?.detail;
      if (typeof detail === 'object' && detail.insufficient_materials) {
        // ⭐ استخدم `requested` (Backend) بدلاً من `needed` (كانت تظهر undefined)
        const materials = detail.insufficient_materials
          .map(m => `${m.name}: ${t('طلب')} ${m.requested} · ${t('متوفر')} ${m.available}`)
          .join('\n');
        toast.error(`${t('مواد غير كافية')}:\n${materials}`);
      } else {
        toast.error((typeof detail === 'string' ? detail : detail?.message) || t('فشل في تنفيذ الطلب'));
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
      showApiError(error, t('فشل في استلام المشتريات'));
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
            {/* ⭐ جرس الإشعارات: تنفيذات جزئية من المخزن */}
            <Popover open={showNotifPopover} onOpenChange={setShowNotifPopover}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="icon" className="relative" data-testid="mfg-notif-bell">
                  <Bell className="h-4 w-4" />
                  {mfgNotifications.length > 0 && (
                    <span
                      className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center"
                      data-testid="mfg-notif-badge"
                    >
                      {mfgNotifications.length}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-96 max-h-[70vh] overflow-y-auto p-0" data-testid="mfg-notif-panel">
                <div className="p-3 border-b sticky top-0 bg-card z-10">
                  <h3 className="font-bold text-sm flex items-center gap-2">
                    <Bell className="h-4 w-4 text-amber-500" />
                    {t('إشعارات التصنيع')}
                    <span className="text-xs text-muted-foreground mr-auto">
                      {mfgNotifications.length} {t('غير مقروء')}
                    </span>
                  </h3>
                </div>
                {mfgNotifications.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    {t('لا توجد إشعارات جديدة')}
                  </div>
                ) : (
                  <div className="divide-y">
                    {mfgNotifications.map(n => (
                      <div key={n.id} className="p-3 space-y-2 hover:bg-muted/30" data-testid={`mfg-notif-item-${n.id}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm text-amber-700">
                              🚨 {t('وصل تحويل جزئي')} #{n.request_number}
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {t('من')}: {n.from_warehouse_user || '-'} · {n.notes_to_manufacturing || t('بانتظار شراء الباقي')}
                            </p>
                          </div>
                        </div>
                        {/* تفاصيل الأصناف */}
                        {n.items_summary && n.items_summary.length > 0 && (
                          <div className="space-y-1 text-xs bg-muted/40 rounded p-2">
                            {n.items_summary.map((it, i) => (
                              <div key={i} className="flex items-center justify-between">
                                <span className="font-medium">{it.material_name}</span>
                                <span className="tabular-nums text-muted-foreground">
                                  {it.sent_quantity} / {it.original_quantity} {it.unit}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* أزرار الإجراءات */}
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="flex-1 bg-green-600 hover:bg-green-700 h-8 text-xs"
                            onClick={() => ackMfgNotification(n.id, 'accept')}
                            data-testid={`mfg-notif-accept-${n.id}`}
                          >
                            <CheckCircle className="h-3 w-3 ml-1" />
                            {t('اعتمد واستخدم فوراً')}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 h-8 text-xs"
                            onClick={() => ackMfgNotification(n.id, 'wait')}
                            data-testid={`mfg-notif-wait-${n.id}`}
                          >
                            <Clock className="h-3 w-3 ml-1" />
                            {t('انتظر اكتمال الطلب')}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </PopoverContent>
            </Popover>
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
                  onClick={handleSyncOrphanIngredients}
                  disabled={syncOrphansLoading}
                  className="border-amber-500 text-amber-600 hover:bg-amber-50"
                  data-testid="sync-orphan-ingredients-btn"
                  title={t('فحص جميع الوصفات وربط المكونات بدون معرّفات بأسمائها تلقائياً')}
                >
                  <RefreshCw className={`h-4 w-4 ml-2 ${syncOrphansLoading ? 'animate-spin' : ''}`} />
                  {syncOrphansLoading ? t('جاري المزامنة...') : t('مزامنة شاملة')}
                </Button>
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
            <TabsTrigger value="movements" className="gap-2 px-4 py-2" data-testid="tab-movements">
              <ArrowUpDown className="h-4 w-4" />
              {t('حركات المخزن')}
            </TabsTrigger>
          </TabsList>
          {/* المخزن (المواد الخام) */}
          <TabsContent value="warehouse" className="space-y-4">
            {/* بانر التنبؤ بالنفاد + زر الجرد الشهري */}
            <div className="flex items-start gap-2 flex-wrap">
              <div className="flex-1 min-w-[300px]">
                <StockoutPredictionBanner onOpenDetails={() => setShowStockoutDialog(true)} />
              </div>
              <MonthlyStocktakeButton department="warehouse_raw" />
            </div>
            
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
                      onClick={() => {
                        setPurchaseRequestItems([{ raw_material_id: '', name: '', quantity: 0, unit: 'kg', notes: '' }]);
                        setPurchaseRequestNotes('');
                        setPurchaseRequestPriority('normal');
                        setShowPurchaseRequestModal(true);
                      }}
                      className="bg-green-500 hover:bg-green-600"
                      data-testid="open-purchase-request-modal-btn"
                    >
                      <ShoppingCart className="h-4 w-4 ml-2" />
                      {t('إنشاء طلب شراء')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
            
            {/* === قسم: طلبات الشراء بانتظار موافقة المالك (للمالك فقط) === */}
            {isAdmin && warehouseRequestsList.filter(r => r.status === 'pending_owner_approval').length > 0 && (
              <Card className="border-orange-500/40 bg-orange-500/5" data-testid="owner-approval-section">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Bell className="h-5 w-5 text-orange-500" />
                    <span className="font-bold text-orange-600">{t('طلبات شراء بانتظار موافقتك')}</span>
                    <Badge className="bg-orange-500 text-white">{warehouseRequestsList.filter(r => r.status === 'pending_owner_approval').length}</Badge>
                  </div>
                  <div className="space-y-3">
                    {warehouseRequestsList.filter(r => r.status === 'pending_owner_approval').map(req => (
                      <div key={req.id} className="p-3 bg-background rounded-lg border border-orange-500/30">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="font-bold">#{req.request_number} — {req.created_by_name || t('المخزن')}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(req.created_at).toLocaleString('ar-EG')}
                              {' · '}{t('الأولوية')}: <span className={
                                req.priority === 'urgent' ? 'text-red-500 font-bold' :
                                req.priority === 'high' ? 'text-orange-500 font-bold' : ''
                              }>{
                                req.priority === 'urgent' ? t('عاجل') :
                                req.priority === 'high' ? t('عالية') :
                                req.priority === 'low' ? t('منخفضة') : t('عادية')
                              }</span>
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600" onClick={() => approvePurchaseRequest(req.id)} data-testid={`approve-pr-${req.id}`}>
                              <CheckCircle className="h-4 w-4 ml-1" /> {t('موافقة')}
                            </Button>
                            <Button size="sm" variant="outline" className="border-red-500/50 text-red-500" onClick={() => rejectPurchaseRequest(req.id)} data-testid={`reject-pr-${req.id}`}>
                              <X className="h-4 w-4 ml-1" /> {t('رفض')}
                            </Button>
                          </div>
                        </div>
                        <div className="text-sm space-y-1">
                          {(req.items || []).map((it, i) => (
                            <div key={i} className="flex items-center gap-2 text-muted-foreground">
                              <span className="w-2 h-2 rounded-full bg-orange-400"></span>
                              <span>{it.name}</span>
                              <span className="text-xs">— {it.quantity} {it.unit}</span>
                            </div>
                          ))}
                          {req.notes && <p className="text-xs italic mt-1">📝 {req.notes}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            
            {/* قسم: طلبات الشراء الخاصة بأمين المخزن (لتتبع الحالة) */}
            {isWarehouseKeeper && warehouseRequestsList.filter(r => ['pending_owner_approval', 'approved_by_owner', 'priced_by_purchasing'].includes(r.status)).length > 0 && (
              <Card className="border-blue-500/30 bg-blue-500/5" data-testid="warehouse-my-requests">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="h-5 w-5 text-blue-500" />
                    <span className="font-bold text-blue-600">{t('طلبات الشراء قيد المعالجة')}</span>
                  </div>
                  <div className="space-y-2">
                    {warehouseRequestsList.filter(r => ['pending_owner_approval', 'approved_by_owner', 'priced_by_purchasing'].includes(r.status)).map(req => {
                      const statusLabel = {
                        pending_owner_approval: { txt: t('بانتظار موافقة المالك'), color: 'bg-orange-500/20 text-orange-600' },
                        approved_by_owner: { txt: t('معتمد — في المشتريات'), color: 'bg-blue-500/20 text-blue-600' },
                        priced_by_purchasing: { txt: t('تم التسعير — جاهز للاستلام'), color: 'bg-emerald-500/20 text-emerald-600' },
                      }[req.status] || { txt: req.status, color: 'bg-gray-500/20 text-gray-600' };
                      return (
                        <div key={req.id} className="flex items-center justify-between p-2 bg-background rounded border border-border">
                          <div>
                            <span className="font-bold">#{req.request_number}</span>
                            <span className="text-xs text-muted-foreground mr-2">({(req.items || []).length} {t('صنف')})</span>
                          </div>
                          <Badge className={statusLabel.color}>{statusLabel.txt}</Badge>
                        </div>
                      );
                    })}
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
                    {/* تعريف الوحدة (إن وُجد) */}
                    {material.pack_quantity && material.pack_unit && (
                      <div className="mt-2 inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-amber-100/60 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 border border-amber-300/40">
                        <Package className="h-3 w-3" />
                        {t('كل')} {material.unit} = {material.pack_quantity} {material.pack_unit}
                      </div>
                    )}
                    
                    {/* أزرار الإجراءات */}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 min-w-[120px]"
                        onClick={() => addItemToTransfer(material)}
                        data-testid={`add-to-transfer-${material.id}`}
                      >
                        <Send className="h-4 w-4 ml-2" />
                        {t('إضافة للتحويل')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-purple-500 text-purple-600 hover:bg-purple-50"
                        onClick={() => setShowAddRawMaterialStockDialog(material)}
                        data-testid={`add-raw-material-stock-btn-${material.id}`}
                        title={t('زيادة الكمية')}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                      {/* تعديل/حذف للمالك فقط، ومسموح فقط قبل التحويل للتصنيع */}
                      {isAdmin && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className={`${material.is_transferred ? 'opacity-40 cursor-not-allowed' : 'border-blue-500 text-blue-600 hover:bg-blue-50'}`}
                            onClick={() => !material.is_transferred && setEditRawMaterial({ ...material })}
                            disabled={!!material.is_transferred}
                            title={material.is_transferred ? t('مقفلة — تم التحويل للتصنيع') : t('تعديل المادة')}
                            data-testid={`edit-raw-material-btn-${material.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {/* ⭐ تصحيح إداري — يعمل حتى بعد التحويل (للأخطاء مثل غرام/كغم) */}
                          {material.is_transferred && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-amber-500 text-amber-600 hover:bg-amber-50"
                              onClick={() => setAdminCorrection({
                                material_id: material.id,
                                name: material.name || '',
                                name_en: material.name_en || '',
                                quantity: material.quantity,
                                min_quantity: material.min_quantity,
                                unit: material.unit,
                                cost_per_unit: material.cost_per_unit,
                                reason: '',
                              })}
                              title={t('تصحيح إداري لخطأ إدخال (مثل غرام/كغم)')}
                              data-testid={`admin-correct-btn-${material.id}`}
                            >
                              ⚡
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className={`${material.is_transferred ? 'opacity-40 cursor-not-allowed' : 'border-red-500 text-red-600 hover:bg-red-50'}`}
                            onClick={() => !material.is_transferred && setDeleteRawMaterial(material)}
                            disabled={!!material.is_transferred}
                            title={material.is_transferred ? t('مقفلة — تم التحويل للتصنيع') : t('حذف المادة')}
                            data-testid={`delete-raw-material-btn-${material.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
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
                      <div key={request.id} className={`p-4 border rounded-lg ${request.status === 'pending' ? 'border-orange-500 bg-orange-500/5' : request.status === 'partially_fulfilled' ? 'border-amber-500 bg-amber-500/5' : request.status === 'fulfilled' ? 'border-green-500 bg-green-500/5' : 'border-gray-300'}`}>
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-lg">{t('طلب')} #{request.request_number}</span>
                            <Badge className={
                              request.status === 'pending' ? 'bg-orange-500/20 text-orange-500' :
                              request.status === 'partially_fulfilled' ? 'bg-amber-500/20 text-amber-700' :
                              request.status === 'fulfilled' ? 'bg-green-500/20 text-green-500' :
                              request.status === 'rejected' ? 'bg-red-500/20 text-red-500' :
                              'bg-gray-500/20 text-gray-500'
                            }>
                              {request.status === 'pending' ? t('بانتظار التنفيذ') :
                               request.status === 'partially_fulfilled' ? t('تنفيذ جزئي — متبقي') :
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
                        
                        {/* سجل التنفيذ الجزئي السابق */}
                        {(request.fulfillment_log || []).length > 0 && (
                          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2 mb-3 text-xs" data-testid={`mfg-fulfillment-log-${request.id}`}>
                            <p className="font-medium text-amber-700 mb-1">📦 {t('تنفيذات سابقة')}: {request.fulfillment_log.length}</p>
                            {request.fulfillment_log.slice(-2).map((log, i) => (
                              <p key={i} className="text-muted-foreground">
                                · {new Date(log.fulfilled_at).toLocaleDateString('ar-EG')} — {log.fulfilled_by_name} — {log.items.length} {t('صنف')}
                              </p>
                            ))}
                          </div>
                        )}
                        
                        {/* أزرار الإجراءات */}
                        {(request.status === 'pending' || request.status === 'partially_fulfilled') && (
                          <div className="flex gap-2 flex-wrap">
                            <Button
                              onClick={() => handleFulfillManufacturingRequest(request.id)}
                              className="flex-1 min-w-[180px] bg-green-500 hover:bg-green-600"
                              disabled={submitting}
                              data-testid={`mfg-fulfill-full-${request.id}`}
                            >
                              {submitting ? <RefreshCw className="h-4 w-4 animate-spin ml-2" /> : <CheckCircle className="h-4 w-4 ml-2" />}
                              {t('تنفيذ كامل وتحويل للتصنيع')}
                            </Button>
                            <Button
                              onClick={() => {
                                const overrides = {};
                                (request.items || []).forEach(it => {
                                  // افتراضياً: المتوفر فعلياً أو المطلوب (أيهما أقل)
                                  const avail = Number(it.available_quantity || 0);
                                  const req = Number(it.quantity || 0);
                                  overrides[it.material_id] = Math.min(avail, req);
                                });
                                setMfgFulfillDialog({ open: true, request, qtyOverrides: overrides, partial: true, notes: '' });
                              }}
                              className="bg-amber-500 hover:bg-amber-600 text-white"
                              disabled={submitting}
                              data-testid={`mfg-fulfill-partial-${request.id}`}
                            >
                              <Pencil className="h-4 w-4 ml-2" />
                              {t('تنفيذ جزئي / تعديل الكميات')}
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => handleRejectManufacturingRequest(request.id)}
                              className="border-red-500 text-red-500 hover:bg-red-50"
                              disabled={submitting}
                              data-testid={`mfg-reject-${request.id}`}
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
            {/* زر الجرد الشهري */}
            <div className="flex justify-end">
              <MonthlyStocktakeButton department="packaging" />
            </div>
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
            {/* زر الجرد الشهري */}
            <div className="flex justify-end">
              <MonthlyStocktakeButton department="manufacturing" />
            </div>
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
                    {manufacturingInventory.map(item => {
                      // اربط بـ raw_materials للحصول على نسبة الهدر + الاسم الكامل
                      // ⭐ دعم كلا اسمي الحقول (material_id / raw_material_id) للتوافق مع البيانات القديمة
                      const linkedId = item.material_id || item.raw_material_id;
                      const master = rawMaterials.find(rm => rm.id === linkedId);
                      const name = item.material_name || item.raw_material_name || master?.name || t('بدون اسم');
                      const wastePct = parseFloat(master?.waste_percentage || 0);
                      const costPerUnit = parseFloat(item.cost_per_unit || 0);
                      const totalBeforeWaste = item.quantity * costPerUnit;
                      const costAfterWaste = wastePct > 0 && wastePct < 100
                        ? costPerUnit / (1 - wastePct / 100)
                        : costPerUnit;
                      const totalAfterWaste = item.quantity * costAfterWaste;
                      const hasWaste = wastePct > 0;
                      // ⭐ الوحدة المعروضة: نُفضّل وحدة المادة الأصلية (إن وُجدت) لتعكس آخر تصحيح إداري
                      const displayUnit = master?.unit || item.unit || '';
                      return (
                        <div key={item.id} className="p-3 bg-purple-500/10 rounded-lg border border-purple-500/20" data-testid={`mfg-inv-card-${linkedId}`}>
                          <p className="font-medium truncate" title={name}>{name}</p>
                          <p className="text-lg font-bold text-purple-600">{item.quantity} {displayUnit}</p>
                          {hasWaste ? (
                            <div className="mt-1.5 space-y-0.5">
                              <div className="text-[11px] text-muted-foreground line-through">
                                {t('قبل الهدر')}: {formatPrice(totalBeforeWaste)}
                              </div>
                              <div className="text-xs font-bold text-emerald-700">
                                {t('بعد الهدر')} (-{wastePct}%): {formatPrice(totalAfterWaste)}
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground mt-1">{formatPrice(totalBeforeWaste)}</p>
                          )}
                        </div>
                      );
                    })}
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
                                  <p className="font-bold text-purple-500 tabular-nums" data-testid="stat-total-produced">
                                    {Math.round(((product.total_produced || product.quantity || 0)) * 1000) / 1000}
                                    <span className="text-xs text-muted-foreground mr-1">{product.unit || 'قطعة'}</span>
                                  </p>
                                </div>
                                <div className="text-center border-x border-muted">
                                  <p className="text-xs text-muted-foreground">{t('المحول للفروع')}</p>
                                  <p className="font-bold text-blue-500 tabular-nums" data-testid="stat-transferred">
                                    {Math.round(((product.transferred_quantity || 0)) * 1000) / 1000}
                                    <span className="text-xs text-muted-foreground mr-1">{product.unit || 'قطعة'}</span>
                                  </p>
                                </div>
                                <div className="text-center">
                                  <p className="text-xs text-muted-foreground">{t('المتبقي')}</p>
                                  <p className="font-bold text-green-500 tabular-nums" data-testid="stat-remaining">
                                    {Math.round(((product.quantity || 0)) * 1000) / 1000}
                                    <span className="text-xs text-muted-foreground mr-1">{product.unit || 'قطعة'}</span>
                                  </p>
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
                              
                              {(() => {
                                // ⭐ حساب العائد المحسوب وتكاليف الحبة الواحدة (مع دعم pack_info للعلب/الكراتين)
                                const _W = {
                                  'غرام': 1, 'كغم': 1000, 'كيلو': 1000, 'كجم': 1000, 'gram': 1, 'kg': 1000,
                                  'مل': 1, 'لتر': 1000, 'ml': 1, 'liter': 1000, 'l': 1000
                                };
                                const _COUNT = new Set(['قطعة', 'حبة', 'علبة', 'كرتون', 'صحن', 'piece']);
                                const pw = Number(product.piece_weight || 0);
                                const pwu = product.piece_weight_unit || 'غرام';
                                const pieceGrams = pw * (_W[pwu] || 1);
                                let totalGrams = 0;
                                for (const ing of (product.recipe || [])) {
                                  const q = Number(ing.quantity || 0);
                                  const f = _W[ing.unit];
                                  if (f) {
                                    totalGrams += q * f;
                                  } else if (_COUNT.has(ing.unit)) {
                                    // ابحث عن pack_info من rawMaterials
                                    const mat = rawMaterials?.find?.(r => r.id === ing.raw_material_id);
                                    if (mat && mat.pack_quantity && mat.pack_unit) {
                                      const pf = _W[mat.pack_unit] || 0;
                                      if (pf > 0) totalGrams += q * Number(mat.pack_quantity) * pf;
                                    }
                                  }
                                }
                                const calcYield = (pieceGrams > 0 && totalGrams > 0) ? totalGrams / pieceGrams : 0;
                                const storedQty = Number(product.quantity || 0);
                                const denom = calcYield || storedQty || 1;
                                const hasPerPiece = (calcYield > 0) || (storedQty > 1);
                                const batchBefore = Number(product.raw_material_cost ?? product.cost_before_waste ?? 0);
                                const batchAfter = Number(product.raw_material_cost_after_waste ?? product.production_cost ?? product.raw_material_cost ?? 0);
                                const sellingPrice = Number(product.selling_price || 0);
                                const unitBefore = batchBefore / denom;
                                const unitAfter = batchAfter / denom;
                                const unitMargin = sellingPrice - unitAfter;
                                const unitLabel = product.unit || 'حبة';
                                return (
                                  <>
                                    {/* شريط العائد المحسوب */}
                                    {calcYield > 0 && (() => {
                                      const diff = Math.abs(calcYield - storedQty);
                                      const isOutOfSync = storedQty > 0 && diff >= 0.5;
                                      return (
                                        <div className={`mb-2 p-2 rounded-md border text-xs flex items-center justify-between gap-2 flex-wrap ${isOutOfSync ? 'bg-orange-500/10 border-orange-500/40 text-orange-800' : 'bg-amber-500/10 border-amber-500/30 text-amber-800'}`} data-testid="yield-banner">
                                          <span>📐 {t('العائد المحسوب من الوصفة')}: <strong className="tabular-nums">{calcYield.toFixed(3)} {unitLabel}</strong></span>
                                          <span className="text-[10px] text-muted-foreground">{t('وزن القطعة')} {pw} {pwu} · {t('إجمالي الوصفة')} {totalGrams.toFixed(0)} {t('غرام')}</span>
                                          {isOutOfSync && (
                                            <button
                                              onClick={() => syncRecipeToProducedQty(product)}
                                              className="text-[11px] font-bold px-2 py-1 rounded bg-orange-600 hover:bg-orange-700 text-white"
                                              data-testid={`sync-recipe-${product.id}`}
                                              title={t('مزامنة كميات المكونات لتطابق المنتج المُصنّع')}
                                            >
                                              🔧 {t('مزامنة الوصفة مع')} {storedQty} {unitLabel}
                                            </button>
                                          )}
                                        </div>
                                      );
                                    })()}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
                                      <div className="p-2 rounded-md bg-blue-500/5 border border-blue-300/30" data-testid="cost-before-waste-card">
                                        <p className="text-[11px] text-muted-foreground">{t('الكلفة قبل الهدر')}</p>
                                        <p className="font-bold text-blue-600 tabular-nums">{formatPrice(batchBefore)}</p>
                                        {hasPerPiece && (
                                          <p className="text-[10px] text-blue-700 mt-0.5 tabular-nums">{t('لكل')} {unitLabel}: <strong>{formatPrice(unitBefore)}</strong></p>
                                        )}
                                      </div>
                                      <div className="p-2 rounded-md bg-emerald-500/10 border-2 border-emerald-500/40" data-testid="cost-after-waste-card">
                                        <p className="text-[11px] text-muted-foreground">⭐ {t('الكلفة بعد الهدر')}</p>
                                        <p className="font-bold text-emerald-600 tabular-nums">{formatPrice(batchAfter)}</p>
                                        {hasPerPiece && (
                                          <p className="text-[10px] text-emerald-700 mt-0.5 tabular-nums">{t('لكل')} {unitLabel}: <strong>{formatPrice(unitAfter)}</strong></p>
                                        )}
                                      </div>
                                      <div className="p-2 rounded-md bg-green-500/5 border border-green-300/30">
                                        <p className="text-[11px] text-muted-foreground">{t('سعر البيع')}</p>
                                        <p className="font-bold text-green-600 tabular-nums">{formatPrice(sellingPrice)}</p>
                                        <p className="text-[10px] text-muted-foreground mt-0.5">{t('لكل')} {unitLabel}</p>
                                      </div>
                                      <div className="p-2 rounded-md bg-purple-500/5 border border-purple-300/30">
                                        <p className="text-[11px] text-muted-foreground">{t('هامش الربح')}</p>
                                        <p className={`font-bold tabular-nums ${unitMargin >= 0 ? 'text-purple-600' : 'text-red-600'}`}>{formatPrice(unitMargin)}</p>
                                        <p className="text-[10px] text-muted-foreground mt-0.5">{t('لكل')} {unitLabel}</p>
                                      </div>
                                    </div>
                                  </>
                                );
                              })()}
                              
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
                                <div className="mt-2 p-3 bg-muted/30 rounded-lg space-y-1.5">
                                  {/* رأس الجدول */}
                                  <div className="grid grid-cols-12 text-[10px] font-bold text-muted-foreground border-b pb-1 mb-1">
                                    <div className="col-span-4">{t('المكوّن')}</div>
                                    <div className="col-span-3 text-center">{t('الكمية')}</div>
                                    <div className="col-span-2 text-center">{t('سعر/وحدة')}</div>
                                    <div className="col-span-3 text-left">{t('التكلفة')}</div>
                                  </div>
                                  {product.recipe?.map((ing, idx) => {
                                    const qty = Number(ing.quantity) || 0;
                                    const cpu = Number(ing.cost_per_unit) || 0;
                                    const wastePct = Number(ing.waste_percentage) || 0;
                                    const effectiveCpu = (0 < wastePct && wastePct < 100) ? cpu / (1 - wastePct / 100) : cpu;
                                    const lineCost = qty * effectiveCpu;
                                    return (
                                      <div key={idx} className="grid grid-cols-12 text-xs items-center" data-testid={`recipe-line-${idx}`}>
                                        <div className="col-span-4 flex items-center gap-1.5 min-w-0">
                                          <Beaker className="h-3 w-3 text-purple-500 shrink-0" />
                                          <span className="truncate">{ing.raw_material_name}</span>
                                          {wastePct > 0 && (
                                            <span className="text-[9px] px-1 py-0.5 rounded bg-orange-100 dark:bg-orange-950/40 text-orange-700 shrink-0">
                                              -{wastePct}%
                                            </span>
                                          )}
                                        </div>
                                        <div className="col-span-3 text-center text-muted-foreground tabular-nums">{formatRecipeQuantity(qty, ing.unit).text}</div>
                                        <div className="col-span-2 text-center text-muted-foreground tabular-nums">{formatPrice(cpu)}</div>
                                        <div className="col-span-3 text-left font-bold text-emerald-600 tabular-nums">{formatPrice(lineCost)}</div>
                                      </div>
                                    );
                                  })}
                                  {/* الإجمالي */}
                                  <div className="grid grid-cols-12 text-xs items-center border-t pt-1.5 mt-1 font-bold">
                                    <div className="col-span-9 text-left text-muted-foreground">{t('إجمالي تكلفة الوصفة (بعد الهدر)')}</div>
                                    <div className="col-span-3 text-left text-emerald-700 tabular-nums" data-testid="recipe-total-cost">
                                      {formatPrice(product.raw_material_cost_after_waste ?? product.production_cost ?? 0)}
                                    </div>
                                  </div>
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
                              <Button
                                onClick={() => openEditRecipe(product)}
                                variant="outline"
                                className="border-amber-500 text-amber-700 hover:bg-amber-50"
                                data-testid={`edit-recipe-btn-${product.id}`}
                              >
                                <Pencil className="h-4 w-4 ml-2" />
                                {t('تعديل الوصفة')}
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
            {/* مخزون التغليف في الفرع */}
            {branchPackagingInventory.length > 0 && (
              <Card className="border-amber-500/30 bg-amber-500/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-amber-600">
                    <Box className="h-5 w-5" />
                    {t('مخزون التغليف في الفرع')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {branchPackagingInventory.map(item => (
                      <div key={item.id} className="p-4 bg-background rounded-lg border border-amber-500/30">
                        <h4 className="font-bold text-amber-600">{item.name}</h4>
                        <div className="mt-2 space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{t('الكمية')}:</span>
                            <span className="font-bold">{item.quantity} {item.unit}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{t('المستخدم')}:</span>
                            <span>{item.used_quantity || 0}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{t('المتبقي')}:</span>
                            <span className="font-bold text-green-600">{item.remaining_quantity || item.quantity}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            
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
          
          {/* ============ حركات المخزن (دخول/خروج خلال الشهر) ============ */}
          <TabsContent value="movements" className="space-y-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <ArrowUpDown className="h-5 w-5 text-blue-500" />
                    <h3 className="font-bold text-lg">{t('حركات المخزن')}</h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      type="date"
                      value={movementsStartDate}
                      onChange={(e) => { setMovementsStartDate(e.target.value); setMovementsRangeKey('custom'); }}
                      className="w-40"
                      data-testid="movements-start-date"
                    />
                    <span className="text-muted-foreground">→</span>
                    <Input
                      type="date"
                      value={movementsEndDate}
                      onChange={(e) => { setMovementsEndDate(e.target.value); setMovementsRangeKey('custom'); }}
                      className="w-40"
                      data-testid="movements-end-date"
                    />
                    <Select value={movementsTypeFilter} onValueChange={setMovementsTypeFilter}>
                      <SelectTrigger className="w-32" data-testid="movements-type-filter">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('الكل')}</SelectItem>
                        <SelectItem value="in">{t('دخول')}</SelectItem>
                        <SelectItem value="out">{t('خروج')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                {/* فلاتر التاريخ السريعة */}
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  {[
                    { key: 'today', label: 'اليوم' },
                    { key: 'week', label: 'الأسبوع' },
                    { key: 'month', label: 'الشهر' },
                    { key: 'custom', label: 'مخصص' },
                  ].map(r => (
                    <Button
                      key={r.key}
                      variant={movementsRangeKey === r.key ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => applyMovementsRange(r.key)}
                      data-testid={`mv-range-${r.key}`}
                    >{t(r.label)}</Button>
                  ))}
                </div>
                
                {/* فلتر الفئات السريع */}
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  {[
                    { key: 'all', label: 'كل الحركات', cls: '' },
                    { key: 'incoming', label: '📥 دخول للمخزن', cls: 'data-[active=true]:bg-emerald-500/15 data-[active=true]:text-emerald-700 data-[active=true]:border-emerald-500/50' },
                    { key: 'to_manufacturing', label: '➡️ إرسال للتصنيع', cls: 'data-[active=true]:bg-purple-500/15 data-[active=true]:text-purple-700 data-[active=true]:border-purple-500/50' },
                    { key: 'manufacturing', label: '🏭 تصنيع منتج', cls: 'data-[active=true]:bg-amber-500/15 data-[active=true]:text-amber-700 data-[active=true]:border-amber-500/50' },
                    { key: 'to_branch', label: '🚚 إرسال للفروع', cls: 'data-[active=true]:bg-blue-500/15 data-[active=true]:text-blue-700 data-[active=true]:border-blue-500/50' },
                  ].map(c => (
                    <Button
                      key={c.key}
                      variant={movementsCategoryFilter === c.key ? 'default' : 'outline'}
                      size="sm"
                      data-active={movementsCategoryFilter === c.key}
                      className={c.cls}
                      onClick={() => setMovementsCategoryFilter(c.key)}
                      data-testid={`mv-cat-${c.key}`}
                    >{t(c.label)}</Button>
                  ))}
                </div>
                
                {/* بطاقات الملخص */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <Card className="border-emerald-500/30 bg-emerald-500/5">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <TrendingUp className="h-4 w-4 text-emerald-500" />
                        <span className="text-xs text-muted-foreground">{t('إجمالي الدخول')}</span>
                      </div>
                      <p className="text-2xl font-bold text-emerald-500" data-testid="total-in-qty">{movementsSummary.total_in.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground mt-1">{(movementsSummary.total_in_value || 0).toLocaleString()} IQD</p>
                    </CardContent>
                  </Card>
                  <Card className="border-red-500/30 bg-red-500/5">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <TrendingDown className="h-4 w-4 text-red-500" />
                        <span className="text-xs text-muted-foreground">{t('إجمالي الخروج')}</span>
                      </div>
                      <p className="text-2xl font-bold text-red-500" data-testid="total-out-qty">{movementsSummary.total_out.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground mt-1">{(movementsSummary.total_out_value || 0).toLocaleString()} IQD</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3">
                      <span className="text-xs text-muted-foreground">{t('عدد الحركات')}</span>
                      <p className="text-2xl font-bold">{movementsSummary.movements_count || 0}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-blue-500/30">
                    <CardContent className="p-3">
                      <span className="text-xs text-muted-foreground">{t('صافي الحركة')}</span>
                      <p className={`text-2xl font-bold ${movementsSummary.total_in - movementsSummary.total_out >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {(movementsSummary.total_in - movementsSummary.total_out >= 0 ? '+' : '')}{(movementsSummary.total_in - movementsSummary.total_out).toLocaleString()}
                      </p>
                    </CardContent>
                  </Card>
                </div>
                
                {/* الملخص اليومي */}
                {movementsDaily.length > 0 && (
                  <div className="mb-4">
                    <Label className="text-base font-bold mb-2 block">{t('ملخص يومي')}</Label>
                    <div className="overflow-x-auto border rounded-lg">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="px-3 py-2 text-right">{t('التاريخ')}</th>
                            <th className="px-3 py-2 text-center">{t('دخول')}</th>
                            <th className="px-3 py-2 text-center">{t('خروج')}</th>
                            <th className="px-3 py-2 text-center">{t('قيمة الدخول')}</th>
                            <th className="px-3 py-2 text-center">{t('قيمة الخروج')}</th>
                            <th className="px-3 py-2 text-center">{t('الحركات')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {movementsDaily.map(d => (
                            <tr key={d.date} className="border-t border-border hover:bg-muted/30">
                              <td className="px-3 py-2 font-medium">{d.date}</td>
                              <td className="px-3 py-2 text-center text-emerald-500 font-bold">+{d.in_qty.toLocaleString()}</td>
                              <td className="px-3 py-2 text-center text-red-500 font-bold">-{d.out_qty.toLocaleString()}</td>
                              <td className="px-3 py-2 text-center text-emerald-600">{d.in_value.toLocaleString()}</td>
                              <td className="px-3 py-2 text-center text-red-600">{d.out_value.toLocaleString()}</td>
                              <td className="px-3 py-2 text-center text-muted-foreground">{d.movements}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                
                {/* جدول الحركات التفصيلي */}
                <Label className="text-base font-bold mb-2 block">{t('سجل الحركات التفصيلي')} <span className="text-xs text-muted-foreground font-normal">({t('اضغط على أي حركة لعرض التفاصيل')})</span></Label>
                {movements.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground" data-testid="movements-empty">
                    <Box className="h-12 w-12 mx-auto mb-2 opacity-30" />
                    <p>{t('لا توجد حركات في هذه الفترة')}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm" data-testid="movements-table">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-3 py-2 text-right">{t('التاريخ')}</th>
                          <th className="px-3 py-2 text-center">{t('الفئة')}</th>
                          <th className="px-3 py-2 text-right">{t('المادة/المنتج')}</th>
                          <th className="px-3 py-2 text-center">{t('الكمية')}</th>
                          <th className="px-3 py-2 text-center">{t('القيمة')}</th>
                          <th className="px-3 py-2 text-right">{t('المرجع')}</th>
                          <th className="px-3 py-2 text-right">{t('بواسطة')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {movements.map(m => {
                          const catLabels = {
                            incoming: { lbl: '📥 دخول', cls: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400' },
                            to_manufacturing: { lbl: '➡️ للتصنيع', cls: 'bg-purple-500/20 text-purple-700 dark:text-purple-400' },
                            manufacturing: { lbl: '🏭 تصنيع', cls: 'bg-amber-500/20 text-amber-700 dark:text-amber-400' },
                            to_branch: { lbl: '🚚 للفرع', cls: 'bg-blue-500/20 text-blue-700 dark:text-blue-400' },
                            other: { lbl: m.type, cls: 'bg-gray-500/20 text-gray-700' },
                          };
                          const cat = catLabels[m.category] || catLabels.other;
                          return (
                          <tr
                            key={m.id}
                            className="border-t border-border hover:bg-primary/5 cursor-pointer transition-colors"
                            onClick={() => setSelectedMovement(m)}
                            data-testid={`movement-row-${m.id}`}
                          >
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              {new Date(m.created_at).toLocaleString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <Badge className={cat.cls}>{cat.lbl}</Badge>
                            </td>
                            <td className="px-3 py-2 font-medium">{m.material_name || m.product_name || '—'}</td>
                            <td className="px-3 py-2 text-center">
                              <span className="font-bold tabular-nums">
                                {m.quantity?.toLocaleString()}
                              </span>
                              <span className="text-xs text-muted-foreground mr-1">{m.unit}</span>
                            </td>
                            <td className="px-3 py-2 text-center tabular-nums">{(m.total_value || 0).toLocaleString()} IQD</td>
                            <td className="px-3 py-2 text-xs">
                              {m.subtype === 'purchase_receipt' && m.reference_number && (
                                <span>📄 {t('فاتورة')} #{m.reference_number} {m.supplier_name && `— ${m.supplier_name}`}</span>
                              )}
                              {m.subtype !== 'purchase_receipt' && m.notes && (
                                <span className="text-muted-foreground line-clamp-1">{m.notes}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">{m.performed_by_name || '-'}</td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
      {/* Dialog: التنبؤ الذكي بنفاد المخزون */}
      <StockoutPredictionDialog
        open={showStockoutDialog}
        onOpenChange={setShowStockoutDialog}
      />

      {/* ⭐ Dialog: معاينة مزامنة الوصفة (Preview قبل التطبيق) */}
      <Dialog open={!!syncPreview} onOpenChange={(o) => !o && setSyncPreview(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="sync-preview-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <RefreshCw className="h-5 w-5" />
              {t('معاينة مزامنة الوصفة')} — {syncPreview?.product?.name}
            </DialogTitle>
          </DialogHeader>

          {syncPreview && (
            <div className="space-y-4">
              {/* بطاقات الملخّص */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
                  <p className="text-xs text-muted-foreground">{t('العائد المحسوب من الوصفة')}</p>
                  <p className="text-xl font-bold tabular-nums">{syncPreview.calcYield.toFixed(2)} {syncPreview.product.unit || 'حبة'}</p>
                </div>
                <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
                  <p className="text-xs text-blue-700 dark:text-blue-400">{t('الكمية المُصنّعة (الهدف)')}</p>
                  <p className="text-xl font-bold tabular-nums text-blue-700 dark:text-blue-400">{syncPreview.targetQty} {syncPreview.product.unit || 'حبة'}</p>
                </div>
                <div className={`p-3 rounded-lg border ${syncPreview.scale > 1 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
                  <p className={`text-xs ${syncPreview.scale > 1 ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>{t('عامل التحجيم')}</p>
                  <p className={`text-xl font-bold tabular-nums ${syncPreview.scale > 1 ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
                    × {syncPreview.scale.toFixed(4)}
                  </p>
                </div>
              </div>

              {/* جدول المقارنة */}
              <div className="rounded-lg border border-border/50 overflow-hidden">
                <table className="w-full text-sm" data-testid="sync-preview-table">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-3 py-2 text-right font-bold">{t('المكوّن')}</th>
                      <th className="px-3 py-2 text-right font-bold">{t('الكمية الحالية')}</th>
                      <th className="px-3 py-2 text-right font-bold">{t('بعد المزامنة')}</th>
                      <th className="px-3 py-2 text-right font-bold">{t('الفرق')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {syncPreview.rows.map((r, i) => {
                      const delta = r.delta;
                      const deltaColor = delta < 0 ? 'text-red-600' : delta > 0 ? 'text-emerald-600' : 'text-muted-foreground';
                      const deltaPrefix = delta > 0 ? '+' : '';
                      return (
                        <tr key={i} className="border-t border-border/40 hover:bg-muted/30">
                          <td className="px-3 py-2 font-medium">{r.name}</td>
                          <td className="px-3 py-2 tabular-nums">{r.oldQty.toLocaleString('en-US', { maximumFractionDigits: 4 })} {r.unit}</td>
                          <td className="px-3 py-2 tabular-nums font-bold">{r.newQty.toLocaleString('en-US', { maximumFractionDigits: 4 })} {r.unit}</td>
                          <td className={`px-3 py-2 tabular-nums font-bold ${deltaColor}`}>
                            {deltaPrefix}{delta.toLocaleString('en-US', { maximumFractionDigits: 4 })} {r.unit}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* بطاقة التكلفة الإجمالية */}
              <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-background border-2 border-amber-500/40">
                <div>
                  <p className="text-xs text-muted-foreground">{t('التكلفة الحالية')}</p>
                  <p className="font-bold tabular-nums">{formatPrice(syncPreview.totalOldCost)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('التكلفة بعد المزامنة')}</p>
                  <p className="font-bold tabular-nums text-amber-600">{formatPrice(syncPreview.totalNewCost)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('الفرق')}</p>
                  <p className={`font-bold tabular-nums ${syncPreview.totalNewCost > syncPreview.totalOldCost ? 'text-emerald-600' : 'text-red-600'}`}>
                    {syncPreview.totalNewCost > syncPreview.totalOldCost ? '+' : ''}{formatPrice(syncPreview.totalNewCost - syncPreview.totalOldCost)}
                  </p>
                </div>
              </div>

              {/* تنبيه إذا كان التغيير كبير */}
              {Math.abs(syncPreview.scale - 1) > 0.5 && (
                <div className="p-2 rounded-md bg-red-500/10 border border-red-500/30 text-xs text-red-700 dark:text-red-400 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {t('انتباه: التغيير كبير (>50%). تأكد قبل التطبيق.')}
                </div>
              )}

              {/* الأزرار */}
              <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
                <Button variant="outline" onClick={() => setSyncPreview(null)} data-testid="sync-preview-cancel">
                  {t('إلغاء')}
                </Button>
                <Button
                  onClick={applySyncPreview}
                  className="bg-amber-500 hover:bg-amber-600 text-white"
                  data-testid="sync-preview-apply"
                >
                  <Check className="h-4 w-4 ml-1" />
                  {t('تطبيق المزامنة')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog: تفاصيل حركة المخزن */}
      <Dialog open={!!selectedMovement} onOpenChange={() => setSelectedMovement(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="movement-details-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpDown className="h-5 w-5 text-blue-500" />
              {t('تفاصيل الحركة')}
            </DialogTitle>
          </DialogHeader>
          {selectedMovement && (
            <div className="space-y-4">
              {/* رأس */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-muted/40">
                  <p className="text-xs text-muted-foreground">{t('التاريخ والوقت')}</p>
                  <p className="font-medium text-sm">
                    {new Date(selectedMovement.created_at).toLocaleString('ar-EG', {
                      year: 'numeric', month: 'long', day: 'numeric',
                      hour: '2-digit', minute: '2-digit', second: '2-digit'
                    })}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-muted/40">
                  <p className="text-xs text-muted-foreground">{t('الفئة')}</p>
                  <Badge className={
                    selectedMovement.category === 'incoming' ? 'bg-emerald-500/20 text-emerald-700' :
                    selectedMovement.category === 'to_manufacturing' ? 'bg-purple-500/20 text-purple-700' :
                    selectedMovement.category === 'manufacturing' ? 'bg-amber-500/20 text-amber-700' :
                    selectedMovement.category === 'to_branch' ? 'bg-blue-500/20 text-blue-700' :
                    'bg-gray-500/20 text-gray-700'
                  }>
                    {selectedMovement.category === 'incoming' ? '📥 دخول للمخزن' :
                     selectedMovement.category === 'to_manufacturing' ? '➡️ إرسال للتصنيع' :
                     selectedMovement.category === 'manufacturing' ? '🏭 تصنيع منتج' :
                     selectedMovement.category === 'to_branch' ? '🚚 إرسال للفرع' :
                     selectedMovement.type}
                  </Badge>
                  <p className="text-[10px] text-muted-foreground mt-1">{t('النوع التقني')}: {selectedMovement.type}</p>
                </div>
              </div>

              {/* المادة/المنتج + الكمية */}
              <div className="p-4 rounded-lg border-2 border-primary/20 bg-primary/5">
                <p className="text-xs text-muted-foreground mb-1">{t('المادة / المنتج')}</p>
                <p className="font-bold text-lg">{selectedMovement.material_name || selectedMovement.product_name || '—'}</p>
                <div className="grid grid-cols-3 gap-3 mt-3">
                  <div>
                    <p className="text-[11px] text-muted-foreground">{t('الكمية')}</p>
                    <p className="font-bold tabular-nums">{(selectedMovement.quantity || 0).toLocaleString()} <span className="text-xs text-muted-foreground">{selectedMovement.unit}</span></p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">{t('سعر الوحدة')}</p>
                    <p className="font-bold tabular-nums">{(selectedMovement.cost_per_unit || 0).toLocaleString()} IQD</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">{t('القيمة الإجمالية')}</p>
                    <p className="font-bold tabular-nums text-primary">{(selectedMovement.total_value || 0).toLocaleString()} IQD</p>
                  </div>
                </div>
              </div>

              {/* تفاصيل الهدر (إن وُجدت) */}
              {(selectedMovement.cost_before_waste != null || selectedMovement.cost_after_waste != null) && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                    <p className="text-xs text-muted-foreground">{t('الكلفة قبل الهدر')}</p>
                    <p className="font-bold text-blue-600 tabular-nums">{(selectedMovement.cost_before_waste || 0).toLocaleString()} IQD</p>
                  </div>
                  <div className="p-3 rounded-lg bg-emerald-500/10 border-2 border-emerald-500/40">
                    <p className="text-xs text-muted-foreground">⭐ {t('الكلفة بعد الهدر')}</p>
                    <p className="font-bold text-emerald-600 tabular-nums">{(selectedMovement.cost_after_waste || 0).toLocaleString()} IQD</p>
                  </div>
                </div>
              )}

              {/* المكونات المستهلكة (لو تصنيع منتج) */}
              {Array.isArray(selectedMovement.consumed_ingredients) && selectedMovement.consumed_ingredients.length > 0 && (
                <div className="rounded-lg border p-3">
                  <p className="text-sm font-bold mb-2 flex items-center gap-2">
                    <Beaker className="h-4 w-4 text-purple-500" />
                    {t('المكونات المستهلكة')}
                  </p>
                  <div className="space-y-1">
                    {selectedMovement.consumed_ingredients.map((ing, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs p-2 bg-muted/30 rounded">
                        <span className="font-medium">{ing.raw_material_name}</span>
                        <div className="flex items-center gap-3">
                          <span>{ing.quantity} {ing.unit}</span>
                          {ing.waste_percentage > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-950/40 text-orange-700">هدر {ing.waste_percentage}%</span>
                          )}
                          <span className="text-blue-600 tabular-nums">{(ing.cost_before_waste || 0).toLocaleString()}</span>
                          <span className="text-emerald-600 tabular-nums font-medium">{(ing.cost_after_waste || 0).toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* عناصر متعددة (للتحويلات) */}
              {Array.isArray(selectedMovement.items) && selectedMovement.items.length > 0 && (
                <div className="rounded-lg border p-3">
                  <p className="text-sm font-bold mb-2">{t('العناصر')}</p>
                  <div className="space-y-1">
                    {selectedMovement.items.map((it, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs p-2 bg-muted/30 rounded">
                        <span className="font-medium">{it.product_name || it.material_name || it.name || '—'}</span>
                        <span>{it.quantity} {it.unit || ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* مرجع وبيانات إضافية */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {selectedMovement.reference_number && (
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground">{t('رقم المرجع')}</p>
                    <p className="font-medium">#{selectedMovement.reference_number}</p>
                  </div>
                )}
                {selectedMovement.supplier_name && (
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground">{t('المورد')}</p>
                    <p className="font-medium">{selectedMovement.supplier_name}</p>
                  </div>
                )}
                {selectedMovement.branch_name && (
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground">{t('الفرع')}</p>
                    <p className="font-medium">{selectedMovement.branch_name}</p>
                  </div>
                )}
                {selectedMovement.performed_by_name && (
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground">{t('بواسطة')}</p>
                    <p className="font-medium">{selectedMovement.performed_by_name}</p>
                  </div>
                )}
              </div>

              {selectedMovement.notes && (
                <div className="p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
                  <p className="text-xs text-muted-foreground mb-1">{t('ملاحظات')}</p>
                  <p className="text-sm">{selectedMovement.notes}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedMovement(null)}>{t('إغلاق')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

            {/* تعريف الوحدة (اختياري) — يظهر فقط عند اختيار قطعة/علبة/كرتون */}
            {['قطعة', 'علبة', 'كرتون'].includes(rawMaterialForm.unit) && (
              <div className="rounded-lg border border-amber-300/60 bg-amber-50/40 dark:bg-amber-900/10 p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
                  <Package className="h-4 w-4" />
                  {t(`تعريف ${rawMaterialForm.unit} (اختياري)`)}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {rawMaterialForm.unit === 'قطعة' && t('مثال: قطعة لحم = 1.5 كغم — يساعد في تحويل الكميات بدقة في الوصفات.')}
                  {rawMaterialForm.unit === 'علبة' && t('مثال: علبة جبن = 250 غرام — لتعرف الوزن الصافي للعلبة الواحدة.')}
                  {rawMaterialForm.unit === 'كرتون' && t('مثال: كرتون مايونيز = 12 قطعة، أو كرتون زيت = 18 لتر.')}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">{t('الكمية لكل')} {rawMaterialForm.unit}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={rawMaterialForm.pack_quantity}
                      onChange={(e) => setRawMaterialForm(prev => ({ ...prev, pack_quantity: e.target.value }))}
                      placeholder={rawMaterialForm.unit === 'كرتون' ? '12' : '250'}
                      data-testid="pack-quantity-input"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">{t('وحدة المحتوى')}</Label>
                    <Select
                      value={rawMaterialForm.pack_unit}
                      onValueChange={(v) => setRawMaterialForm(prev => ({ ...prev, pack_unit: v }))}
                    >
                      <SelectTrigger data-testid="pack-unit-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="غرام">{t('غرام')}</SelectItem>
                        <SelectItem value="كغم">{t('كغم')}</SelectItem>
                        <SelectItem value="مل">{t('مل')}</SelectItem>
                        <SelectItem value="لتر">{t('لتر')}</SelectItem>
                        <SelectItem value="قطعة">{t('قطعة')}</SelectItem>
                        <SelectItem value="شريحة">{t('شريحة')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {parseFloat(rawMaterialForm.pack_quantity) > 0 && rawMaterialForm.cost_per_unit > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {t('تكلفة الوحدة المُحتوية')}: {' '}
                    <span className="font-bold text-emerald-600">
                      {formatPrice(rawMaterialForm.cost_per_unit / parseFloat(rawMaterialForm.pack_quantity))} / {rawMaterialForm.pack_unit}
                    </span>
                  </p>
                )}
              </div>
            )}
            
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
              
              {/* ⭐ حقل وزن البورشن الواحد - يظهر لكل أنواع الوحدات بتسمية مناسبة */}
              {(() => {
                const u = productForm.unit;
                const isPiece = ['قطعة', 'حبة', 'صحن'].includes(u);
                const isWeight = ['غرام', 'كغم'].includes(u);
                const isVolume = ['مل', 'لتر'].includes(u);
                if (!isPiece && !isWeight && !isVolume) return null;

                // التسمية الذكية حسب نوع الوحدة
                const label = isPiece
                  ? t('وزن القطعة الواحدة (اختياري)')
                  : isWeight
                    ? t('وزن البورشن الواحد')
                    : t('حجم البورشن الواحد');
                const hint = isPiece
                  ? t('مثال: القطعة = 100 غرام من اللحم')
                  : isWeight
                    ? t('مثال: البورشن الواحد = 100 غرام → الكيلو = 10 بورشن')
                    : t('مثال: البورشن الواحد = 250 مل → اللتر = 4 بورشن');
                const defaultUnit = isVolume ? 'مل' : 'غرام';

                // وحدات وزن متاحة
                const allowedUnits = isVolume ? ['مل', 'لتر'] : ['غرام', 'كغم', 'مل', 'لتر'];

                // ⭐ احتساب "X بورشن في الكيلو/اللتر" للعرض
                const pw = Number(productForm.piece_weight || 0);
                const pwu = productForm.piece_weight_unit || defaultUnit;
                let derivedText = '';
                if (pw > 0) {
                  const W = { 'غرام': 1, 'كغم': 1000, 'مل': 1, 'لتر': 1000 };
                  const pwInBase = pw * (W[pwu] || 1);
                  if (pwInBase > 0) {
                    const baseUnitLabel = (pwu === 'مل' || pwu === 'لتر') ? t('اللتر') : t('الكيلو');
                    const baseUnitDiv = 1000; // 1 kg = 1000 g, 1 L = 1000 ml
                    const portionsPerBase = Math.round((baseUnitDiv / pwInBase) * 100) / 100;
                    if (portionsPerBase > 0 && Number.isFinite(portionsPerBase)) {
                      derivedText = `${baseUnitLabel} = ${portionsPerBase} ${t('بورشن')}`;
                    }
                  }
                }

                return (
                  <div className="col-span-2">
                    <Label>{label}</Label>
                    <div className="flex gap-2 mt-1">
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        placeholder={t('مثال: 100')}
                        value={productForm.piece_weight}
                        onChange={(e) => setProductForm(prev => ({ ...prev, piece_weight: e.target.value }))}
                        className="flex-1"
                        data-testid="product-piece-weight"
                      />
                      <Select
                        value={productForm.piece_weight_unit}
                        onValueChange={(v) => setProductForm(prev => ({ ...prev, piece_weight_unit: v }))}
                      >
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {allowedUnits.map(uu => (
                            <SelectItem key={uu} value={uu}>{t(uu)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{hint}</p>
                    {derivedText && (
                      <p className="text-xs font-bold text-emerald-600 mt-1" data-testid="portion-derivation">
                        ⭐ {derivedText}
                      </p>
                    )}
                  </div>
                );
              })()}
              
              <div className="rounded-lg p-3 bg-emerald-500/10 border border-emerald-500/30 space-y-2">
                <Label className="flex items-center gap-2 font-bold text-emerald-700">
                  <DollarSign className="h-4 w-4" />
                  {t('تكلفة التصنيع (تُحسب تلقائياً)')}
                </Label>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t('التكلفة تُحسب من مجموع المكونات. تُعرض قيمتان:')}
                </p>
                {productForm.recipe.length === 0 ? (
                  <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/20 p-2 rounded">
                    {t('أضف مكونات للوصفة لاحتساب التكلفة تلقائياً')}
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 rounded bg-white/60 dark:bg-black/20 border border-blue-300/40">
                      <p className="text-[10px] text-muted-foreground">{t('قبل الهدر')}</p>
                      <p className="font-bold text-blue-600 tabular-nums">{formatPrice(calculateRecipeCost())}</p>
                      <p className="text-[10px] text-muted-foreground">{t('للمحاسبة على الموردين')}</p>
                    </div>
                    <div className="p-2 rounded bg-white/60 dark:bg-black/20 border-2 border-emerald-500">
                      <p className="text-[10px] text-muted-foreground">⭐ {t('بعد الهدر (المعتمد)')}</p>
                      <p className="font-bold text-emerald-600 tabular-nums text-base" data-testid="cost-after-waste">{formatPrice(calculateRecipeCostAfterWaste())}</p>
                      <p className="text-[10px] text-muted-foreground">{t('التكلفة الفعلية للوحدة')}</p>
                    </div>
                  </div>
                )}
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
                  {/* ⭐ Toggle نوع المكوّن: مادة خام / منتج مُصنّع */}
                  <div className="flex gap-2 p-1 bg-muted/40 rounded-lg" data-testid="ingredient-source-toggle">
                    <Button
                      type="button"
                      size="sm"
                      variant={newIngredient.source === 'raw' ? 'default' : 'ghost'}
                      onClick={() => setNewIngredient(prev => ({ ...prev, source: 'raw', manufactured_product_id: '' }))}
                      className={newIngredient.source === 'raw' ? 'flex-1 bg-green-500 hover:bg-green-600 text-white' : 'flex-1'}
                      data-testid="src-raw-btn"
                    >
                      📦 {t('مادة خام')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={newIngredient.source === 'manufactured' ? 'default' : 'ghost'}
                      onClick={() => setNewIngredient(prev => ({ ...prev, source: 'manufactured', raw_material_id: '' }))}
                      className={newIngredient.source === 'manufactured' ? 'flex-1 bg-purple-500 hover:bg-purple-600 text-white' : 'flex-1'}
                      data-testid="src-mfg-btn"
                    >
                      🏭 {t('منتج مُصنّع سابقاً')}
                    </Button>
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    {/* ── Select بحسب نوع المكوّن ── */}
                    {newIngredient.source === 'manufactured' ? (
                      <Select
                        value={newIngredient.manufactured_product_id}
                        onValueChange={(v) => setNewIngredient(prev => ({ ...prev, manufactured_product_id: v }))}
                      >
                        <SelectTrigger className="flex-1 min-w-[200px] bg-background" data-testid="recipe-mfg-select">
                          <SelectValue placeholder={t('اختر منتج مُصنّع...')} />
                        </SelectTrigger>
                        <SelectContent>
                          {manufacturedProducts.length === 0 ? (
                            <div className="px-3 py-2 text-xs text-muted-foreground">{t('لا توجد منتجات مُصنّعة')}</div>
                          ) : manufacturedProducts.map(mp => (
                            <SelectItem key={mp.id} value={mp.id}>
                              🏭 {mp.name} ({mp.quantity || 0} {mp.unit || 'حبة'})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Select 
                        value={newIngredient.raw_material_id} 
                        onValueChange={(v) => {
                          const m = manufacturingInventory.find(x => (x.material_id || x.raw_material_id) === v);
                          setNewIngredient(prev => ({ ...prev, raw_material_id: v, input_unit: m?.unit || '' }));
                        }}
                      >
                        <SelectTrigger className="flex-1 min-w-[200px] bg-background">
                          <SelectValue placeholder={t('اختر مادة خام...')} />
                        </SelectTrigger>
                        <SelectContent>
                          {manufacturingInventory.map(material => {
                            const mid = material.material_id || material.raw_material_id;
                            const mname = material.material_name || material.raw_material_name || rawMaterials.find(r => r.id === mid)?.name || '—';
                            return (
                              <SelectItem key={mid} value={mid}>
                                {mname} ({material.quantity} {material.unit})
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    )}
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder={t('الكمية')}
                      value={newIngredient.quantity || ''}
                      onChange={(e) => setNewIngredient(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))}
                      className="w-24 bg-background"
                      data-testid="recipe-new-qty"
                    />
                    {/* ⭐ اختيار وحدة الإدخال للمواد الخام */}
                    {newIngredient.source === 'raw' && newIngredient.raw_material_id && (() => {
                      const m = manufacturingInventory.find(x => (x.material_id || x.raw_material_id) === newIngredient.raw_material_id);
                      const packInfo = _packInfoFor(newIngredient.raw_material_id);
                      const units = availableInputUnitsFor(m?.unit, packInfo?.pack_unit);
                      if (units.length <= 1) {
                        return <div className="text-xs text-muted-foreground self-center px-2">{m?.unit}</div>;
                      }
                      return (
                        <Select
                          value={newIngredient.input_unit || m?.unit}
                          onValueChange={(v) => setNewIngredient(prev => ({ ...prev, input_unit: v }))}
                        >
                          <SelectTrigger className="w-24 bg-background" data-testid="recipe-new-unit">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {units.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      );
                    })()}
                    {/* ⭐ اختيار وحدة الإدخال للمنتج المُصنّع (وحدته الأصلية + عائلة piece_weight) */}
                    {newIngredient.source === 'manufactured' && newIngredient.manufactured_product_id && (() => {
                      const mp = manufacturedProducts.find(m => m.id === newIngredient.manufactured_product_id);
                      if (!mp) return null;
                      // الوحدة الأصلية للمنتج (حبة/قطعة/كغم) + عائلة piece_weight (غرام/كغم أو مل/لتر)
                      const units = new Set([mp.unit || 'حبة']);
                      const pwu = mp.piece_weight_unit;
                      const pw = Number(mp.piece_weight || 0);
                      if (pw > 0 && pwu) {
                        // أضف عائلة الوزن
                        if (['غرام','كغم','كيلو','كجم','gram','kg'].includes(pwu)) {
                          units.add('غرام'); units.add('كغم');
                        } else if (['مل','لتر','ml','liter','l'].includes(pwu)) {
                          units.add('مل'); units.add('لتر');
                        }
                      }
                      const arr = Array.from(units);
                      if (arr.length <= 1) {
                        return <div className="text-xs text-muted-foreground self-center px-2">{mp.unit || 'حبة'}</div>;
                      }
                      return (
                        <Select
                          value={newIngredient.input_unit || mp.unit || 'حبة'}
                          onValueChange={(v) => setNewIngredient(prev => ({ ...prev, input_unit: v }))}
                        >
                          <SelectTrigger className="w-24 bg-background" data-testid="recipe-new-mfg-unit">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {arr.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      );
                    })()}
                    <Button
                      type="button"
                      size="icon"
                      className="bg-green-500 hover:bg-green-600"
                      onClick={addIngredientToRecipe}
                      data-testid="recipe-add-ingredient-btn"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* ⭐ inline panel لتعريف محتوى العلبة/الكرتون عند الحاجة */}
                  {newIngredient.raw_material_id && (() => {
                    const m = manufacturingInventory.find(x => (x.material_id || x.raw_material_id) === newIngredient.raw_material_id);
                    const isPackUnit = ['علبة', 'كرتون'].includes(m?.unit);
                    if (!isPackUnit) return null;
                    const packInfo = _packInfoFor(newIngredient.raw_material_id);
                    if (packInfo) {
                      // pack info موجود — اعرضه مع زر تعديل
                      return (
                        <div className="flex items-center gap-2 p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs">
                          <span className="font-bold text-emerald-700 dark:text-emerald-400">
                            ✓ {t('محتوى العلبة الواحدة')}:
                          </span>
                          <span className="font-mono">
                            1 {m?.unit} = {packInfo.pack_quantity} {packInfo.pack_unit}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-amber-600 hover:text-amber-700 ml-auto"
                            onClick={() => setPackInfoEdit({
                              material_id: newIngredient.raw_material_id,
                              pack_quantity: packInfo.pack_quantity,
                              pack_unit: packInfo.pack_unit,
                              editing: true
                            })}
                            data-testid="pack-info-edit-btn"
                          >
                            <Edit className="h-3 w-3 ml-1" />{t('تعديل')}
                          </Button>
                        </div>
                      );
                    }
                    // pack info غير موجود — أظهر panel لتعريفه
                    return (
                      <div className="p-3 bg-amber-500/10 border border-amber-500/40 rounded-lg space-y-2" data-testid="pack-info-setup-panel">
                        <p className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                          <AlertCircle className="h-3.5 w-3.5" />
                          {t('عرّف محتوى العلبة/الكرتون الواحد لتتمكن من الإدخال بالغرام/الكيلو')}
                        </p>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono whitespace-nowrap">1 {m?.unit} =</span>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder={t('الكمية')}
                            value={packInfoEdit?.material_id === newIngredient.raw_material_id ? packInfoEdit.pack_quantity : ''}
                            onChange={(e) => setPackInfoEdit({
                              material_id: newIngredient.raw_material_id,
                              pack_quantity: parseFloat(e.target.value) || 0,
                              pack_unit: packInfoEdit?.pack_unit || 'غرام'
                            })}
                            className="w-24 bg-background h-8"
                            data-testid="pack-info-qty-input"
                          />
                          <Select
                            value={packInfoEdit?.material_id === newIngredient.raw_material_id ? (packInfoEdit.pack_unit || 'غرام') : 'غرام'}
                            onValueChange={(v) => setPackInfoEdit({
                              material_id: newIngredient.raw_material_id,
                              pack_quantity: packInfoEdit?.pack_quantity || 0,
                              pack_unit: v
                            })}
                          >
                            <SelectTrigger className="w-24 h-8 bg-background" data-testid="pack-info-unit-select">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="غرام">{t('غرام')}</SelectItem>
                              <SelectItem value="كغم">{t('كغم')}</SelectItem>
                              <SelectItem value="مل">{t('مل')}</SelectItem>
                              <SelectItem value="لتر">{t('لتر')}</SelectItem>
                              <SelectItem value="قطعة">{t('قطعة')}</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            size="sm"
                            className="bg-amber-500 hover:bg-amber-600 text-white h-8"
                            onClick={savePackInfo}
                            disabled={!packInfoEdit?.pack_quantity || packInfoEdit?.material_id !== newIngredient.raw_material_id}
                            data-testid="pack-info-save-btn"
                          >
                            <Check className="h-3.5 w-3.5 ml-1" />{t('حفظ')}
                          </Button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {t('مثال: 1 علبة جبن = 500 غرام · 1 كرتون مايونيز = 12 قطعة · 1 علبة زيت = 1 لتر')}
                        </p>
                      </div>
                    );
                  })()}
                  
                  {productForm.recipe.length > 0 ? (
                    <div className="space-y-2 max-h-52 overflow-y-auto">
                      {productForm.recipe.map((ing, index) => {
                        const baseCost = ing.cost_per_unit || 0;
                        const wastePct = ing.waste_percentage || 0;
                        const effectiveCost = wastePct > 0 && wastePct < 100 ? baseCost / (1 - wastePct / 100) : baseCost;
                        const costBefore = ing.quantity * baseCost;
                        const costAfter = ing.quantity * effectiveCost;
                        return (
                          <div key={index} className="bg-background rounded-lg px-3 py-2 space-y-1">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Beaker className="h-4 w-4 text-purple-500" />
                                <span className="font-medium">{ing.raw_material_name}</span>
                                <span className="text-xs text-muted-foreground">({formatRecipeQuantity(ing.quantity, ing.unit).text})</span>
                                {wastePct > 0 && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-950/40 text-orange-700">
                                    {t('هدر')} {wastePct}%
                                  </span>
                                )}
                              </div>
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
                            <div className="grid grid-cols-2 gap-2 pl-6">
                              <div className="text-[11px]">
                                <span className="text-muted-foreground">{t('قبل الهدر:')} </span>
                                <span className="font-medium text-blue-600 tabular-nums">{formatPrice(costBefore)}</span>
                              </div>
                              <div className="text-[11px]">
                                <span className="text-muted-foreground">{t('بعد الهدر:')} </span>
                                <span className="font-medium text-emerald-600 tabular-nums">{formatPrice(costAfter)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-purple-500/30">
                        <div className="p-2 rounded bg-blue-500/5 border border-blue-300/30">
                          <p className="text-[10px] text-muted-foreground">{t('إجمالي قبل الهدر')}</p>
                          <p className="font-bold text-blue-600 tabular-nums">{formatPrice(calculateRecipeCost())}</p>
                        </div>
                        <div className="p-2 rounded bg-emerald-500/10 border-2 border-emerald-500/40">
                          <p className="text-[10px] text-muted-foreground">⭐ {t('إجمالي بعد الهدر')}</p>
                          <p className="font-bold text-emerald-600 tabular-nums" data-testid="recipe-total-after-waste">{formatPrice(calculateRecipeCostAfterWaste())}</p>
                        </div>
                      </div>

                      {/* ⭐ مجموع الوزن + عدد القطع المتوقع — يظهر فقط للوصفات الوزنية */}
                      {(() => {
                        const piecesInfo = calculatePiecesFromBatch();
                        const { total_grams, has_weight } = calculateRecipeTotalWeight();
                        if (!has_weight) return null;
                        const totalKg = total_grams / 1000;
                        const costAfter = calculateRecipeCostAfterWaste();
                        return (
                          <div className="mt-2 p-3 rounded-lg bg-amber-500/10 border-2 border-amber-500/40 space-y-1.5" data-testid="batch-pieces-summary">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-medium text-amber-800">⚖️ {t('إجمالي وزن الخلطة')}</span>
                              <span className="font-bold tabular-nums">{totalKg.toFixed(3)} {t('كغم')} · {total_grams.toFixed(0)} {t('غرام')}</span>
                            </div>
                            {piecesInfo ? (
                              <>
                                <div className="flex items-center justify-between text-sm">
                                  <span className="font-medium text-amber-800">🔢 {t('عدد القطع المتوقع')}</span>
                                  <span className="font-bold text-amber-700 tabular-nums text-lg" data-testid="pieces-count">{piecesInfo.pieces_count} {t('قطعة')}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm pt-1 border-t border-amber-500/30">
                                  <span className="text-muted-foreground">💰 {t('تكلفة القطعة الواحدة')}</span>
                                  <span className="font-bold text-emerald-700 tabular-nums" data-testid="cost-per-piece">
                                    {piecesInfo.pieces_count > 0 ? formatPrice(costAfter / piecesInfo.pieces_count) : '-'}
                                  </span>
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                  {totalKg.toFixed(2)} {t('كغم')} ÷ {productForm.piece_weight} {productForm.piece_weight_unit || t('غرام')} = {piecesInfo.pieces_count} {t('قطعة')}
                                </p>
                              </>
                            ) : (
                              <p className="text-[11px] text-amber-700">
                                💡 {t('أدخل "وزن القطعة" في أعلى النموذج لاحتساب عدد القطع وسعر كل قطعة تلقائياً')}
                              </p>
                            )}
                          </div>
                        );
                      })()}
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
      {/* ⭐ Dialog: تعديل وصفة منتج موجود */}
      <Dialog open={!!showEditRecipeDialog} onOpenChange={(o) => !o && setShowEditRecipeDialog(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="edit-recipe-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-amber-600" />
              {t('تعديل وصفة')}: {showEditRecipeDialog?.name}
            </DialogTitle>
          </DialogHeader>

          {showEditRecipeDialog && (
            <div className="space-y-4">
              {/* تحذير */}
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/40 text-amber-800 text-sm">
                ⚠️ {t('تعديل الوصفة سيُعيد احتساب تكلفة الإنتاج (قبل وبعد الهدر) وهامش الربح لهذا المنتج. لن يؤثر على الكميات المُنتَجة سابقاً.')}
              </div>

              {/* ⭐ تعديل اسم الوصفة */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-bold">{t('اسم الوصفة')} <span className="text-red-500">*</span></Label>
                  <Input
                    type="text"
                    value={editRecipeForm.name}
                    onChange={(e) => setEditRecipeForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder={t('مثال: تدبيلة طحين')}
                    data-testid="edit-recipe-name"
                  />
                </div>
                <div>
                  <Label className="text-xs">{t('الاسم بالإنجليزية (اختياري)')}</Label>
                  <Input
                    type="text"
                    value={editRecipeForm.name_en}
                    onChange={(e) => setEditRecipeForm(prev => ({ ...prev, name_en: e.target.value }))}
                    placeholder="e.g. Flour Marinade"
                    data-testid="edit-recipe-name-en"
                  />
                </div>
              </div>

              {/* وزن البورشن/القطعة (يظهر دائماً) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">{t('وزن البورشن/القطعة')}</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editRecipeForm.piece_weight}
                    onChange={(e) => setEditRecipeForm(prev => ({ ...prev, piece_weight: e.target.value }))}
                    data-testid="edit-recipe-piece-weight"
                  />
                </div>
                <div>
                  <Label className="text-xs">{t('وحدة الوزن')}</Label>
                  <Select
                    value={editRecipeForm.piece_weight_unit}
                    onValueChange={(v) => setEditRecipeForm(prev => ({ ...prev, piece_weight_unit: v }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="غرام">{t('غرام')}</SelectItem>
                      <SelectItem value="كغم">{t('كغم')}</SelectItem>
                      <SelectItem value="مل">{t('مل')}</SelectItem>
                      <SelectItem value="لتر">{t('لتر')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {(() => {
                const pw = Number(editRecipeForm.piece_weight || 0);
                const pwu = editRecipeForm.piece_weight_unit || 'غرام';
                if (pw <= 0) return null;
                const W = { 'غرام': 1, 'كغم': 1000, 'مل': 1, 'لتر': 1000 };
                const pwInBase = pw * (W[pwu] || 1);
                if (pwInBase <= 0) return null;
                const baseLabel = (pwu === 'مل' || pwu === 'لتر') ? t('اللتر') : t('الكيلو');
                const portionsPerBase = Math.round((1000 / pwInBase) * 100) / 100;
                if (!Number.isFinite(portionsPerBase) || portionsPerBase <= 0) return null;
                return (
                  <p className="text-xs font-bold text-emerald-600" data-testid="edit-portion-derivation">
                    ⭐ {baseLabel} = {portionsPerBase} {t('بورشن')}
                  </p>
                );
              })()}

              {/* إضافة مكون جديد */}
              <div className="p-3 bg-purple-500/5 border border-purple-500/30 rounded-lg space-y-2">
                <Label className="flex items-center gap-2 font-bold">
                  <Plus className="h-4 w-4 text-purple-600" />
                  {t('إضافة مكون جديد')}
                </Label>
                <div className="flex gap-2 flex-wrap">
                  <Select
                    value={editNewIngredient.raw_material_id}
                    onValueChange={(v) => {
                      const m = manufacturingInventory.find(x => (x.material_id || x.raw_material_id) === v);
                      setEditNewIngredient(prev => ({ ...prev, raw_material_id: v, input_unit: m?.unit || '' }));
                    }}
                  >
                    <SelectTrigger className="flex-1 min-w-[200px] bg-background" data-testid="edit-recipe-select-material">
                      <SelectValue placeholder={t('اختر مادة خام...')} />
                    </SelectTrigger>
                    <SelectContent>
                      {manufacturingInventory.map(material => {
                        const mid = material.material_id || material.raw_material_id;
                        const mname = material.material_name || material.raw_material_name || rawMaterials.find(r => r.id === mid)?.name || '—';
                        const pi = _packInfoFor(mid);
                        return (
                          <SelectItem key={mid} value={mid}>
                            {mname} ({material.quantity} {material.unit}){pi ? ` · ${t('كل')} ${material.unit} = ${pi.pack_quantity} ${pi.pack_unit}` : ''}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder={t('الكمية')}
                    value={editNewIngredient.quantity || ''}
                    onChange={(e) => setEditNewIngredient(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))}
                    className="w-24 bg-background"
                    data-testid="edit-recipe-new-qty"
                  />
                  {editNewIngredient.raw_material_id && (() => {
                    const m = manufacturingInventory.find(x => (x.material_id || x.raw_material_id) === editNewIngredient.raw_material_id);
                    const packInfo = _packInfoFor(editNewIngredient.raw_material_id);
                    const units = availableInputUnitsFor(m?.unit, packInfo?.pack_unit);
                    if (units.length <= 1) {
                      return <div className="text-xs text-muted-foreground self-center px-2">{m?.unit}</div>;
                    }
                    return (
                      <Select
                        value={editNewIngredient.input_unit || m?.unit}
                        onValueChange={(v) => setEditNewIngredient(prev => ({ ...prev, input_unit: v }))}
                      >
                        <SelectTrigger className="w-24 bg-background" data-testid="edit-recipe-new-unit">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {units.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    );
                  })()}
                  <Button
                    type="button"
                    size="icon"
                    className="bg-green-500 hover:bg-green-600"
                    onClick={addIngredientToEditRecipe}
                    data-testid="edit-recipe-add-ingredient-btn"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {/* ⭐ inline panel لتعريف محتوى العلبة/الكرتون أثناء تعديل الوصفة */}
                {editNewIngredient.raw_material_id && (() => {
                  const m = manufacturingInventory.find(x => (x.material_id || x.raw_material_id) === editNewIngredient.raw_material_id);
                  const isPackUnit = ['علبة', 'كرتون'].includes(m?.unit);
                  if (!isPackUnit) return null;
                  const packInfo = _packInfoFor(editNewIngredient.raw_material_id);
                  if (packInfo) {
                    return (
                      <div className="flex items-center gap-2 p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs">
                        <span className="font-bold text-emerald-700 dark:text-emerald-400">
                          ✓ {t('محتوى العلبة الواحدة')}:
                        </span>
                        <span className="font-mono">1 {m?.unit} = {packInfo.pack_quantity} {packInfo.pack_unit}</span>
                        <Button
                          type="button" size="sm" variant="ghost"
                          className="h-6 px-2 text-amber-600 hover:text-amber-700 ml-auto"
                          onClick={() => setPackInfoEdit({
                            material_id: editNewIngredient.raw_material_id,
                            pack_quantity: packInfo.pack_quantity,
                            pack_unit: packInfo.pack_unit,
                          })}
                        >
                          <Edit className="h-3 w-3 ml-1" />{t('تعديل')}
                        </Button>
                      </div>
                    );
                  }
                  return (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/40 rounded-lg space-y-2">
                      <p className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                        <AlertCircle className="h-3.5 w-3.5" />
                        {t('عرّف محتوى العلبة/الكرتون لتتمكن من الإدخال بالغرام/الكيلو')}
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono whitespace-nowrap">1 {m?.unit} =</span>
                        <Input
                          type="number" min="0" step="0.01" placeholder={t('الكمية')}
                          value={packInfoEdit?.material_id === editNewIngredient.raw_material_id ? packInfoEdit.pack_quantity : ''}
                          onChange={(e) => setPackInfoEdit({
                            material_id: editNewIngredient.raw_material_id,
                            pack_quantity: parseFloat(e.target.value) || 0,
                            pack_unit: packInfoEdit?.pack_unit || 'كغم'
                          })}
                          className="w-24 bg-background h-8"
                        />
                        <Select
                          value={packInfoEdit?.material_id === editNewIngredient.raw_material_id ? (packInfoEdit.pack_unit || 'كغم') : 'كغم'}
                          onValueChange={(v) => setPackInfoEdit({
                            material_id: editNewIngredient.raw_material_id,
                            pack_quantity: packInfoEdit?.pack_quantity || 0,
                            pack_unit: v
                          })}
                        >
                          <SelectTrigger className="w-24 h-8 bg-background"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="غرام">{t('غرام')}</SelectItem>
                            <SelectItem value="كغم">{t('كغم')}</SelectItem>
                            <SelectItem value="مل">{t('مل')}</SelectItem>
                            <SelectItem value="لتر">{t('لتر')}</SelectItem>
                            <SelectItem value="قطعة">{t('قطعة')}</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          type="button" size="sm"
                          className="bg-amber-500 hover:bg-amber-600 text-white h-8"
                          onClick={savePackInfo}
                          disabled={!packInfoEdit?.pack_quantity || packInfoEdit?.material_id !== editNewIngredient.raw_material_id}
                        >
                          <Check className="h-3.5 w-3.5 ml-1" />{t('حفظ')}
                        </Button>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {t('مثال: 1 علبة فطر = 4 كغم → عند الاستخدام، إدخال 2 كغم يخصم 0.5 علبة')}
                      </p>
                    </div>
                  );
                })()}
              </div>

              {/* قائمة المكونات الحالية */}
              <div className="space-y-2">
                <Label className="font-bold">{t('المكونات الحالية')} ({editRecipeForm.recipe.length})</Label>
                {editRecipeForm.recipe.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">{t('لا توجد مكونات. أضف مكوّناً على الأقل.')}</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {editRecipeForm.recipe.map((ing, index) => {
                      const baseCost = ing.cost_per_unit || 0;
                      const wastePct = ing.waste_percentage || 0;
                      const effectiveCost = wastePct > 0 && wastePct < 100 ? baseCost / (1 - wastePct / 100) : baseCost;
                      const costAfter = Number(ing.quantity || 0) * effectiveCost;
                      return (
                        <div key={index} className="bg-background border rounded-lg px-3 py-2 space-y-1" data-testid={`edit-recipe-ingredient-${index}`}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-1">
                              <Beaker className="h-4 w-4 text-purple-500" />
                              <span className="font-medium flex-1">{ing.raw_material_name}</span>
                              {wastePct > 0 && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-950/40 text-orange-700">
                                  {t('هدر')} {wastePct}%
                                </span>
                              )}
                            </div>
                            <Input
                              type="number"
                              min="0"
                              step="0.001"
                              value={ing.quantity}
                              onChange={(e) => updateEditIngredientQty(index, e.target.value)}
                              className="w-24 h-8"
                              data-testid={`edit-recipe-qty-${index}`}
                            />
                            <span className="text-xs text-muted-foreground w-12">{ing.unit}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-red-500"
                              onClick={() => removeIngredientFromEditRecipe(index)}
                              data-testid={`edit-recipe-remove-${index}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          <div className="text-[11px] text-muted-foreground pl-6">
                            {t('بعد الهدر:')} <span className="font-medium text-emerald-600 tabular-nums">{formatPrice(costAfter)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* إجمالي التكلفة الجديدة */}
              {editRecipeForm.recipe.length > 0 && (
                <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                  <div className="p-2 rounded bg-blue-500/5 border border-blue-300/30">
                    <p className="text-[10px] text-muted-foreground">{t('إجمالي قبل الهدر')}</p>
                    <p className="font-bold text-blue-600 tabular-nums" data-testid="edit-recipe-total-before">{formatPrice(calculateEditRecipeCost())}</p>
                  </div>
                  <div className="p-2 rounded bg-emerald-500/10 border-2 border-emerald-500/40">
                    <p className="text-[10px] text-muted-foreground">⭐ {t('إجمالي بعد الهدر (تكلفة الإنتاج الجديدة)')}</p>
                    <p className="font-bold text-emerald-600 tabular-nums" data-testid="edit-recipe-total-after">{formatPrice(calculateEditRecipeCostAfterWaste())}</p>
                  </div>
                </div>
              )}

              {/* سبب التعديل */}
              <div>
                <Label className="text-xs">{t('سبب التعديل (اختياري — للسجل)')}</Label>
                <Textarea
                  rows={2}
                  value={editRecipeForm.reason}
                  onChange={(e) => setEditRecipeForm(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder={t('مثال: تعديل النسب بناءً على وصفة محدّثة من الشيف')}
                  data-testid="edit-recipe-reason"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditRecipeDialog(null)} data-testid="edit-recipe-cancel">
              {t('إلغاء')}
            </Button>
            <Button
              onClick={handleUpdateRecipe}
              disabled={savingRecipe || editRecipeForm.recipe.length === 0}
              className="bg-amber-600 hover:bg-amber-700"
              data-testid="edit-recipe-save"
            >
              {savingRecipe ? <RefreshCw className="h-4 w-4 animate-spin ml-2" /> : <CheckCircle className="h-4 w-4 ml-2" />}
              {t('حفظ التعديلات')}
            </Button>
          </DialogFooter>
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
              <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                <p className="text-sm font-medium text-green-700 mb-2">{t('المواد التي سيتم خصمها (مع المتوفر):')}</p>
                {/* ⭐ احتسب نمط الوصفة: batch (إذا piece_weight موجود ومجموع الوزن > 0) أم legacy */}
                {(() => {
                  const _W = { 'غرام': 1, 'كغم': 1000, 'كيلو': 1000, 'كجم': 1000, 'gram': 1, 'kg': 1000 };
                  const pw = Number(showProduceDialog.piece_weight || 0);
                  const pwu = showProduceDialog.piece_weight_unit || 'غرام';
                  const pieceGrams = pw * (_W[pwu] || 1);
                  let totalGrams = 0;
                  for (const ing of (showProduceDialog.recipe || [])) {
                    const f = _W[ing.unit];
                    if (f) totalGrams += Number(ing.quantity || 0) * f;
                  }
                  const calcYield = (pieceGrams > 0 && totalGrams > 0) ? totalGrams / pieceGrams : 0;
                  const isBatch = calcYield > 0;
                  const scale = isBatch && calcYield > 0 ? produceQuantity / calcYield : 1;
                  const mult = isBatch ? scale : produceQuantity;  // batch: scale × 1 each ingredient; legacy: ×quantity
                  return (
                    <>
                      {isBatch && Math.abs(scale - 1) > 1e-4 && (
                        <div className="mb-2 p-2 rounded bg-amber-500/10 border border-amber-500/30 text-xs text-amber-800">
                          ℹ️ {t('سيتم تعديل الوصفة تلقائياً بنسبة')} <strong>×{scale.toFixed(4)}</strong> {t('لتُنتج بالضبط')} {produceQuantity} {showProduceDialog.unit || 'حبة'}
                          <span className="block text-[10px] mt-0.5">{t('العائد الحالي من الوصفة')}: {calcYield.toFixed(3)} {showProduceDialog.unit || 'حبة'}</span>
                        </div>
                      )}
                      <div className="space-y-1.5">
                        {showProduceDialog.recipe?.map((ing, idx) => {
                          const needed = (Number(ing.quantity) || 0) * mult;
                          const invItem = manufacturingInventory.find(m => (m.material_id || m.raw_material_id) === ing.raw_material_id);
                          const available = Number(invItem?.quantity) || 0;
                          const isShort = available < needed;
                          return (
                            <div
                              key={idx}
                              className={`flex items-center justify-between text-sm p-2 rounded ${isShort ? 'bg-red-500/10 border border-red-500/40' : 'bg-background/50'}`}
                              data-testid={`produce-row-${idx}`}
                            >
                              <div className="flex items-center gap-2">
                                <Beaker className={`h-3.5 w-3.5 ${isShort ? 'text-red-600' : 'text-purple-500'}`} />
                                <span className="font-medium">{ing.raw_material_name}</span>
                                {isShort && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500 text-white font-bold">{t('ناقص')}</span>
                                )}
                              </div>
                              <div className="text-left tabular-nums">
                                <div className={`font-bold ${isShort ? 'text-red-700' : 'text-foreground'}`}>
                                  {t('مطلوب:')} {formatRecipeQuantity(needed, ing.unit).text}
                                </div>
                                <div className={`text-[11px] ${isShort ? 'text-red-600' : 'text-muted-foreground'}`}>
                                  {t('متوفر:')} {formatRecipeQuantity(available, ing.unit).text}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {/* ملخص: عدد المواد الناقصة */}
                      {(() => {
                        const shortCount = (showProduceDialog.recipe || []).filter(ing => {
                          const needed = (Number(ing.quantity) || 0) * mult;
                          const invItem = manufacturingInventory.find(m => (m.material_id || m.raw_material_id) === ing.raw_material_id);
                          return (Number(invItem?.quantity) || 0) < needed;
                        }).length;
                        if (shortCount === 0) return null;
                        return (
                          <div className="mt-2 p-2 rounded bg-red-500/15 border-2 border-red-500/40 text-red-700 text-sm font-bold text-center" data-testid="produce-shortfall-summary">
                            ⚠️ {shortCount} {t('مادة ناقصة — اطلب تحويلها من المخزن قبل التصنيع')}
                          </div>
                        );
                      })()}
                    </>
                  );
                })()}
              </div>

              <div>
                <Label>{t('كمية التصنيع')}</Label>
                <Input
                  type="number"
                  min="1"
                  value={produceQuantity}
                  onChange={(e) => setProduceQuantity(parseInt(e.target.value) || 1)}
                  data-testid="produce-quantity-input"
                />
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
                    <p className="font-bold text-green-500 tabular-nums">{Math.round((showAddStockDialog.quantity || 0) * 1000) / 1000} {showAddStockDialog.unit}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t('إجمالي المُصنّع')}</p>
                    <p className="font-bold text-purple-500 tabular-nums">{Math.round((showAddStockDialog.total_produced || showAddStockDialog.quantity || 0) * 1000) / 1000} {showAddStockDialog.unit || 'قطعة'}</p>
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

      {/* ========== Modal: طلب شراء جديد (يُرسل للمالك للموافقة) ========== */}
      <Dialog open={showPurchaseRequestModal} onOpenChange={setShowPurchaseRequestModal}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-green-500" />
              {t('إنشاء طلب شراء جديد')}
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-2">
              {t('ملاحظة: سيُرسل الطلب للمالك للموافقة قبل أن ينتقل لقسم المشتريات.')}
            </p>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* أولوية + ملاحظات */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t('الأولوية')}</Label>
                <Select value={purchaseRequestPriority} onValueChange={setPurchaseRequestPriority}>
                  <SelectTrigger data-testid="pr-priority-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">{t('منخفضة')}</SelectItem>
                    <SelectItem value="normal">{t('عادية')}</SelectItem>
                    <SelectItem value="high">{t('عالية')}</SelectItem>
                    <SelectItem value="urgent">{t('عاجل')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('ملاحظات (اختياري)')}</Label>
                <Input
                  value={purchaseRequestNotes}
                  onChange={(e) => setPurchaseRequestNotes(e.target.value)}
                  placeholder={t('مثال: لمطبخ الفرع الرئيسي...')}
                  data-testid="pr-notes-input"
                />
              </div>
            </div>

            {/* جدول الأصناف */}
            <div>
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <Label className="text-base font-bold">{t('الأصناف المطلوبة')}</Label>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-purple-500/40 text-purple-600 hover:bg-purple-500/10"
                    data-testid="pr-suggest-btn"
                    onClick={async () => {
                      const ids = purchaseRequestItems.filter(i => i.raw_material_id).map(i => i.raw_material_id);
                      if (ids.length === 0) {
                        toast.error(t('اختر مادة خام واحدة على الأقل أولاً'));
                        return;
                      }
                      try {
                        const res = await axios.post(`${API}/warehouse-purchase-requests/suggest-quantities`, {
                          material_ids: ids,
                          days: 30,
                          coverage_days: 7,
                        });
                        const suggestions = res.data?.suggestions || [];
                        const byId = {};
                        suggestions.forEach(s => { byId[s.raw_material_id] = s; });
                        const updated = purchaseRequestItems.map(it => {
                          const s = byId[it.raw_material_id];
                          if (!s) return it;
                          return {
                            ...it,
                            quantity: s.suggested_qty,
                            _suggestion: s,
                          };
                        });
                        setPurchaseRequestItems(updated);
                        toast.success(t('تم اقتراح الكميات بناءً على آخر 30 يوماً ✓'));
                      } catch (_e) {
                        toast.error(t('فشل اقتراح الكميات'));
                      }
                    }}
                  >
                    ✨ {t('اقتراح ذكي')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPurchaseRequestItems(prev => [...prev, { raw_material_id: '', name: '', quantity: 0, unit: 'kg', notes: '' }])}
                    data-testid="pr-add-item-btn"
                  >
                    <Plus className="h-3 w-3 ml-1" /> {t('إضافة صنف')}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                {purchaseRequestItems.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end p-2 rounded border border-border bg-card/50">
                    <div className="col-span-5">
                      <Label className="text-xs">{t('الصنف')}</Label>
                      <Select
                        value={item.raw_material_id || ''}
                        onValueChange={(val) => {
                          const v = [...purchaseRequestItems];
                          const mat = rawMaterials.find(m => m.id === val);
                          v[idx].raw_material_id = val;
                          v[idx].name = mat ? mat.name : '';
                          // تعبئة الوحدة تلقائياً من المادة الخام
                          if (mat && mat.unit) v[idx].unit = mat.unit;
                          setPurchaseRequestItems(v);
                        }}
                      >
                        <SelectTrigger data-testid={`pr-item-name-${idx}`}>
                          <SelectValue placeholder={t('اختر مادة خام من المخزن')} />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          {rawMaterials.length === 0 ? (
                            <div className="px-3 py-2 text-xs text-muted-foreground">{t('لا توجد مواد خام — أضفها من المخزن أولاً')}</div>
                          ) : (
                            rawMaterials.map(m => (
                              <SelectItem key={m.id} value={m.id}>
                                <div className="flex items-center justify-between gap-3 w-full">
                                  <span>{m.name}</span>
                                  <span className={`text-[10px] ${m.quantity <= m.min_quantity ? 'text-red-500 font-bold' : 'text-muted-foreground'}`}>
                                    {t('متوفر')}: {(m.quantity || 0).toLocaleString()} {m.unit}
                                  </span>
                                </div>
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-3">
                      <Label className="text-xs">{t('الكمية')}</Label>
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => {
                          const v = [...purchaseRequestItems];
                          v[idx].quantity = parseFloat(e.target.value) || 0;
                          setPurchaseRequestItems(v);
                        }}
                        data-testid={`pr-item-qty-${idx}`}
                      />
                    </div>
                    <div className="col-span-3">
                      <Label className="text-xs flex items-center gap-1">
                        {t('الوحدة')}
                        {item.raw_material_id && (
                          <span className="text-[9px] text-emerald-600 bg-emerald-500/10 px-1 rounded">🔒 مرتبطة بالمخزن</span>
                        )}
                      </Label>
                      <Input
                        value={item.unit || ''}
                        readOnly
                        disabled
                        className="bg-muted/50 cursor-not-allowed"
                        placeholder={t('تُملأ تلقائياً')}
                        data-testid={`pr-item-unit-${idx}`}
                      />
                    </div>
                    <div className="col-span-1">
                      {purchaseRequestItems.length > 1 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-500"
                          onClick={() => {
                            const v = purchaseRequestItems.filter((_, i) => i !== idx);
                            setPurchaseRequestItems(v);
                          }}
                          data-testid={`pr-remove-item-${idx}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {item._suggestion && (
                      <div className="col-span-12 -mt-1 text-[11px] p-2 rounded bg-purple-500/5 border border-purple-500/20" data-testid={`pr-item-suggestion-${idx}`}>
                        <span className="text-purple-600 font-semibold">✨ {t('اقتراح ذكي')}:</span>{' '}
                        <span className="text-muted-foreground">{item._suggestion.reason}</span>{' '}
                        <span className="text-emerald-600">— {t('يُنصح بشراء')} <strong>{item._suggestion.suggested_qty.toLocaleString()}</strong> {item._suggestion.unit}</span>
                        <span className="text-[10px] text-muted-foreground"> ({t('يمكنك التعديل يدوياً')})</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPurchaseRequestModal(false)}>
              {t('إلغاء')}
            </Button>
            <Button
              className="bg-green-500 hover:bg-green-600"
              data-testid="pr-submit-btn"
              onClick={async () => {
                const valid = purchaseRequestItems.filter(i => (i.raw_material_id || '').trim() && parseFloat(i.quantity) > 0);
                if (valid.length === 0) {
                  toast.error(t('اختر مادة خام واحدة على الأقل بكمية صالحة'));
                  return;
                }
                // إزالة خاصية _suggestion من العناصر قبل الإرسال
                const cleanItems = valid.map(({ _suggestion, ...rest }) => rest);
                try {
                  await axios.post(`${API}/warehouse-purchase-requests`, {
                    items: cleanItems,
                    priority: purchaseRequestPriority,
                    notes: purchaseRequestNotes,
                  });
                  toast.success(t('تم إرسال الطلب للمالك بنجاح ✓'));
                  setShowPurchaseRequestModal(false);
                } catch (err) {
                  showApiError(err, t('فشل إرسال الطلب'));
                }
              }}
            >
              <Send className="h-4 w-4 ml-2" />
              {t('إرسال للموافقة')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ========== Modal: تفاصيل طلب شراء (للمالك) ========== */}
      <Dialog open={showOwnerDetailsModal} onOpenChange={setShowOwnerDetailsModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="owner-pr-details-modal">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-orange-500 animate-pulse" />
              {t('تفاصيل طلب الشراء')} #{selectedRequestForDetails?.request_number}
            </DialogTitle>
          </DialogHeader>
          {selectedRequestForDetails && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3 p-3 bg-muted/30 rounded-lg">
                <div>
                  <p className="text-xs text-muted-foreground">{t('من')}</p>
                  <p className="font-bold">{selectedRequestForDetails.created_by_name || t('المخزن')}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('التاريخ')}</p>
                  <p className="font-bold">{new Date(selectedRequestForDetails.created_at).toLocaleString('ar-EG')}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('الأولوية')}</p>
                  <Badge className={
                    selectedRequestForDetails.priority === 'urgent' ? 'bg-red-500 text-white' :
                    selectedRequestForDetails.priority === 'high' ? 'bg-orange-500 text-white' :
                    'bg-blue-500/20 text-blue-600'
                  }>
                    {selectedRequestForDetails.priority === 'urgent' ? t('عاجل') :
                     selectedRequestForDetails.priority === 'high' ? t('عالية') :
                     selectedRequestForDetails.priority === 'low' ? t('منخفضة') : t('عادية')}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('عدد الأصناف')}</p>
                  <p className="font-bold">{(selectedRequestForDetails.items || []).length}</p>
                </div>
              </div>
              
              <div>
                <Label className="text-base font-bold mb-2 block">{t('الأصناف المطلوبة')}</Label>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-3 py-2 text-right text-sm">{t('الصنف')}</th>
                        <th className="px-3 py-2 text-center text-sm">{t('الكمية')}</th>
                        <th className="px-3 py-2 text-center text-sm">{t('الوحدة')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedRequestForDetails.items || []).map((it, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="px-3 py-2">{it.name}</td>
                          <td className="px-3 py-2 text-center font-bold">{it.quantity}</td>
                          <td className="px-3 py-2 text-center text-muted-foreground">{it.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              
              {selectedRequestForDetails.notes && (
                <div className="p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/30">
                  <p className="text-xs text-muted-foreground mb-1">{t('ملاحظات')}</p>
                  <p className="text-sm">{selectedRequestForDetails.notes}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="border-red-500/50 text-red-500"
              onClick={async () => {
                if (selectedRequestForDetails) {
                  await rejectPurchaseRequest(selectedRequestForDetails.id);
                  setShowOwnerDetailsModal(false);
                }
              }}
              data-testid="modal-reject-pr"
            >
              <X className="h-4 w-4 ml-1" /> {t('رفض')}
            </Button>
            <Button
              className="bg-emerald-500 hover:bg-emerald-600"
              onClick={async () => {
                if (selectedRequestForDetails) {
                  await approvePurchaseRequest(selectedRequestForDetails.id);
                  setShowOwnerDetailsModal(false);
                }
              }}
              data-testid="modal-approve-pr"
            >
              <CheckCircle className="h-4 w-4 ml-1" /> {t('موافقة وإرسال للمشتريات')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === Edit Raw Material Dialog (للمالك فقط، قبل التحويل) === */}
      <Dialog open={!!editRawMaterial} onOpenChange={(o) => !o && setEditRawMaterial(null)}>
        <DialogContent className="max-w-md" data-testid="edit-raw-material-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-blue-500" />
              {t('تعديل المادة الخام')}
            </DialogTitle>
          </DialogHeader>
          {editRawMaterial && (
            <div className="space-y-3 py-2">
              <div className="p-2.5 bg-blue-500/10 border border-blue-500/30 rounded text-xs text-blue-700 dark:text-blue-300">
                {t('يمكن تعديل أي حقل لأن المادة لم تُحوّل للتصنيع بعد. بعد التحويل ستُقفل المادة.')}
              </div>
              <div>
                <Label>{t('الاسم')}</Label>
                <Input
                  value={editRawMaterial.name || ''}
                  onChange={(e) => setEditRawMaterial({ ...editRawMaterial, name: e.target.value })}
                  data-testid="edit-rm-name-input"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t('الكمية')}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editRawMaterial.quantity ?? 0}
                    onChange={(e) => setEditRawMaterial({ ...editRawMaterial, quantity: e.target.value })}
                    data-testid="edit-rm-quantity-input"
                  />
                </div>
                <div>
                  <Label>{t('الوحدة')}</Label>
                  <Input
                    value={editRawMaterial.unit || ''}
                    onChange={(e) => setEditRawMaterial({ ...editRawMaterial, unit: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t('التكلفة/وحدة')}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editRawMaterial.cost_per_unit ?? 0}
                    onChange={(e) => setEditRawMaterial({ ...editRawMaterial, cost_per_unit: e.target.value })}
                    data-testid="edit-rm-cost-input"
                  />
                </div>
                <div>
                  <Label>{t('الحد الأدنى')}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editRawMaterial.min_quantity ?? 0}
                    onChange={(e) => setEditRawMaterial({ ...editRawMaterial, min_quantity: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t('نسبة الهدر %')}</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={editRawMaterial.waste_percentage ?? 0}
                    onChange={(e) => setEditRawMaterial({ ...editRawMaterial, waste_percentage: e.target.value })}
                  />
                </div>
                <div>
                  <Label>{t('الفئة')}</Label>
                  <Input
                    value={editRawMaterial.category || ''}
                    onChange={(e) => setEditRawMaterial({ ...editRawMaterial, category: e.target.value })}
                  />
                </div>
              </div>

              {/* تعريف الوحدة (اختياري) — يظهر فقط عند اختيار قطعة/علبة/كرتون */}
              {['قطعة', 'علبة', 'كرتون'].includes(editRawMaterial.unit) && (
                <div className="rounded-lg border border-amber-300/60 bg-amber-50/40 dark:bg-amber-900/10 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
                    <Package className="h-4 w-4" />
                    {t(`تعريف ${editRawMaterial.unit} (اختياري)`)}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">{t('الكمية لكل')} {editRawMaterial.unit}</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editRawMaterial.pack_quantity ?? ''}
                        onChange={(e) => setEditRawMaterial({ ...editRawMaterial, pack_quantity: e.target.value })}
                        placeholder={editRawMaterial.unit === 'كرتون' ? '12' : '250'}
                        data-testid="edit-pack-quantity-input"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">{t('وحدة المحتوى')}</Label>
                      <Select
                        value={editRawMaterial.pack_unit || 'غرام'}
                        onValueChange={(v) => setEditRawMaterial({ ...editRawMaterial, pack_unit: v })}
                      >
                        <SelectTrigger data-testid="edit-pack-unit-select">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="غرام">{t('غرام')}</SelectItem>
                          <SelectItem value="كغم">{t('كغم')}</SelectItem>
                          <SelectItem value="مل">{t('مل')}</SelectItem>
                          <SelectItem value="لتر">{t('لتر')}</SelectItem>
                          <SelectItem value="قطعة">{t('قطعة')}</SelectItem>
                          <SelectItem value="شريحة">{t('شريحة')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRawMaterial(null)} data-testid="edit-rm-cancel-btn">
              {t('إلغاء')}
            </Button>
            <Button onClick={handleUpdateRawMaterial} disabled={submitting} data-testid="edit-rm-save-btn">
              {submitting ? t('جاري الحفظ...') : t('حفظ التعديلات')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === Delete Raw Material Confirmation === */}
      <Dialog open={!!deleteRawMaterial} onOpenChange={(o) => !o && setDeleteRawMaterial(null)}>
        <DialogContent className="max-w-md" data-testid="delete-raw-material-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              {t('تأكيد الحذف')}
            </DialogTitle>
          </DialogHeader>
          {deleteRawMaterial && (
            <div className="space-y-3 py-2">
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded">
                <p className="text-sm">
                  {t('هل أنت متأكد من حذف المادة')}: <span className="font-bold">{deleteRawMaterial.name}</span>؟
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  {t('سيتم حذف المادة وجميع طبقات تكلفتها. هذا الإجراء لا يمكن التراجع عنه.')}
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteRawMaterial(null)} data-testid="delete-rm-cancel-btn">
              {t('إلغاء')}
            </Button>
            <Button
              className="bg-red-500 hover:bg-red-600"
              onClick={handleDeleteRawMaterial}
              disabled={submitting}
              data-testid="delete-rm-confirm-btn"
            >
              {submitting ? t('جاري الحذف...') : t('نعم، احذف')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: تصحيح إداري لمادة خام محوّلة */}
      <Dialog open={!!adminCorrection} onOpenChange={(o) => !o && setAdminCorrection(null)}>
        <DialogContent className="max-w-lg" data-testid="admin-correction-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              ⚡ {t('تصحيح إداري')} — {adminCorrection?.name}
            </DialogTitle>
          </DialogHeader>
          {adminCorrection && (
            <div className="space-y-3">
              <div className="rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-sm text-amber-700">
                💡 {t('للأخطاء الشائعة (إدخال غرام بدل كغم). كل تصحيح يُسجَّل بالتاريخ والمستخدم في سجل المراجعة.')}
              </div>
              {/* ⭐ تعديل اسم المادة الخام */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-bold">{t('اسم المادة')} <span className="text-red-500">*</span></Label>
                  <Input
                    type="text"
                    value={adminCorrection.name || ''}
                    onChange={(e) => setAdminCorrection(prev => ({ ...prev, name: e.target.value }))}
                    placeholder={t('مثال: لحم برغر')}
                    data-testid="correction-name"
                  />
                </div>
                <div>
                  <Label className="text-xs">{t('الاسم بالإنجليزية (اختياري)')}</Label>
                  <Input
                    type="text"
                    value={adminCorrection.name_en || ''}
                    onChange={(e) => setAdminCorrection(prev => ({ ...prev, name_en: e.target.value }))}
                    placeholder="e.g. Burger Beef"
                    data-testid="correction-name-en"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">{t('الكمية')}</Label>
                  <Input
                    type="number" step="0.001" min="0"
                    value={adminCorrection.quantity}
                    onChange={(e) => setAdminCorrection(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))}
                    data-testid="correction-quantity"
                  />
                </div>
                <div>
                  <Label className="text-xs">{t('الحد الأدنى')}</Label>
                  <Input
                    type="number" step="0.001" min="0"
                    value={adminCorrection.min_quantity}
                    onChange={(e) => setAdminCorrection(prev => ({ ...prev, min_quantity: parseFloat(e.target.value) || 0 }))}
                    data-testid="correction-min-quantity"
                  />
                </div>
                <div>
                  <Label className="text-xs">{t('الوحدة')}</Label>
                  <Select
                    value={adminCorrection.unit}
                    onValueChange={(v) => setAdminCorrection(prev => ({ ...prev, unit: v }))}
                  >
                    <SelectTrigger data-testid="correction-unit"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['كغم','غرام','لتر','مل','قطعة','علبة','كرتون'].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{t('التكلفة/وحدة')}</Label>
                  <Input
                    type="number" step="1" min="0"
                    value={adminCorrection.cost_per_unit}
                    onChange={(e) => setAdminCorrection(prev => ({ ...prev, cost_per_unit: parseFloat(e.target.value) || 0 }))}
                    data-testid="correction-cost"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">{t('سبب التصحيح')} *</Label>
                <Textarea
                  rows={2}
                  placeholder={t('مثال: إدخال خاطئ بالغرام بدل الكغم')}
                  value={adminCorrection.reason}
                  onChange={(e) => setAdminCorrection(prev => ({ ...prev, reason: e.target.value }))}
                  data-testid="correction-reason"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdminCorrection(null)} data-testid="correction-cancel">
              {t('إلغاء')}
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700"
              disabled={submitting || !adminCorrection?.reason?.trim()}
              onClick={async () => {
                try {
                  setSubmitting(true);
                  await axios.post(`${API}/raw-materials-new/${adminCorrection.material_id}/admin-correct`, {
                    name: (adminCorrection.name || '').trim() || undefined,
                    name_en: (adminCorrection.name_en || '').trim() || undefined,
                    quantity: parseFloat(adminCorrection.quantity) || 0,
                    min_quantity: parseFloat(adminCorrection.min_quantity) || 0,
                    unit: adminCorrection.unit,
                    cost_per_unit: parseFloat(adminCorrection.cost_per_unit) || 0,
                    reason: adminCorrection.reason,
                  }, { headers });
                  toast.success(t('تم التصحيح وتسجيله في سجل المراجعة'));
                  setAdminCorrection(null);
                  fetchData();
                } catch (err) {
                  showApiError(err, t('فشل التصحيح'));
                } finally {
                  setSubmitting(false);
                }
              }}
              data-testid="correction-confirm"
            >
              {submitting ? <RefreshCw className="h-4 w-4 animate-spin ml-2" /> : <CheckCircle className="h-4 w-4 ml-2" />}
              {t('تطبيق التصحيح')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: التنفيذ الجزئي لطلب التصنيع — تعديل الكميات */}
      <Dialog open={mfgFulfillDialog.open} onOpenChange={(open) => setMfgFulfillDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="mfg-partial-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <Pencil className="h-5 w-5" />
              {t('تنفيذ جزئي — تعديل الكميات حسب المتوفر')}
            </DialogTitle>
          </DialogHeader>
          {mfgFulfillDialog.request && (
            <div className="space-y-4">
              <div className="rounded-md bg-blue-500/10 border border-blue-500/30 px-3 py-2 text-sm text-blue-700">
                💡 {t('عدّل الكمية المُرسلة لكل صنف. ضع 0 لأي صنف لا يمكن إرساله الآن. الكميات المتبقية ستبقى في الطلب لتنفيذ لاحق عند توفّر المواد.')}
              </div>
              <div className="border rounded-lg overflow-hidden">
                <div className="grid grid-cols-12 gap-2 bg-muted/40 px-3 py-2 text-xs font-medium">
                  <div className="col-span-4">{t('المادة')}</div>
                  <div className="col-span-2 text-center">{t('المطلوب')}</div>
                  <div className="col-span-2 text-center">{t('المتوفر')}</div>
                  <div className="col-span-3 text-center">{t('سيُرسَل الآن')}</div>
                  <div className="col-span-1 text-center">⚙</div>
                </div>
                {(mfgFulfillDialog.request.items || []).map((it) => {
                  const avail = Number(it.available_quantity || 0);
                  const req = Number(it.quantity || 0);
                  const cur = Number(mfgFulfillDialog.qtyOverrides[it.material_id] ?? 0);
                  const max = Math.min(avail, req);
                  return (
                    <div key={it.material_id} className="grid grid-cols-12 gap-2 px-3 py-2 items-center border-t text-sm" data-testid={`mfg-row-${it.material_id}`}>
                      <div className="col-span-4 font-medium truncate">{it.material_name}</div>
                      <div className="col-span-2 text-center">{req} {it.unit}</div>
                      <div className={`col-span-2 text-center font-bold ${avail >= req ? 'text-green-600' : avail > 0 ? 'text-amber-600' : 'text-red-600'}`}>
                        {avail}
                      </div>
                      <div className="col-span-3 flex items-center gap-1">
                        <Input
                          type="number"
                          min="0"
                          max={max}
                          step="0.01"
                          value={cur}
                          onChange={(e) => {
                            let v = parseFloat(e.target.value) || 0;
                            if (v < 0) v = 0;
                            if (v > max) v = max;
                            setMfgFulfillDialog(prev => ({
                              ...prev,
                              qtyOverrides: { ...prev.qtyOverrides, [it.material_id]: v }
                            }));
                          }}
                          className="h-8 text-sm text-center"
                          data-testid={`mfg-qty-${it.material_id}`}
                        />
                      </div>
                      <div className="col-span-1 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          title={t('استخدم الحد الأقصى المتوفر')}
                          onClick={() => setMfgFulfillDialog(prev => ({
                            ...prev,
                            qtyOverrides: { ...prev.qtyOverrides, [it.material_id]: max }
                          }))}
                          data-testid={`mfg-max-${it.material_id}`}
                        >
                          ↑
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div>
                <Label className="text-sm mb-1 block">{t('رسالة لقسم التصنيع (اختيارية)')}</Label>
                <Textarea
                  rows={2}
                  placeholder={t('مثال: تم إرسال جزء فقط لقلة المخزون — سيُرسل الباقي يوم الأحد')}
                  value={mfgFulfillDialog.notes}
                  onChange={(e) => setMfgFulfillDialog(prev => ({ ...prev, notes: e.target.value }))}
                  data-testid="mfg-notes-to-manufacturing"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMfgFulfillDialog({ open: false, request: null, qtyOverrides: {}, partial: false, notes: '' })} data-testid="mfg-partial-cancel">
              {t('إلغاء')}
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700"
              disabled={submitting || !mfgFulfillDialog.request}
              onClick={() => {
                const items = (mfgFulfillDialog.request?.items || []).map(it => ({
                  material_id: it.material_id,
                  quantity: Number(mfgFulfillDialog.qtyOverrides[it.material_id] || 0),
                }));
                const totalSent = items.reduce((s, x) => s + (x.quantity || 0), 0);
                if (totalSent <= 0) {
                  toast.error(t('يجب إرسال كمية واحدة على الأقل'));
                  return;
                }
                handleFulfillManufacturingRequest(
                  mfgFulfillDialog.request.id,
                  items,
                  true,
                  mfgFulfillDialog.notes
                );
              }}
              data-testid="mfg-partial-confirm"
            >
              {submitting ? <RefreshCw className="h-4 w-4 animate-spin ml-2" /> : <CheckCircle className="h-4 w-4 ml-2" />}
              {t('تنفيذ جزئي وإشعار التصنيع')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 🔧 Dialog: نتيجة المزامنة الشاملة للمكونات اليتيمة */}
      <Dialog open={!!syncOrphansResult} onOpenChange={(open) => !open && setSyncOrphansResult(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="sync-orphans-result-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-amber-500" />
              {t('تقرير المزامنة الشاملة')}
            </DialogTitle>
          </DialogHeader>
          {syncOrphansResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">{t('مفحوصة')}</p>
                  <p className="text-2xl font-bold text-blue-500">{syncOrphansResult.scanned}</p>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">{t('يتيمة')}</p>
                  <p className="text-2xl font-bold text-amber-500">{syncOrphansResult.orphans_total}</p>
                </div>
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">{t('مربوطة')}</p>
                  <p className="text-2xl font-bold text-green-500">{syncOrphansResult.linked}</p>
                </div>
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">{t('غير متطابقة')}</p>
                  <p className="text-2xl font-bold text-red-500">{syncOrphansResult.unmatched_count}</p>
                </div>
              </div>

              {/* ⭐ مزامنة قسم التصنيع (الوحدات/الأسماء/التكاليف) */}
              {(syncOrphansResult.mfg_inventory_scanned > 0 || syncOrphansResult.mfg_inventory_synced > 0) && (
                <div className="grid grid-cols-3 gap-3 border-t pt-3">
                  <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">{t('سجلات قسم التصنيع')}</p>
                    <p className="text-xl font-bold text-purple-500">{syncOrphansResult.mfg_inventory_scanned || 0}</p>
                  </div>
                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">{t('تمت مزامنتها')}</p>
                    <p className="text-xl font-bold text-emerald-600">{syncOrphansResult.mfg_inventory_synced || 0}</p>
                  </div>
                  <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">{t('بدون مرجع')}</p>
                    <p className="text-xl font-bold text-orange-500">{(syncOrphansResult.mfg_inventory_orphans || []).length}</p>
                  </div>
                </div>
              )}

              {syncOrphansResult.products && syncOrphansResult.products.length > 0 && (
                <div>
                  <h4 className="font-bold mb-2 text-green-600">
                    {t('وصفات تم تعديلها')} ({syncOrphansResult.products_updated})
                  </h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {syncOrphansResult.products.map((p) => (
                      <div key={p.id} className="border rounded-lg p-3 bg-card">
                        <p className="font-semibold mb-1">{p.name}</p>
                        {p.linked && p.linked.length > 0 && (
                          <ul className="text-xs space-y-1">
                            {p.linked.map((l, idx) => (
                              <li key={idx} className="flex items-center gap-2 text-green-600">
                                <Check className="h-3 w-3" />
                                <span>{l.name}</span>
                                <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                  {l.source === 'manufactured' ? '🏭 منتج مُصنّع' : '📦 مادة خام'}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {p.unmatched && p.unmatched.length > 0 && (
                          <ul className="text-xs space-y-1 mt-1">
                            {p.unmatched.map((n, idx) => (
                              <li key={idx} className="flex items-center gap-2 text-red-500">
                                <X className="h-3 w-3" />
                                <span>{n}</span>
                                <span className="text-muted-foreground">({t('غير موجود في الجدولين')})</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {syncOrphansResult.unmatched && syncOrphansResult.unmatched.length > 0 && (
                <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">
                    💡 {t('المكونات أدناه لم يتم العثور على تطابق لها — يُفضّل تعديلها يدوياً أو إنشاؤها كمادة خام/منتج مُصنّع.')}
                  </p>
                </div>
              )}

              {syncOrphansResult.orphans_total === 0 && (
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 text-center">
                  <Check className="h-8 w-8 mx-auto text-green-500 mb-2" />
                  <p className="font-bold text-green-600">{t('كل الوصفات سليمة!')}</p>
                  <p className="text-xs text-muted-foreground">{t('لا توجد مكونات يتيمة في النظام.')}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setSyncOrphansResult(null)} data-testid="sync-orphans-close-btn">
              {t('إغلاق')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
