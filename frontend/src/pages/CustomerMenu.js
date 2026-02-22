import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { API_URL, BACKEND_URL } from '../utils/api';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '../components/ui/dialog';
import { toast } from 'sonner';
import { 
  ShoppingCart, 
  Plus, 
  Minus, 
  MapPin, 
  Phone, 
  User,
  Trash2,
  CreditCard,
  Banknote,
  Clock,
  CheckCircle,
  Truck,
  ChefHat,
  ArrowRight,
  ArrowLeft,
  Search,
  Download,
  Store,
  Navigation,
  Loader2,
  X,
  Smartphone,
  Wallet,
  History,
  Package,
  Calendar,
  Heart,
  Star,
  Bookmark,
  MessageSquare
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
// Fix Leaflet marker icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});
const API = API_URL;
// ==================== LOCATION PICKER COMPONENT ====================
function LocationPicker({ position, setPosition, onClose, t }) {
  const [loading, setLoading] = useState(false);
  const MapClickHandler = () => {
    useMapEvents({
      click: (e) => {
        setPosition([e.latlng.lat, e.latlng.lng]);
      },
    });
    return null;
  };
  const getCurrentLocation = () => {
    setLoading(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setPosition([pos.coords.latitude, pos.coords.longitude]);
          setLoading(false);
        },
        (error) => {
          toast.error(t('فشل في تحديد الموقع'));
          setLoading(false);
        },
        { enableHighAccuracy: true }
      );
    } else {
      toast.error(t('المتصفح لا يدعم تحديد الموقع'));
      setLoading(false);
    }
  };
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button 
          variant="outline" 
          onClick={getCurrentLocation}
          disabled={loading}
          className="flex-1"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Navigation className="h-4 w-4 ml-2" />}
          {t('موقعي الحالي')}
        </Button>
      </div>
      <div className="h-[350px] rounded-xl overflow-hidden border-2 border-gray-200 shadow-lg">
        <MapContainer
          center={position || [33.3152, 44.3661]} // Baghdad default
          zoom={14}
          className="h-full w-full"
        >
          {/* خريطة داكنة مع أسماء الشوارع واضحة */}
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            attribution='&copy; CARTO'
          />
          <MapClickHandler />
          {position && (
            <Marker 
              position={position}
              icon={L.divIcon({
                className: 'location-marker',
                html: `
                  <div style="
                    background: linear-gradient(135deg, #ef4444, #f97316);
                    width: 50px;
                    height: 50px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 26px;
                    border: 4px solid white;
                    box-shadow: 0 0 20px rgba(239,68,68,0.5), 0 6px 20px rgba(0,0,0,0.4);
                    animation: bounce 1s ease-in-out;
                  ">📍</div>
                  <style>
                    @keyframes bounce {
                      0%, 100% { transform: translateY(0); }
                      50% { transform: translateY(-10px); }
                    }
                  </style>
                `,
                iconSize: [50, 50],
                iconAnchor: [25, 50]
              })}
            />
          )}
        </MapContainer>
      </div>
      <p className="text-sm text-center text-gray-600 mt-2 flex items-center justify-center gap-2">
        <span className="text-lg">👆</span>
        {t('انقر على الخريطة لتحديد موقع التوصيل')}
      </p>
    </div>
  );
}
// ==================== MAIN COMPONENT ====================
export default function CustomerMenu() {
  const { tenantId } = useParams();
  const [searchParams] = useSearchParams();
  const { t, lang, isRTL, changeLanguage } = useTranslation();
  
  // App States
  const [step, setStep] = useState('branches'); // branches, menu, cart, checkout, tracking, history
  const [restaurant, setRestaurant] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentOrder, setCurrentOrder] = useState(null);
  const [orderHistory, setOrderHistory] = useState([]);
  
  // Customer Info
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [deliveryLocation, setDeliveryLocation] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showMap, setShowMap] = useState(false);
  
  // المفضلة
  const [favorites, setFavorites] = useState([]);
  const [showFavoritesDialog, setShowFavoritesDialog] = useState(false);
  const [savingFavorite, setSavingFavorite] = useState(false);
  const [favoriteName, setFavoriteName] = useState('');
  const [showSaveFavoriteDialog, setShowSaveFavoriteDialog] = useState(false);
  
  // التقييمات
  const [showRatingDialog, setShowRatingDialog] = useState(false);
  const [ratingOrder, setRatingOrder] = useState(null);
  const [rating, setRating] = useState(5);
  const [ratingComment, setRatingComment] = useState('');
  const [foodRating, setFoodRating] = useState(5);
  const [deliveryRating, setDeliveryRating] = useState(5);
  const [serviceRating, setServiceRating] = useState(5);
  const [submittingRating, setSubmittingRating] = useState(false);
  
  // PWA
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  
  // Payment
  const [processingPayment, setProcessingPayment] = useState(false);
  const [savedCards, setSavedCards] = useState([]);
  const [saveCard, setSaveCard] = useState(false);
  // Check payment status on return from Stripe
  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    const paymentSuccess = searchParams.get('payment_success');
    const paymentCancelled = searchParams.get('payment_cancelled');
    
    if (sessionId && paymentSuccess) {
      pollPaymentStatus(sessionId);
    } else if (paymentCancelled) {
      toast.error(t('تم إلغاء عملية الدفع'));
    }
  }, [searchParams]);
  const pollPaymentStatus = async (sessionId, attempts = 0) => {
    const maxAttempts = 10;
    if (attempts >= maxAttempts) {
      toast.error(t('انتهت مهلة التحقق من الدفع'));
      return;
    }
    
    try {
      const res = await axios.get(`${API}/payments/status/${sessionId}`);
      if (res.data.payment_status === 'paid') {
        toast.success(t('تم الدفع بنجاح!'));
        // جلب تفاصيل الطلب
        if (res.data.order_id) {
          const orderRes = await axios.get(`${API}/customer/order/${tenantId}/${res.data.order_id}`);
          setCurrentOrder(orderRes.data.order);
          setStep('tracking');
          setCart([]);
          localStorage.removeItem(`cart_${tenantId}`);
        }
      } else if (res.data.status === 'expired') {
        toast.error(t('انتهت صلاحية جلسة الدفع'));
      } else {
        // Continue polling
        setTimeout(() => pollPaymentStatus(sessionId, attempts + 1), 2000);
      }
    } catch (error) {
      console.error('Payment status error:', error);
    }
  };
  // PWA Install handling - تحديث manifest للعملاء
  useEffect(() => {
    // تغيير manifest link لاستخدام manifest العملاء الجديد
    const manifestLink = document.querySelector('link[rel="manifest"]');
    if (manifestLink) {
      // استخدام manifest-menu.json الجديد
      manifestLink.href = '/manifest-menu.json?v=' + Date.now();
    }
    
    // تحديث meta tags
    const themeColor = document.querySelector('meta[name="theme-color"]');
    const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (themeColor) themeColor.content = '#f97316';
    if (appleTitle) appleTitle.content = restaurant?.name || 'قائمة الطعام';
    
    // تحديث عنوان الصفحة
    document.title = (restaurant?.name || 'قائمة الطعام') + ' - اطلب الآن';
    
    // حفظ معرف المطعم للـ PWA
    if (tenantId) {
      localStorage.setItem('customer_restaurant', tenantId);
    }
    
    return () => {
      // لا نعيد manifest الأصلي - سيتم تحديده من index.html
    };
  }, [restaurant, tenantId]);
  // PWA Install handling
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setTimeout(() => setShowInstallBanner(true), 3000);
    };
    
    window.addEventListener('beforeinstallprompt', handler);
    
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    
    if (isIOS && !isStandalone) {
      setTimeout(() => setShowInstallBanner(true), 3000);
    }
    
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);
  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        toast.success(t('تم تثبيت التطبيق بنجاح!'));
      }
      setDeferredPrompt(null);
      setShowInstallBanner(false);
    }
  };
  // تسجيل إشعارات Push
  const registerPushNotifications = async () => {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.log('Push notifications not supported');
        return;
      }
      // تسجيل Service Worker
      const registration = await navigator.serviceWorker.register('/sw-push.js');
      console.log('Service Worker registered');
      // طلب إذن الإشعارات
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.log('Notification permission denied');
        return;
      }
      // الاشتراك في Push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          // VAPID public key (يجب توليدها)
          'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'
        )
      });
      // حفظ الاشتراك
      const savedCustomer = localStorage.getItem(`customer_${tenantId}`);
      const customerData = savedCustomer ? JSON.parse(savedCustomer) : {};
      await axios.post(`${API}/push/subscribe`, {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: btoa(String.fromCharCode.apply(null, new Uint8Array(subscription.getKey('p256dh')))),
          auth: btoa(String.fromCharCode.apply(null, new Uint8Array(subscription.getKey('auth'))))
        },
        phone: customerData.phone,
        user_type: 'customer'
      });
      console.log('Push subscription saved');
    } catch (error) {
      console.log('Push registration error:', error);
    }
  };
  // تحويل VAPID key
  const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };
  useEffect(() => {
    fetchMenu();
    loadSavedData();
    fetchOrderHistory();
    fetchFavorites();
    // تحديد الموقع تلقائياً عند فتح التطبيق
    autoDetectLocation();
    // تسجيل إشعارات Push
    registerPushNotifications();
  }, [tenantId]);
  // تحديد الموقع تلقائياً
  const autoDetectLocation = () => {
    if (!deliveryLocation && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          setDeliveryLocation([pos.coords.latitude, pos.coords.longitude]);
          // حفظ الموقع في localStorage
          const savedCustomer = localStorage.getItem(`customer_${tenantId}`);
          const customerData = savedCustomer ? JSON.parse(savedCustomer) : {};
          customerData.location = [pos.coords.latitude, pos.coords.longitude];
          localStorage.setItem(`customer_${tenantId}`, JSON.stringify(customerData));
          
          // تحويل الإحداثيات لعنوان تلقائياً
          await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
          toast.success(t('تم تحديد موقعك تلقائياً'));
        },
        (error) => {
          console.log('Could not auto-detect location:', error.message);
          // لا نعرض رسالة خطأ لأنها تحدث تلقائياً وقد يرفض المستخدم الإذن
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    }
  };
  // تحويل الإحداثيات لعنوان (Reverse Geocoding)
  const reverseGeocode = async (lat, lng) => {
    try {
      const res = await axios.get(`${API}/geocode/reverse`, {
        params: { lat, lng }
      });
      if (res.data.address) {
        // استخدام عنوان مختصر
        const shortAddress = [
          res.data.neighbourhood,
          res.data.street,
          res.data.city
        ].filter(Boolean).join('، ');
        setDeliveryAddress(shortAddress || res.data.address);
      }
    } catch (error) {
      console.log('Reverse geocoding error:', error);
    }
  };
  // البحث عن عنوان (Address Autocomplete)
  const searchAddress = async (query) => {
    if (!query || query.length < 3) {
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
      return;
    }
    
    setSearchingAddress(true);
    try {
      const params = { query };
      if (deliveryLocation) {
        params.lat = deliveryLocation[0];
        params.lng = deliveryLocation[1];
      }
      
      const res = await axios.get(`${API}/geocode/search`, { params });
      setAddressSuggestions(res.data.results || []);
      setShowAddressSuggestions(true);
    } catch (error) {
      console.log('Address search error:', error);
    } finally {
      setSearchingAddress(false);
    }
  };
  // اختيار عنوان من الاقتراحات
  const selectAddress = (suggestion) => {
    setDeliveryAddress(suggestion.address);
    setDeliveryLocation([suggestion.lat, suggestion.lng]);
    setShowAddressSuggestions(false);
    
    // حفظ في localStorage
    const savedCustomer = localStorage.getItem(`customer_${tenantId}`);
    const customerData = savedCustomer ? JSON.parse(savedCustomer) : {};
    customerData.location = [suggestion.lat, suggestion.lng];
    customerData.address = suggestion.address;
    localStorage.setItem(`customer_${tenantId}`, JSON.stringify(customerData));
    
    toast.success(t('تم اختيار العنوان'));
  };
  // جلب سجل الطلبات السابقة
  const fetchOrderHistory = async () => {
    const savedCustomer = localStorage.getItem(`customer_${tenantId}`);
    if (!savedCustomer) return;
    
    const customerData = JSON.parse(savedCustomer);
    if (!customerData.phone) return;
    
    try {
      const res = await axios.get(`${API}/customer/orders/history`, {
        params: {
          tenant_id: tenantId,
          phone: customerData.phone
        }
      });
      setOrderHistory(res.data || []);
    } catch (error) {
      console.log('Could not fetch order history:', error.message);
    }
  };
  // جلب الطلبات المفضلة
  const fetchFavorites = async () => {
    const savedCustomer = localStorage.getItem(`customer_${tenantId}`);
    if (!savedCustomer) return;
    
    const customerData = JSON.parse(savedCustomer);
    if (!customerData.phone) return;
    
    try {
      const res = await axios.get(`${API}/customer/favorites`, {
        params: {
          tenant_id: tenantId,
          phone: customerData.phone
        }
      });
      setFavorites(res.data || []);
    } catch (error) {
      console.log('Could not fetch favorites:', error.message);
    }
  };
  // حفظ الطلب الحالي كمفضل
  const saveToFavorites = async () => {
    if (cart.length === 0) {
      toast.error(t('السلة فارغة'));
      return;
    }
    
    const savedCustomer = localStorage.getItem(`customer_${tenantId}`);
    if (!savedCustomer) {
      toast.error(t('يرجى إدخال رقم هاتفك أولاً'));
      return;
    }
    
    const customerData = JSON.parse(savedCustomer);
    if (!customerData.phone) {
      toast.error(t('يرجى إدخال رقم هاتفك أولاً'));
      return;
    }
    setSavingFavorite(true);
    try {
      const items = cart.map(item => ({
        product_id: item.product_id || item.id,
        product_name: item.name,
        quantity: item.quantity,
        price: item.price,
        notes: item.notes || ''
      }));
      await axios.post(`${API}/customer/favorites/add`, {
        tenant_id: tenantId,
        phone: customerData.phone,
        name: favoriteName || `طلبي المفضل`,
        items: items
      });
      toast.success(t('تم حفظ الطلب في المفضلة'));
      setShowSaveFavoriteDialog(false);
      setFavoriteName('');
      fetchFavorites();
    } catch (error) {
      toast.error(t('فشل في حفظ الطلب'));
    } finally {
      setSavingFavorite(false);
    }
  };
  // حذف طلب من المفضلة
  const removeFromFavorites = async (favoriteId) => {
    const savedCustomer = localStorage.getItem(`customer_${tenantId}`);
    if (!savedCustomer) return;
    
    const customerData = JSON.parse(savedCustomer);
    
    try {
      await axios.delete(`${API}/customer/favorites/${favoriteId}`, {
        params: { phone: customerData.phone }
      });
      toast.success(t('تم الحذف من المفضلة'));
      fetchFavorites();
    } catch (error) {
      toast.error(t('فشل في الحذف'));
    }
  };
  // إضافة طلب مفضل للسلة
  const addFavoriteToCart = (favorite) => {
    const newCartItems = favorite.items.map(item => ({
      id: item.product_id,
      name: item.product_name,
      price: item.price,
      quantity: item.quantity,
      notes: item.notes || ''
    }));
    
    setCart(newCartItems);
    setShowFavoritesDialog(false);
    toast.success(t('تمت إضافة الطلب المفضل للسلة'));
  };
  // فتح نافذة التقييم
  const openRatingDialog = (order) => {
    setRatingOrder(order);
    setRating(5);
    setRatingComment('');
    setFoodRating(5);
    setDeliveryRating(5);
    setServiceRating(5);
    setShowRatingDialog(true);
  };
  // إرسال التقييم
  const submitRating = async () => {
    if (!ratingOrder) return;
    
    setSubmittingRating(true);
    try {
      await axios.post(`${API}/customer/rate-order`, {
        order_id: ratingOrder.id,
        tenant_id: tenantId,
        phone: customerPhone,
        rating: rating,
        comment: ratingComment,
        food_quality: foodRating,
        delivery_speed: deliveryRating,
        service_quality: serviceRating
      });
      
      toast.success(t('شكراً لتقييمك!'));
      setShowRatingDialog(false);
      setRatingOrder(null);
      fetchOrderHistory();
    } catch (error) {
      if (error.response?.data?.detail === 'تم تقييم هذا الطلب مسبقاً') {
        toast.info(t('تم تقييم هذا الطلب مسبقاً'));
      } else {
        toast.error(t('فشل في إرسال التقييم'));
      }
    } finally {
      setSubmittingRating(false);
    }
  };
  // مكون النجوم للتقييم
  const StarRating = ({ value, onChange, size = 'md' }) => {
    const sizeClass = size === 'lg' ? 'h-8 w-8' : 'h-5 w-5';
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            className="focus:outline-none transition-transform hover:scale-110"
          >
            <Star
              className={`${sizeClass} ${
                star <= value
                  ? 'fill-yellow-400 text-yellow-400'
                  : 'fill-gray-200 text-gray-200'
              }`}
            />
          </button>
        ))}
      </div>
    );
  };
  const loadSavedData = () => {
    // Load cart
    const savedCart = localStorage.getItem(`cart_${tenantId}`);
    if (savedCart) {
      setCart(JSON.parse(savedCart));
    }
    
    // Load customer info
    const savedCustomer = localStorage.getItem(`customer_${tenantId}`);
    if (savedCustomer) {
      const data = JSON.parse(savedCustomer);
      setCustomerName(data.name || '');
      setCustomerPhone(data.phone || '');
      setDeliveryAddress(data.address || '');
      if (data.location) {
        setDeliveryLocation(data.location);
      }
    }
    
    // لا نحمّل الفرع المحفوظ تلقائياً - نترك المستخدم يختار دائماً
    // إلا إذا كان في منتصف طلب (cart غير فارغ)
    const savedBranch = localStorage.getItem(`branch_${tenantId}`);
    if (savedBranch && savedCart && JSON.parse(savedCart).length > 0) {
      setSelectedBranch(savedBranch);
      setStep('menu');
    }
  };
  // Save cart
  useEffect(() => {
    localStorage.setItem(`cart_${tenantId}`, JSON.stringify(cart));
  }, [cart, tenantId]);
  const fetchMenu = async () => {
    try {
      console.log('Fetching menu for tenant:', tenantId);
      console.log('API URL:', `${API}/customer/menu/${tenantId}`);
      
      const res = await axios.get(`${API}/customer/menu/${tenantId}`);
      console.log('Menu response:', res.data);
      
      setRestaurant(res.data.restaurant);
      setCategories(res.data.categories || []);
      setProducts(res.data.products || []);
      
      // فلترة الفروع - إخفاء "الفرع الرئيسي" إذا وُجدت فروع أخرى
      let fetchedBranches = res.data.branches || [];
      if (fetchedBranches.length > 1) {
        // إذا كان هناك أكثر من فرع، أخفِ الفرع الرئيسي
        const filteredBranches = fetchedBranches.filter(b => 
          b.name !== 'الفرع الرئيسي' && b.name !== 'Main Branch'
        );
        // استخدم الفلترة فقط إذا بقي فرع واحد على الأقل
        if (filteredBranches.length > 0) {
          fetchedBranches = filteredBranches;
        }
      }
      setBranches(fetchedBranches);
      
      if (res.data.restaurant?.name) {
        document.title = res.data.restaurant.name + ' - القائمة';
      }
      
      // If only one branch or no branches, skip branch selection
      // لكن فقط إذا كان الفرع الوحيد ليس "الفرع الرئيسي"
      if (fetchedBranches.length === 1 && 
          fetchedBranches[0].name !== 'الفرع الرئيسي' && 
          fetchedBranches[0].name !== 'Main Branch') {
        setSelectedBranch(fetchedBranches[0].id);
        localStorage.setItem(`branch_${tenantId}`, fetchedBranches[0].id);
        setStep('menu');
      } else if (fetchedBranches.length === 0) {
        // لا يوجد فروع - اذهب للقائمة مباشرة
        setStep('menu');
      }
      // إذا كان هناك أكثر من فرع، ابق في صفحة اختيار الفروع
      
      if (res.data.categories?.length > 0) {
        setSelectedCategory(res.data.categories[0].id);
      }
    } catch (error) {
      console.error('Error fetching menu:', error);
      console.error('Error details:', error.response?.data);
      
      // رسالة خطأ أوضح
      if (error.response?.status === 404) {
        toast.error(t('المطعم غير موجود'));
      } else if (error.code === 'ERR_NETWORK') {
        toast.error(t('خطأ في الاتصال بالخادم'));
      } else {
        toast.error(t('فشل في تحميل القائمة'));
      }
    } finally {
      setLoading(false);
    }
  };
  const selectBranch = (branchId) => {
    setSelectedBranch(branchId);
    localStorage.setItem(`branch_${tenantId}`, branchId);
    setStep('menu');
  };
  const filteredProducts = products.filter(p => {
    const matchesBranch = !selectedBranch || !p.branch_id || p.branch_id === selectedBranch;
    const matchesCategory = !selectedCategory || p.category_id === selectedCategory;
    const matchesSearch = !searchQuery || 
      p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.name_en?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesBranch && matchesCategory && matchesSearch;
  });
  const addToCart = (product) => {
    const existing = cart.find(item => item.product_id === product.id);
    if (existing) {
      setCart(cart.map(item => 
        item.product_id === product.id 
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setCart([...cart, {
        product_id: product.id,
        name: product.name,
        price: product.price,
        quantity: 1,
        image: product.image
      }]);
    }
    toast.success(t('تمت الإضافة للسلة'));
  };
  const updateQuantity = (productId, delta) => {
    setCart(cart.map(item => {
      if (item.product_id === productId) {
        const newQty = item.quantity + delta;
        return newQty > 0 ? { ...item, quantity: newQty } : null;
      }
      return item;
    }).filter(Boolean));
  };
  const removeFromCart = (productId) => {
    setCart(cart.filter(item => item.product_id !== productId));
  };
  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const deliveryFee = restaurant?.delivery_fee || 0;
  const grandTotal = cartTotal + deliveryFee;
  // Save customer info
  const saveCustomerInfo = () => {
    localStorage.setItem(`customer_${tenantId}`, JSON.stringify({
      name: customerName,
      phone: customerPhone,
      address: deliveryAddress,
      location: deliveryLocation
    }));
  };
  const handleSubmitOrder = async () => {
    if (!customerName || !customerPhone) {
      toast.error(t('يرجى إدخال الاسم ورقم الهاتف'));
      return;
    }
    if (!deliveryAddress && !deliveryLocation) {
      toast.error(t('يرجى إدخال عنوان التوصيل أو تحديده على الخريطة'));
      return;
    }
    if (cart.length === 0) {
      toast.error(t('السلة فارغة'));
      return;
    }
    setSubmitting(true);
    saveCustomerInfo();
    try {
      const orderData = {
        items: cart.map(item => ({
          product_id: item.product_id,
          quantity: item.quantity,
          notes: item.notes
        })),
        delivery_address: deliveryAddress,
        delivery_notes: deliveryNotes,
        delivery_location: deliveryLocation ? {
          lat: deliveryLocation[0],
          lng: deliveryLocation[1]
        } : null,
        payment_method: paymentMethod,
        customer_name: customerName,
        customer_phone: customerPhone,
        branch_id: selectedBranch
      };
      const res = await axios.post(`${API}/customer/order/${tenantId}`, orderData);
      if (res.data.success) {
        // If card payment, redirect to Stripe
        if (paymentMethod === 'card') {
          setProcessingPayment(true);
          try {
            const paymentRes = await axios.post(
              `${API}/payments/create-checkout/${tenantId}`,
              null,
              {
                params: {
                  order_id: res.data.order.id,
                  amount: grandTotal / 1000, // Convert IQD to USD approximate
                  customer_phone: customerPhone,
                  save_card: saveCard
                }
              }
            );
            
            if (paymentRes.data.checkout_url) {
              window.location.href = paymentRes.data.checkout_url;
              return;
            }
          } catch (payError) {
            toast.error(t('فشل في إنشاء جلسة الدفع'));
            setProcessingPayment(false);
            return;
          }
        }
        // Cash payment - show tracking
        toast.success(res.data.message);
        setCurrentOrder(res.data.order);
        setCart([]);
        setStep('tracking');
        localStorage.removeItem(`cart_${tenantId}`);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في إرسال الطلب'));
    } finally {
      setSubmitting(false);
    }
  };
  const formatPrice = (price) => {
    return new Intl.NumberFormat('en-US').format(price) + ' د.ع';
  };
  const getSelectedBranchName = () => {
    const branch = branches.find(b => b.id === selectedBranch);
    return branch?.name || '';
  };
  // دالة لعرض الـ Dialogs العامة في كل الخطوات
  const renderGlobalDialogs = () => (
    <>
      {/* Favorites List Dialog */}
      <Dialog open={showFavoritesDialog} onOpenChange={setShowFavoritesDialog}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Heart className="h-5 w-5 text-pink-500" />
              طلباتي المفضلة
            </DialogTitle>
          </DialogHeader>
          
          {favorites.length === 0 ? (
            <div className="text-center py-8">
              <Heart className="h-12 w-12 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">{t('لا توجد طلبات مفضلة')}</p>
              <p className="text-sm text-gray-400 mt-1">{t('أضف طلبك للمفضلة من صفحة السلة')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {favorites.map((favorite) => (
                <Card key={favorite.id} className="overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-bold text-lg">{favorite.name}</h3>
                        <p className="text-sm text-gray-500 flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(favorite.created_at).toLocaleDateString('en-GB')}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeFromFavorites(favorite.id)}
                        className="text-red-500 hover:text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    <div className="space-y-2 mb-3">
                      {favorite.items?.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-sm">
                          <span>{item.product_name} × {item.quantity}</span>
                          <span>{formatPrice(item.price * item.quantity)}</span>
                        </div>
                      ))}
                    </div>
                    
                    <div className="flex items-center justify-between pt-3 border-t">
                      <span className="font-bold text-orange-500">
                        {formatPrice(favorite.items?.reduce((sum, item) => sum + (item.price * item.quantity), 0) || 0)}
                      </span>
                      <Button
                        onClick={() => addFavoriteToCart(favorite)}
                        size="sm"
                        className="bg-pink-500 hover:bg-pink-600"
                      >
                        <ShoppingCart className="h-4 w-4 ml-2" />
                        {t('إضافة للسلة')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFavoritesDialog(false)}>
              {t('إغلاق')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Save Favorite Dialog */}
      <Dialog open={showSaveFavoriteDialog} onOpenChange={setShowSaveFavoriteDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bookmark className="h-5 w-5 text-pink-500" />
              {t('حفظ الطلب كمفضل')}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">{t('اسم الطلب المفضل')}</label>
              <Input
                placeholder={t('مثال: طلبي المعتاد')}
                value={favoriteName}
                onChange={(e) => setFavoriteName(e.target.value)}
                className="w-full"
              />
            </div>
            
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-sm font-medium mb-2">{t('محتويات الطلب')}:</p>
              <div className="space-y-1">
                {cart.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span>{item.name} × {item.quantity}</span>
                    <span>{formatPrice(item.price * item.quantity)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t pt-2 mt-2">
                <div className="flex justify-between font-bold">
                  <span>{t('الإجمالي')}</span>
                  <span className="text-orange-600">{formatPrice(cartTotal)}</span>
                </div>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveFavoriteDialog(false)}>
              {t('إلغاء')}
            </Button>
            <Button 
              onClick={saveToFavorites}
              disabled={savingFavorite}
              className="bg-pink-500 hover:bg-pink-600"
            >
              {savingFavorite ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin ml-2" />
                  جاري الحفظ...
                </>
              ) : (
                <>
                  <Heart className="h-4 w-4 ml-2" />
                  حفظ
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Rating Dialog - نافذة التقييم */}
      <Dialog open={showRatingDialog} onOpenChange={setShowRatingDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-yellow-500" />
              قيّم طلبك
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* التقييم العام */}
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-3">{t('كيف كانت تجربتك العامة')}؟</p>
              <div className="flex justify-center">
                <StarRating value={rating} onChange={setRating} size="lg" />
              </div>
              <p className="text-lg font-bold text-yellow-600 mt-2">
                {rating === 5 ? t('ممتاز') + '! 🌟' : rating === 4 ? t('جيد جداً') + ' 👍' : rating === 3 ? t('جيد') + ' 😊' : rating === 2 ? t('مقبول') + ' 😐' : t('سيء') + ' 😞'}
              </p>
            </div>
            {/* تقييمات تفصيلية */}
            <div className="space-y-4 bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">🍽️ {t('جودة الطعام')}</span>
                <StarRating value={foodRating} onChange={setFoodRating} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">🚚 {t('سرعة التوصيل')}</span>
                <StarRating value={deliveryRating} onChange={setDeliveryRating} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">👨‍🍳 {t('جودة الخدمة')}</span>
                <StarRating value={serviceRating} onChange={setServiceRating} />
              </div>
            </div>
            {/* تعليق اختياري */}
            <div>
              <label className="text-sm font-medium mb-2 block flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                {t('تعليقك')} ({t('اختياري')})
              </label>
              <Textarea
                placeholder={t('شاركنا رأيك لنحسّن خدماتنا')}
                value={ratingComment}
                onChange={(e) => setRatingComment(e.target.value)}
                className="w-full resize-none"
                rows={3}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRatingDialog(false)}>
              {t('إلغاء')}
            </Button>
            <Button 
              onClick={submitRating}
              disabled={submittingRating}
              className="bg-yellow-500 hover:bg-yellow-600"
            >
              {submittingRating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin ml-2" />
                  {t('جاري الإرسال')}...
                </>
              ) : (
                <>
                  <Star className="h-4 w-4 ml-2" />
                  {t('إرسال التقييم')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-red-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">{t('جاري تحميل القائمة')}...</p>
        </div>
      </div>
    );
  }
  // ==================== BRANCH SELECTION VIEW ====================
  if (step === 'branches' && branches.length > 1) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-red-50" dir="rtl">
        {/* Header مع شعار المطعم */}
        <header className="bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg">
          <div className="max-w-lg mx-auto px-4 py-6">
            <div className="flex items-center gap-4">
              {/* شعار المطعم - يجلب من بيانات المطعم أو يعرض شعار افتراضي */}
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center shadow-lg border-2 border-white/30 overflow-hidden">
                {restaurant?.logo ? (
                  <img 
                    src={restaurant.logo.startsWith('/api') 
                      ? `${API}${restaurant.logo.replace('/api', '')}` 
                      : restaurant.logo.startsWith('http') 
                        ? restaurant.logo 
                        : `${API}/uploads/logos/${restaurant.logo}`} 
                    alt={restaurant?.name} 
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.parentElement.innerHTML = '<span class="text-black text-3xl font-bold">' + (restaurant?.name?.[0] || 'M') + '</span>';
                    }}
                  />
                ) : (
                  <span className="text-black text-3xl font-bold">{restaurant?.name?.[0] || 'M'}</span>
                )}
              </div>
              <div>
                <h1 className="text-2xl font-bold">{restaurant?.name || t('المطعم')}</h1>
                <p className="text-orange-100 text-sm">{t('اختر الفرع الأقرب إليك')}</p>
              </div>
            </div>
          </div>
        </header>
        {/* Install Banner */}
        {showInstallBanner && (
          <div className="bg-gradient-to-r from-blue-500 to-purple-500 text-white px-4 py-3">
            <div className="max-w-lg mx-auto flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Smartphone className="h-5 w-5" />
                <span className="text-sm">{t('ثبّت التطبيق للوصول السريع')}</span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={handleInstallClick}>
                  <Download className="h-4 w-4 ml-1" />
                  {t('تثبيت')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowInstallBanner(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
        {/* Branch List */}
        <main className="max-w-lg mx-auto px-4 py-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Store className="h-6 w-6 text-orange-500" />
            الفروع المتاحة
          </h2>
          
          <div className="space-y-3">
            {branches.map(branch => (
              <Card 
                key={branch.id} 
                className="cursor-pointer hover:shadow-lg transition-all hover:scale-[1.02] border-2 border-transparent hover:border-orange-300"
                onClick={() => selectBranch(branch.id)}
                data-testid={`branch-${branch.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-red-400 rounded-full flex items-center justify-center text-white">
                      <Store className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-lg text-gray-800">{branch.name}</h3>
                      {branch.address && (
                        <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                          <MapPin className="h-3 w-3" />
                          {branch.address}
                        </p>
                      )}
                      {branch.phone && (
                        <p className="text-sm text-gray-500 flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {branch.phone}
                        </p>
                      )}
                    </div>
                    <ArrowLeft className="h-5 w-5 text-orange-500" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </main>
      </div>
    );
  }
  // ==================== MENU VIEW ====================
  if (step === 'menu') {
    return (
      <div className="min-h-screen bg-gray-50 pb-24" dir="rtl">
        {/* Header مع شعار المطعم */}
        <header className="sticky top-0 z-40 bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg">
          <div className="max-w-lg mx-auto px-4 py-4">
            <div className="flex items-center gap-3">
              {/* شعار المطعم */}
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center shadow-md border border-white/30 overflow-hidden">
                {restaurant?.logo ? (
                  <img 
                    src={restaurant.logo.startsWith('/api') 
                      ? `${API}${restaurant.logo.replace('/api', '')}` 
                      : restaurant.logo.startsWith('http') 
                        ? restaurant.logo 
                        : `${API}/uploads/logos/${restaurant.logo}`} 
                    alt={restaurant?.name} 
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.parentElement.innerHTML = '<span class="text-black text-2xl font-bold">' + (restaurant?.name?.[0] || 'M') + '</span>';
                    }}
                  />
                ) : (
                  <span className="text-black text-2xl font-bold">{restaurant?.name?.[0] || 'M'}</span>
                )}
              </div>
              <div className="flex-1">
                <h1 className="text-xl font-bold">{restaurant?.name || t('المطعم')}</h1>
                {selectedBranch && branches.length > 1 && (
                  <button 
                    onClick={() => setStep('branches')}
                    className="text-sm text-orange-100 hover:text-white flex items-center gap-1"
                  >
                    <Store className="h-3 w-3" />
                    {getSelectedBranchName()}
                    <span className="underline">({t('تغيير')})</span>
                  </button>
                )}
              </div>
              {/* زر المفضلة */}
              <button
                onClick={() => setShowFavoritesDialog(true)}
                className="relative p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                title={t('طلباتي المفضلة')}
              >
                <Heart className="h-5 w-5" />
                {favorites.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-pink-400 text-white text-xs rounded-full flex items-center justify-center font-bold">
                    {favorites.length}
                  </span>
                )}
              </button>
              {/* زر سجل الطلبات */}
              {orderHistory.length > 0 && (
                <button
                  onClick={() => setStep('history')}
                  className="relative p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                  title={t('طلباتي السابقة')}
                >
                  <History className="h-5 w-5" />
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-yellow-400 text-black text-xs rounded-full flex items-center justify-center font-bold">
                    {orderHistory.length}
                  </span>
                </button>
              )}
              {/* زر تغيير اللغة */}
              <div className="flex items-center gap-1 bg-white/20 rounded-full p-1">
                <button
                  onClick={() => changeLanguage('ar')}
                  className={`px-2 py-1 text-xs rounded-full transition-all ${
                    lang === 'ar' ? 'bg-white text-orange-600 font-bold' : 'text-white/80 hover:text-white'
                  }`}
                >
                  عر
                </button>
                <button
                  onClick={() => changeLanguage('en')}
                  className={`px-2 py-1 text-xs rounded-full transition-all ${
                    lang === 'en' ? 'bg-white text-orange-600 font-bold' : 'text-white/80 hover:text-white'
                  }`}
                >
                  EN
                </button>
              </div>
            </div>
          </div>
        </header>
        {/* Install Banner */}
        {showInstallBanner && (
          <div className="bg-gradient-to-r from-blue-500 to-purple-500 text-white px-4 py-2">
            <div className="max-w-lg mx-auto flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                <span className="text-sm">{t('ثبّت التطبيق')}</span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={handleInstallClick}>{t('تثبيت')}</Button>
                <Button size="sm" variant="ghost" onClick={() => setShowInstallBanner(false)}><X className="h-4 w-4" /></Button>
              </div>
            </div>
          </div>
        )}
        {/* Search */}
        <div className="sticky top-[72px] z-30 bg-white border-b px-4 py-2 shadow-sm">
          <div className="max-w-lg mx-auto relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder={t('ابحث عن منتج')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-10 border-gray-200"
              data-testid="search-input"
            />
          </div>
        </div>
        {/* Categories */}
        <div className="sticky top-[128px] z-30 bg-white border-b shadow-sm">
          <div className="max-w-lg mx-auto px-4 py-3 overflow-x-auto">
            <div className="flex gap-2" style={{scrollBehavior: 'smooth'}}>
              <Button
                variant="default"
                size="sm"
                onClick={() => setSelectedCategory(null)}
                className={`whitespace-nowrap font-bold min-w-fit px-4 py-2 ${
                  !selectedCategory 
                    ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-md' 
                    : 'bg-gray-100 text-gray-700 hover:bg-orange-100 hover:text-orange-600 border border-gray-200'
                }`}
              >
                {t('الكل')}
              </Button>
              {categories.map(cat => (
                <Button
                  key={cat.id}
                  variant="default"
                  size="sm"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`whitespace-nowrap font-bold min-w-fit px-4 py-2 ${
                    selectedCategory === cat.id 
                      ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-md' 
                      : 'bg-gray-100 text-gray-700 hover:bg-orange-100 hover:text-orange-600 border border-gray-200'
                  }`}
                >
                  {cat.name}
                </Button>
              ))}
            </div>
          </div>
        </div>
        {/* Products */}
        <main className="max-w-lg mx-auto px-4 py-4">
          {filteredProducts.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>{t('لا توجد منتجات')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {filteredProducts.map(product => (
                <Card key={product.id} className="overflow-hidden hover:shadow-lg transition-shadow" data-testid={`product-${product.id}`}>
                  <div className="aspect-square relative bg-gray-100">
                    {product.image ? (
                      <img 
                        src={product.image.startsWith('/api') 
                          ? `${API}${product.image.replace('/api', '')}` 
                          : product.image.startsWith('http') 
                            ? product.image 
                            : `${API}/uploads/products/${product.image}`} 
                        alt={product.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.nextSibling.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div 
                      className={`w-full h-full items-center justify-center text-4xl bg-gradient-to-br from-orange-100 to-red-100 ${product.image ? 'hidden' : 'flex'}`}
                      style={{ display: product.image ? 'none' : 'flex' }}
                    >
                      🍽️
                    </div>
                    {!product.is_available && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <span className="text-white font-bold">{t('غير متوفر')}</span>
                      </div>
                    )}
                  </div>
                  <CardContent className="p-3">
                    <h3 className="font-medium text-sm line-clamp-2 mb-1 text-gray-800">{product.name}</h3>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-orange-600">{formatPrice(product.price)}</span>
                      <Button
                        size="icon"
                        className="h-8 w-8 bg-orange-500 hover:bg-orange-600"
                        onClick={() => addToCart(product)}
                        disabled={!product.is_available}
                        data-testid={`add-to-cart-${product.id}`}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </main>
        {/* Cart Button */}
        {cart.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t shadow-lg z-50">
            <div className="max-w-lg mx-auto">
              <Button 
                className="w-full h-14 text-lg gap-2 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600" 
                onClick={() => setStep('cart')}
                data-testid="view-cart-btn"
              >
                <ShoppingCart className="h-5 w-5" />
                {t('عرض السلة')} ({cartCount})
                <span className="mr-auto font-bold">{formatPrice(cartTotal)}</span>
              </Button>
            </div>
          </div>
        )}
        {/* Global Dialogs - تعرض في كل الخطوات */}
        {renderGlobalDialogs()}
      </div>
    );
  }
  // ==================== CART VIEW ====================
  if (step === 'cart') {
    return (
      <div className="min-h-screen bg-gray-50" dir="rtl">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-white border-b shadow-sm">
          <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setStep('menu')}>
              <ArrowRight className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-orange-500" />
              {t('سلة المشتريات')}
            </h1>
            <Badge className="bg-orange-500">{cartCount}</Badge>
          </div>
        </header>
        <main className="max-w-lg mx-auto px-4 py-4 pb-32">
          {cart.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <ShoppingCart className="h-16 w-16 mx-auto mb-4 text-gray-300" />
              <p className="text-lg">{t('السلة فارغة')}</p>
              <Button className="mt-4" onClick={() => setStep('menu')}>{t('تصفح القائمة')}</Button>
            </div>
          ) : (
            <div className="space-y-3">
              {cart.map(item => (
                <Card key={item.product_id}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <p className="font-medium text-gray-800">{item.name}</p>
                        <p className="text-sm text-orange-600 font-bold">{formatPrice(item.price)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="outline" 
                          size="icon" 
                          className="h-8 w-8"
                          onClick={() => updateQuantity(item.product_id, -1)}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="w-8 text-center font-bold">{item.quantity}</span>
                        <Button 
                          variant="outline" 
                          size="icon" 
                          className="h-8 w-8"
                          onClick={() => updateQuantity(item.product_id, 1)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => removeFromCart(item.product_id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </main>
        {/* Bottom Actions */}
        {cart.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-4">
            <div className="max-w-lg mx-auto space-y-3">
              <div className="flex justify-between text-sm">
                <span>{t('المجموع الفرعي')}</span>
                <span>{formatPrice(cartTotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>{t('رسوم التوصيل')}</span>
                <span>{formatPrice(deliveryFee)}</span>
              </div>
              <div className="flex justify-between font-bold text-lg pt-2 border-t">
                <span>{t('الإجمالي')}</span>
                <span className="text-orange-600">{formatPrice(grandTotal)}</span>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline"
                  className="flex-1 h-12 border-pink-300 text-pink-600 hover:bg-pink-50"
                  onClick={() => setShowSaveFavoriteDialog(true)}
                >
                  <Heart className="h-5 w-5 ml-2" />
                  {t('حفظ كمفضل')}
                </Button>
                <Button 
                  className="flex-1 h-12 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
                  onClick={() => setStep('checkout')}
                  data-testid="proceed-checkout-btn"
                >
                  {t('متابعة الطلب')}
                  <ArrowLeft className="h-5 w-5 mr-2" />
                </Button>
              </div>
            </div>
          </div>
        )}
        {/* Global Dialogs - تعرض في كل الخطوات */}
        {renderGlobalDialogs()}
      </div>
    );
  }
  // ==================== CHECKOUT VIEW ====================
  if (step === 'checkout') {
    return (
      <div className="min-h-screen bg-gray-50" dir="rtl">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-white border-b shadow-sm">
          <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setStep('cart')}>
              <ArrowRight className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-bold">{t('إتمام الطلب')}</h1>
          </div>
        </header>
        <main className="max-w-lg mx-auto px-4 py-4 pb-32">
          <div className="space-y-4">
            {/* Customer Info */}
            <Card>
              <CardContent className="p-4 space-y-4">
                <h2 className="font-bold flex items-center gap-2">
                  <User className="h-5 w-5 text-orange-500" />
                  {t('معلومات العميل')}
                </h2>
                
                <div>
                  <label className="text-sm font-medium mb-1 block">{t('الاسم الكامل')} *</label>
                  <Input
                    placeholder={t('أدخل اسمك')}
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    data-testid="customer-name-input"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">{t('رقم الهاتف')} *</label>
                  <Input
                    placeholder="07xxxxxxxxx"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    type="tel"
                    data-testid="customer-phone-input"
                  />
                </div>
              </CardContent>
            </Card>
            {/* Delivery Address */}
            <Card>
              <CardContent className="p-4 space-y-4">
                <h2 className="font-bold flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-orange-500" />
                  {t('عنوان التوصيل')}
                </h2>
                
                <div className="relative">
                  <label className="text-sm font-medium mb-1 block">{t('العنوان التفصيلي')} *</label>
                  <div className="relative">
                    <Textarea
                      placeholder={t('ابحث عن عنوانك أو اكتبه يدوياً')}
                      value={deliveryAddress}
                      onChange={(e) => {
                        setDeliveryAddress(e.target.value);
                        searchAddress(e.target.value);
                      }}
                      onFocus={() => deliveryAddress.length >= 3 && setShowAddressSuggestions(true)}
                      rows={2}
                      data-testid="delivery-address-input"
                      className="pr-10"
                    />
                    {searchingAddress && (
                      <Loader2 className="absolute left-3 top-3 h-4 w-4 animate-spin text-gray-400" />
                    )}
                  </div>
                  
                  {/* اقتراحات العناوين */}
                  {showAddressSuggestions && addressSuggestions.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white rounded-lg shadow-lg border max-h-48 overflow-y-auto">
                      {addressSuggestions.map((suggestion, idx) => (
                        <button
                          key={idx}
                          onClick={() => selectAddress(suggestion)}
                          className="w-full p-3 text-right hover:bg-orange-50 border-b last:border-b-0 text-sm flex items-start gap-2"
                        >
                          <MapPin className="h-4 w-4 text-orange-500 mt-0.5 flex-shrink-0" />
                          <span className="line-clamp-2">{suggestion.address}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* زر تحديد الموقع الحالي */}
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    variant="default"
                    className="bg-green-500 hover:bg-green-600"
                    onClick={async () => {
                      if (navigator.geolocation) {
                        toast.info(t('جاري تحديد موقعك...'));
                        navigator.geolocation.getCurrentPosition(
                          async (pos) => {
                            setDeliveryLocation([pos.coords.latitude, pos.coords.longitude]);
                            const savedCustomer = localStorage.getItem(`customer_${tenantId}`);
                            const customerData = savedCustomer ? JSON.parse(savedCustomer) : {};
                            customerData.location = [pos.coords.latitude, pos.coords.longitude];
                            localStorage.setItem(`customer_${tenantId}`, JSON.stringify(customerData));
                            
                            // تحويل الإحداثيات لعنوان
                            await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
                            toast.success(t('تم تحديد موقعك بنجاح!'));
                          },
                          (error) => {
                            if (error.code === error.PERMISSION_DENIED) {
                              toast.error(t('يرجى السماح بالوصول للموقع من إعدادات المتصفح'));
                            } else {
                              toast.error(t('فشل في تحديد الموقع، حاول مرة أخرى'));
                            }
                          },
                          { enableHighAccuracy: true, timeout: 15000 }
                        );
                      } else {
                        toast.error(t('المتصفح لا يدعم تحديد الموقع'));
                      }
                    }}
                    data-testid="get-location-btn"
                  >
                    <Navigation className="h-4 w-4 ml-2" />
                    📍 {t('موقعي الحالي')}
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => setShowMap(true)}
                  >
                    <MapPin className="h-4 w-4 ml-2" />
                    {t('اختر من الخريطة')}
                  </Button>
                </div>
                {/* عرض حالة الموقع */}
                {deliveryLocation && (
                  <div className="flex items-center gap-2 p-2 bg-green-50 rounded-lg border border-green-200">
                    <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                      <MapPin className="h-4 w-4 text-white" />
                    </div>
                    <span className="text-sm text-green-700 font-medium">✓ {t('تم تحديد موقعك على الخريطة')}</span>
                  </div>
                )}
                <div>
                  <label className="text-sm font-medium mb-1 block">{t('ملاحظات للسائق')} ({t('اختياري')})</label>
                  <Input
                    placeholder={t('ملاحظات إضافية')}
                    value={deliveryNotes}
                    onChange={(e) => setDeliveryNotes(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
            {/* Payment Method */}
            <Card>
              <CardContent className="p-4 space-y-4">
                <h2 className="font-bold flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-orange-500" />
                  {t('طريقة الدفع')}
                </h2>
                
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant={paymentMethod === 'cash' ? 'default' : 'outline'}
                    onClick={() => setPaymentMethod('cash')}
                    className={`h-20 flex-col gap-1 ${paymentMethod === 'cash' ? 'bg-orange-500 hover:bg-orange-600 border-2 border-orange-600' : 'border-2'}`}
                    data-testid="payment-cash-btn"
                  >
                    <Banknote className="h-6 w-6" />
                    <span className="text-xs font-bold">{t('نقداً')}</span>
                  </Button>
                  <Button
                    variant={paymentMethod === 'card' ? 'default' : 'outline'}
                    onClick={() => setPaymentMethod('card')}
                    className={`h-20 flex-col gap-1 ${paymentMethod === 'card' ? 'bg-orange-500 hover:bg-orange-600 border-2 border-orange-600' : 'border-2'}`}
                    data-testid="payment-card-btn"
                  >
                    <CreditCard className="h-6 w-6" />
                    <span className="text-xs font-bold">{t('بطاقة')}</span>
                  </Button>
                  <Button
                    variant={paymentMethod === 'zain_cash' ? 'default' : 'outline'}
                    onClick={() => setPaymentMethod('zain_cash')}
                    className={`h-20 flex-col gap-1 ${paymentMethod === 'zain_cash' ? 'bg-purple-500 hover:bg-purple-600 border-2 border-purple-600' : 'border-2'}`}
                    data-testid="payment-zaincash-btn"
                  >
                    <Smartphone className="h-6 w-6" />
                    <span className="text-xs font-bold">{t('زين كاش')}</span>
                  </Button>
                </div>
                {/* Card Payment Form */}
                {paymentMethod === 'card' && (
                  <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 space-y-4">
                    <div className="flex items-center gap-2 text-blue-700 mb-2">
                      <CreditCard className="h-5 w-5" />
                      <span className="font-bold">{t('بيانات البطاقة')}</span>
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">{t('رقم البطاقة')}</label>
                      <Input
                        placeholder="0000 0000 0000 0000"
                        className="bg-white text-lg tracking-wider"
                        maxLength={19}
                        data-testid="card-number-input"
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-1 block">{t('تاريخ الانتهاء')}</label>
                        <Input
                          placeholder="MM/YY"
                          className="bg-white"
                          maxLength={5}
                          data-testid="card-expiry-input"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-1 block">CVV</label>
                        <Input
                          placeholder="123"
                          type="password"
                          className="bg-white"
                          maxLength={4}
                          data-testid="card-cvv-input"
                        />
                      </div>
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">{t('اسم حامل البطاقة')}</label>
                      <Input
                        placeholder="JOHN DOE"
                        className="bg-white uppercase"
                        data-testid="card-name-input"
                      />
                    </div>
                    
                    <label className="flex items-center gap-2 cursor-pointer p-2 bg-white rounded-lg">
                      <input 
                        type="checkbox" 
                        checked={saveCard}
                        onChange={(e) => setSaveCard(e.target.checked)}
                        className="rounded border-blue-300"
                      />
                      <span className="text-sm text-blue-700">{t('حفظ البطاقة للطلبات القادمة')}</span>
                    </label>
                    
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      <span>{t('جميع البيانات مشفرة ومحمية بتقنية SSL')}</span>
                    </div>
                  </div>
                )}
                {/* Zain Cash Form */}
                {paymentMethod === 'zain_cash' && (
                  <div className="p-4 bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl border border-purple-200 space-y-4">
                    <div className="flex items-center gap-2 text-purple-700 mb-2">
                      <Smartphone className="h-5 w-5" />
                      <span className="font-bold">{t('الدفع عبر زين كاش')}</span>
                    </div>
                    
                    <div className="text-center p-4 bg-white rounded-lg">
                      <p className="text-sm text-gray-600 mb-3">{t('امسح الكود أو أرسل المبلغ لهذا الرقم')}:</p>
                      
                      {/* QR Code Placeholder */}
                      <div className="w-40 h-40 mx-auto bg-gray-100 rounded-lg flex items-center justify-center mb-3 border-2 border-dashed border-purple-300">
                        <div className="text-center">
                          <div className="grid grid-cols-5 gap-1 p-2">
                            {[...Array(25)].map((_, i) => (
                              <div key={i} className={`w-3 h-3 ${Math.random() > 0.5 ? 'bg-purple-800' : 'bg-white'}`}></div>
                            ))}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">QR Code</p>
                        </div>
                      </div>
                      
                      <div className="bg-purple-100 rounded-lg p-3">
                        <p className="text-xs text-purple-600">{t('رقم المحفظة')}:</p>
                        <p className="text-xl font-bold text-purple-800 tracking-wider">0770 000 0000</p>
                      </div>
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">{t('رقم هاتفك')} ({t('زين كاش')})</label>
                      <Input
                        placeholder="07xx xxx xxxx"
                        className="bg-white"
                        type="tel"
                        data-testid="zaincash-phone-input"
                      />
                    </div>
                    
                    <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                      <p className="text-xs text-yellow-700">
                        ⚠️ {t('بعد إرسال المبلغ، أدخل رقم هاتفك واضغط تأكيد الطلب')}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            {/* Order Summary */}
            <Card>
              <CardContent className="p-4">
                <h2 className="font-bold mb-3">{t('ملخص الطلب')}</h2>
                <div className="space-y-2 text-sm">
                  {cart.map(item => (
                    <div key={item.product_id} className="flex justify-between">
                      <span>{item.name} × {item.quantity}</span>
                      <span>{formatPrice(item.price * item.quantity)}</span>
                    </div>
                  ))}
                  <div className="border-t pt-2 mt-2">
                    <div className="flex justify-between">
                      <span>{t('المجموع الفرعي')}</span>
                      <span>{formatPrice(cartTotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{t('التوصيل')}</span>
                      <span>{formatPrice(deliveryFee)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-lg mt-2 pt-2 border-t">
                      <span>{t('الإجمالي')}</span>
                      <span className="text-orange-600">{formatPrice(grandTotal)}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
        {/* Submit Button */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-4">
          <div className="max-w-lg mx-auto">
            <Button 
              className="w-full h-14 text-lg bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700"
              onClick={handleSubmitOrder}
              disabled={submitting || processingPayment}
              data-testid="submit-order-btn"
            >
              {submitting || processingPayment ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin ml-2" />
                  {processingPayment ? t('جاري التحويل للدفع') + '...' : t('جاري الإرسال') + '...'}
                </>
              ) : (
                <>
                  <CheckCircle className="h-5 w-5 ml-2" />
                  {paymentMethod === 'card' ? t('متابعة للدفع') : t('تأكيد الطلب')}
                </>
              )}
            </Button>
          </div>
        </div>
        {/* Map Dialog */}
        <Dialog open={showMap} onOpenChange={setShowMap}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-orange-500" />
                {t('تحديد موقع التوصيل')}
              </DialogTitle>
            </DialogHeader>
            <LocationPicker 
              position={deliveryLocation} 
              setPosition={setDeliveryLocation}
              onClose={() => setShowMap(false)}
              t={t}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowMap(false)}>{t('إلغاء')}</Button>
              <Button onClick={() => {
                if (deliveryLocation) {
                  toast.success(t('تم تحديد الموقع'));
                }
                setShowMap(false);
              }}>
                {t('تأكيد الموقع')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* Global Dialogs */}
        {renderGlobalDialogs()}
      </div>
    );
  }
  // ==================== ORDER HISTORY VIEW ====================
  if (step === 'history') {
    return (
      <div className="min-h-screen bg-gray-50" dir="rtl">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg">
          <div className="max-w-lg mx-auto px-4 py-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setStep('menu')}
                className="p-2 rounded-full bg-white/20 hover:bg-white/30"
              >
                <ArrowRight className="h-5 w-5" />
              </button>
              <div className="flex-1">
                <h1 className="text-xl font-bold">{t('طلباتي السابقة')}</h1>
                <p className="text-sm text-blue-100">{orderHistory.length} {t('طلب')}</p>
              </div>
              <History className="h-8 w-8 opacity-50" />
            </div>
          </div>
        </header>
        <main className="max-w-lg mx-auto px-4 py-4 space-y-3">
          {orderHistory.length === 0 ? (
            <div className="text-center py-12">
              <Package className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">{t('لا توجد طلبات سابقة')}</p>
              <Button onClick={() => setStep('menu')} className="mt-4">
                {t('اطلب الآن')}
              </Button>
            </div>
          ) : (
            orderHistory.map((order) => (
              <Card key={order.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-bold text-lg">{t('طلب')} #{order.order_number}</p>
                      <p className="text-sm text-gray-500 flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(order.created_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      order.status === 'delivered' || order.status === 'completed'
                        ? 'bg-green-100 text-green-700'
                        : order.status === 'cancelled'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {order.status_label}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between border-t pt-3">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Package className="h-4 w-4" />
                      <span>{order.items_count} {t('منتج')}</span>
                    </div>
                    <p className="font-bold text-lg text-orange-500">
                      {order.total?.toLocaleString('en-US')} IQD
                    </p>
                  </div>
                  
                  {/* إعادة الطلب */}
                  <div className="flex gap-2 mt-3">
                    <Button
                      onClick={() => {
                        // إعادة الطلب - إضافة نفس المنتجات للسلة
                        if (order.items && order.items.length > 0) {
                          const newCart = order.items.map(item => ({
                            id: item.product_id || item.id,
                            name: item.name,
                            price: item.price,
                            quantity: item.quantity,
                            image: item.image
                          }));
                          setCart(newCart);
                          setStep('cart');
                          toast.success(t('تمت إضافة المنتجات للسلة'));
                        }
                      }}
                      variant="outline"
                      className="flex-1"
                      size="sm"
                    >
                      <ShoppingCart className="h-4 w-4 ml-2" />
                      {t('إعادة الطلب')}
                    </Button>
                    
                    {/* زر التقييم - يظهر فقط للطلبات المكتملة */}
                    {(order.status === 'delivered' || order.status === 'completed') && (
                      <Button
                        onClick={() => openRatingDialog(order)}
                        variant="outline"
                        className="flex-1 border-yellow-500 text-yellow-600 hover:bg-yellow-50"
                        size="sm"
                      >
                        <Star className="h-4 w-4 ml-2" />
                        {t('قيّم الطلب')}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </main>
        
        {/* Global Dialogs */}
        {renderGlobalDialogs()}
      </div>
    );
  }
  // ==================== TRACKING VIEW ====================
  if (step === 'tracking' && currentOrder) {
    const statusSteps = [
      { status: 'pending', label: t('قيد الانتظار'), icon: Clock },
      { status: 'preparing', label: t('قيد التحضير'), icon: ChefHat },
      { status: 'ready', label: t('جاهز للتوصيل'), icon: CheckCircle },
      { status: 'out_for_delivery', label: t('السائق في الطريق'), icon: Truck },
      { status: 'delivered', label: t('تم التسليم'), icon: CheckCircle }
    ];
    
    const statusOrder = ['pending', 'preparing', 'ready', 'out_for_delivery', 'delivered'];
    const currentIdx = statusOrder.indexOf(currentOrder.status);
    // مكون عرض موقع السائق
    const DriverTrackingMap = () => {
      const [driverInfo, setDriverInfo] = React.useState(null);
      const [loadingDriver, setLoadingDriver] = React.useState(true);
      React.useEffect(() => {
        const fetchDriverInfo = async () => {
          try {
            // استخدام API الجديد بدون مصادقة
            const res = await axios.get(`${API}/driver/order-driver-info/${currentOrder.id}`);
            setDriverInfo(res.data);
          } catch (error) {
            console.log('Could not fetch driver info:', error);
          } finally {
            setLoadingDriver(false);
          }
        };
        // جلب معلومات السائق كل 10 ثواني
        fetchDriverInfo();
        const interval = setInterval(fetchDriverInfo, 10000);
        return () => clearInterval(interval);
      }, []);
      if (loadingDriver) {
        return (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-green-500" />
          </div>
        );
      }
      if (!driverInfo?.driver) {
        return (
          <div className="text-center py-6 text-gray-500">
            <Truck className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>لم يتم تخصيص سائق بعد</p>
            <p className="text-sm">سيتم تخصيص سائق قريباً</p>
          </div>
        );
      }
      const driver = driverInfo.driver;
      const hasLocation = driver.current_location?.latitude && driver.current_location?.longitude;
      return (
        <div className="space-y-4">
          {/* معلومات السائق */}
          <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-blue-50 to-green-50 rounded-xl border border-blue-100">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-green-500 flex items-center justify-center text-white text-xl font-bold shadow-lg">
              {driver.name?.[0] || '🚚'}
            </div>
            <div className="flex-1">
              <p className="font-bold text-lg">{driver.name}</p>
              <p className="text-sm text-gray-500">السائق المخصص لطلبك</p>
              {driver.last_location_update && (
                <p className="text-xs text-green-600">
                  آخر تحديث: {new Date(driver.last_location_update).toLocaleTimeString('en-US')}
                </p>
              )}
            </div>
            <a
              href={`tel:${driver.phone}`}
              className="w-12 h-12 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center text-white shadow-lg transition-transform hover:scale-110"
            >
              <Phone className="h-5 w-5" />
            </a>
          </div>
          {/* خريطة تتبع السائق */}
          {hasLocation && (
            <div className="rounded-xl overflow-hidden shadow-lg border border-gray-700">
              <div className="bg-gradient-to-r from-blue-600 to-green-500 text-white px-4 py-3 flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                <span className="font-bold">تتبع السائق</span>
                <span className="text-xs bg-white/20 px-2 py-1 rounded-full mr-auto flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                  مباشر
                </span>
              </div>
              <div className="h-72 relative">
                <MapContainer
                  center={[driver.current_location.latitude, driver.current_location.longitude]}
                  zoom={16}
                  style={{ height: '100%', width: '100%' }}
                  zoomControl={false}
                >
                  {/* خريطة واضحة مع أسماء الشوارع */}
                  <TileLayer 
                    url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                  />
                  
                  {/* موقع السائق */}
                  <Marker 
                    position={[driver.current_location.latitude, driver.current_location.longitude]}
                    icon={L.divIcon({
                      className: 'driver-marker',
                      html: `
                        <div style="
                          background: linear-gradient(135deg, #3b82f6, #06b6d4);
                          width: 48px;
                          height: 48px;
                          border-radius: 50%;
                          display: flex;
                          align-items: center;
                          justify-content: center;
                          font-size: 24px;
                          border: 4px solid white;
                          box-shadow: 0 0 20px rgba(59,130,246,0.6), 0 4px 15px rgba(0,0,0,0.4);
                          animation: pulse 2s infinite;
                        ">🛵</div>
                        <style>
                          @keyframes pulse {
                            0%, 100% { transform: scale(1); }
                            50% { transform: scale(1.05); }
                          }
                        </style>
                      `,
                      iconSize: [48, 48],
                      iconAnchor: [24, 24]
                    })}
                  >
                    <Popup>
                      <div className="text-center p-2">
                        <p className="font-bold text-lg">{driver.name}</p>
                        <p className="text-blue-600 font-medium">🛵 السائق</p>
                        <a href={`tel:${driver.phone}`} className="text-sm text-green-600 hover:underline">
                          📞 {driver.phone}
                        </a>
                      </div>
                    </Popup>
                  </Marker>
                  
                  {/* موقع التوصيل */}
                  {driverInfo.delivery_location && (
                    <Marker 
                      position={[driverInfo.delivery_location.latitude, driverInfo.delivery_location.longitude]}
                      icon={L.divIcon({
                        className: 'delivery-marker',
                        html: `
                          <div style="
                            background: linear-gradient(135deg, #ef4444, #f97316);
                            width: 44px;
                            height: 44px;
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-size: 22px;
                            border: 4px solid white;
                            box-shadow: 0 0 15px rgba(239,68,68,0.5), 0 4px 12px rgba(0,0,0,0.3);
                          ">📍</div>
                        `,
                        iconSize: [44, 44],
                        iconAnchor: [22, 22]
                      })}
                    >
                      <Popup>
                        <div className="text-center p-2">
                          <p className="font-bold text-lg">موقع التوصيل</p>
                          <p className="text-orange-600 font-medium">📍 عنوانك</p>
                        </div>
                      </Popup>
                    </Marker>
                  )}
                </MapContainer>
                
                {/* شريط معلومات السائق */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-4">
                  <div className="flex items-center justify-between text-white">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-xl">
                        🛵
                      </div>
                      <div>
                        <p className="font-bold">{driver.name}</p>
                        <p className="text-sm text-gray-300">في الطريق إليك</p>
                      </div>
                    </div>
                    <a 
                      href={`tel:${driver.phone}`}
                      className="bg-green-500 hover:bg-green-600 p-3 rounded-full transition-colors"
                    >
                      <Phone className="h-5 w-5" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}
          {!hasLocation && (
            <div className="text-center py-6 bg-yellow-50 rounded-xl border border-yellow-200">
              <Navigation className="h-10 w-10 mx-auto mb-2 text-yellow-500" />
              <p className="text-yellow-700 font-medium">موقع السائق غير متاح حالياً</p>
              <p className="text-sm text-yellow-600">سيتم تحديث الموقع عند تحركه</p>
            </div>
          )}
        </div>
      );
    };
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50" dir="rtl">
        {/* Header */}
        <header className="bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg">
          <div className="max-w-lg mx-auto px-4 py-6 text-center">
            <CheckCircle className="h-12 w-12 mx-auto mb-2" />
            <h1 className="text-2xl font-bold">تم استلام طلبك!</h1>
            <p className="text-green-100">رقم الطلب: #{currentOrder.order_number}</p>
          </div>
        </header>
        <main className="max-w-lg mx-auto px-4 py-6 space-y-4">
          {/* Driver Tracking - يظهر عندما يكون الطلب في مرحلة التوصيل */}
          {(currentOrder.status === 'out_for_delivery' || currentOrder.driver_id) && (
            <Card className="border-2 border-green-200">
              <CardContent className="p-4">
                <h2 className="font-bold mb-4 flex items-center gap-2">
                  <Truck className="h-5 w-5 text-green-500" />
                  تتبع السائق
                </h2>
                <DriverTrackingMap />
              </CardContent>
            </Card>
          )}
          {/* Status Timeline */}
          <Card>
            <CardContent className="p-4">
              <h2 className="font-bold mb-4">حالة الطلب</h2>
              <div className="space-y-4">
                {statusSteps.map((step, idx) => {
                  const stepIdx = statusOrder.indexOf(step.status);
                  const isCompleted = stepIdx <= currentIdx;
                  const isCurrent = step.status === currentOrder.status;
                  
                  return (
                    <div key={step.status} className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                        isCompleted 
                          ? 'bg-green-500 text-white' 
                          : 'bg-gray-100 text-gray-400'
                      } ${isCurrent ? 'ring-4 ring-green-200 scale-110' : ''}`}>
                        <step.icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <p className={`font-medium ${isCompleted ? 'text-gray-800' : 'text-gray-400'}`}>
                          {step.label}
                        </p>
                        {isCurrent && (
                          <p className="text-sm text-green-500 animate-pulse">الحالة الحالية</p>
                        )}
                      </div>
                      {idx < statusSteps.length - 1 && (
                        <div className={`absolute left-5 w-0.5 h-8 ${isCompleted ? 'bg-green-500' : 'bg-gray-200'}`} style={{marginTop: '40px'}} />
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
          {/* Order Details */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <h2 className="font-bold">تفاصيل الطلب</h2>
              <div className="text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-500">المجموع</span>
                  <span className="font-bold text-orange-600">{formatPrice(currentOrder.total)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">طريقة الدفع</span>
                  <span>{currentOrder.payment_method === 'cash' ? 'نقداً' : 'بطاقة'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">العنوان</span>
                  <span className="text-left max-w-[200px]">{currentOrder.delivery_address}</span>
                </div>
              </div>
            </CardContent>
          </Card>
          {/* Rate Order Button - يظهر عند التسليم */}
          {(currentOrder.status === 'delivered' || currentOrder.status === 'completed') && (
            <Button 
              className="w-full h-12 bg-gradient-to-r from-yellow-400 to-yellow-500 hover:from-yellow-500 hover:to-yellow-600 text-black"
              onClick={() => openRatingDialog(currentOrder)}
            >
              <Star className="h-5 w-5 ml-2" />
              قيّم طلبك
            </Button>
          )}
          {/* New Order Button */}
          <Button 
            className="w-full h-12 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
            onClick={() => {
              setCurrentOrder(null);
              setStep('menu');
            }}
          >
            طلب جديد
          </Button>
        </main>
      </div>
    );
  }
  // Default: redirect to menu
  return null;
}
