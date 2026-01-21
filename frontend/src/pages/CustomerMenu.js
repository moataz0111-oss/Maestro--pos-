import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
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
  Wallet
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

const API = process.env.REACT_APP_BACKEND_URL + '/api';

// ==================== LOCATION PICKER COMPONENT ====================
function LocationPicker({ position, setPosition, onClose }) {
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
          toast.error('فشل في تحديد الموقع');
          setLoading(false);
        },
        { enableHighAccuracy: true }
      );
    } else {
      toast.error('المتصفح لا يدعم تحديد الموقع');
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
          موقعي الحالي
        </Button>
      </div>
      <div className="h-[300px] rounded-lg overflow-hidden border">
        <MapContainer
          center={position || [33.3152, 44.3661]} // Baghdad default
          zoom={13}
          className="h-full w-full"
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; OpenStreetMap'
          />
          <MapClickHandler />
          {position && <Marker position={position} />}
        </MapContainer>
      </div>
      <p className="text-xs text-muted-foreground text-center">
        انقر على الخريطة لتحديد موقع التوصيل
      </p>
    </div>
  );
}

// ==================== MAIN COMPONENT ====================
export default function CustomerMenu() {
  const { tenantId } = useParams();
  const [searchParams] = useSearchParams();
  
  // App States
  const [step, setStep] = useState('branches'); // branches, menu, cart, checkout, tracking
  const [restaurant, setRestaurant] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentOrder, setCurrentOrder] = useState(null);
  
  // Customer Info
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [deliveryLocation, setDeliveryLocation] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showMap, setShowMap] = useState(false);
  
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
      toast.error('تم إلغاء عملية الدفع');
    }
  }, [searchParams]);

  const pollPaymentStatus = async (sessionId, attempts = 0) => {
    const maxAttempts = 10;
    if (attempts >= maxAttempts) {
      toast.error('انتهت مهلة التحقق من الدفع');
      return;
    }
    
    try {
      const res = await axios.get(`${API}/payments/status/${sessionId}`);
      if (res.data.payment_status === 'paid') {
        toast.success('تم الدفع بنجاح! ');
        // جلب تفاصيل الطلب
        if (res.data.order_id) {
          const orderRes = await axios.get(`${API}/customer/order/${tenantId}/${res.data.order_id}`);
          setCurrentOrder(orderRes.data.order);
          setStep('tracking');
          setCart([]);
          localStorage.removeItem(`cart_${tenantId}`);
        }
      } else if (res.data.status === 'expired') {
        toast.error('انتهت صلاحية جلسة الدفع');
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
    // تغيير manifest link لاستخدام manifest العملاء
    const manifestLink = document.querySelector('link[rel="manifest"]');
    if (manifestLink) {
      manifestLink.href = '/manifest-customer.json';
    }
    
    // تحديث عنوان الصفحة
    if (restaurant?.name) {
      document.title = restaurant.name + ' - اطلب الآن';
    }
    
    return () => {
      // إعادة manifest الأصلي عند الخروج
      if (manifestLink) {
        manifestLink.href = '/manifest.json';
      }
    };
  }, [restaurant]);

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
        toast.success('تم تثبيت التطبيق بنجاح!');
      }
      setDeferredPrompt(null);
      setShowInstallBanner(false);
    }
  };

  useEffect(() => {
    fetchMenu();
    loadSavedData();
  }, [tenantId]);

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
    
    // Load selected branch
    const savedBranch = localStorage.getItem(`branch_${tenantId}`);
    if (savedBranch) {
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
      const res = await axios.get(`${API}/customer/menu/${tenantId}`);
      setRestaurant(res.data.restaurant);
      setCategories(res.data.categories);
      setProducts(res.data.products);
      setBranches(res.data.branches || []);
      
      if (res.data.restaurant?.name) {
        document.title = res.data.restaurant.name + ' - القائمة';
      }
      
      // If only one branch, auto-select it
      if (res.data.branches?.length === 1) {
        setSelectedBranch(res.data.branches[0].id);
        localStorage.setItem(`branch_${tenantId}`, res.data.branches[0].id);
        setStep('menu');
      }
      
      if (res.data.categories?.length > 0) {
        setSelectedCategory(res.data.categories[0].id);
      }
    } catch (error) {
      toast.error('فشل في تحميل القائمة');
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
    toast.success('تمت الإضافة للسلة');
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
      toast.error('يرجى إدخال الاسم ورقم الهاتف');
      return;
    }

    if (!deliveryAddress && !deliveryLocation) {
      toast.error('يرجى إدخال عنوان التوصيل أو تحديده على الخريطة');
      return;
    }

    if (cart.length === 0) {
      toast.error('السلة فارغة');
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
            toast.error('فشل في إنشاء جلسة الدفع');
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
      toast.error(error.response?.data?.detail || 'فشل في إرسال الطلب');
    } finally {
      setSubmitting(false);
    }
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat('ar-IQ').format(price) + ' د.ع';
  };

  const getSelectedBranchName = () => {
    const branch = branches.find(b => b.id === selectedBranch);
    return branch?.name || '';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-red-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">جاري تحميل القائمة...</p>
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
                  <img src={restaurant.logo} alt={restaurant?.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-black text-3xl font-bold">M</span>
                )}
              </div>
              <div>
                <h1 className="text-2xl font-bold">{restaurant?.name || 'المطعم'}</h1>
                <p className="text-orange-100 text-sm">اختر الفرع الأقرب إليك</p>
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
                <span className="text-sm">ثبّت التطبيق للوصول السريع</span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={handleInstallClick}>
                  <Download className="h-4 w-4 ml-1" />
                  تثبيت
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
        {/* Header */}
        <header className="sticky top-0 z-40 bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg">
          <div className="max-w-lg mx-auto px-4 py-4">
            <div className="flex items-center gap-3">
              {restaurant?.logo ? (
                <img src={restaurant.logo} alt="" className="w-12 h-12 rounded-full object-cover bg-white" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-black flex items-center justify-center">
                  <span className="text-orange-500 text-2xl font-bold">M</span>
                </div>
              )}
              <div className="flex-1">
                <h1 className="text-xl font-bold">{restaurant?.name || 'المطعم'}</h1>
                {selectedBranch && branches.length > 1 && (
                  <button 
                    onClick={() => setStep('branches')}
                    className="text-sm text-orange-100 hover:text-white flex items-center gap-1"
                  >
                    <Store className="h-3 w-3" />
                    {getSelectedBranchName()}
                    <span className="underline">(تغيير)</span>
                  </button>
                )}
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
                <span className="text-sm">ثبّت التطبيق</span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={handleInstallClick}>تثبيت</Button>
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
              placeholder="ابحث عن منتج..."
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
                الكل
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
              <p>لا توجد منتجات</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {filteredProducts.map(product => (
                <Card key={product.id} className="overflow-hidden hover:shadow-lg transition-shadow" data-testid={`product-${product.id}`}>
                  <div className="aspect-square relative bg-gray-100">
                    {product.image ? (
                      <img 
                        src={product.image} 
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-4xl bg-gradient-to-br from-orange-100 to-red-100">
                        🍽️
                      </div>
                    )}
                    {!product.is_available && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <span className="text-white font-bold">غير متوفر</span>
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
                عرض السلة ({cartCount})
                <span className="mr-auto font-bold">{formatPrice(cartTotal)}</span>
              </Button>
            </div>
          </div>
        )}
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
              سلة المشتريات
            </h1>
            <Badge className="bg-orange-500">{cartCount}</Badge>
          </div>
        </header>

        <main className="max-w-lg mx-auto px-4 py-4 pb-32">
          {cart.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <ShoppingCart className="h-16 w-16 mx-auto mb-4 text-gray-300" />
              <p className="text-lg">السلة فارغة</p>
              <Button className="mt-4" onClick={() => setStep('menu')}>تصفح القائمة</Button>
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
                <span>المجموع الفرعي</span>
                <span>{formatPrice(cartTotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>رسوم التوصيل</span>
                <span>{formatPrice(deliveryFee)}</span>
              </div>
              <div className="flex justify-between font-bold text-lg pt-2 border-t">
                <span>الإجمالي</span>
                <span className="text-orange-600">{formatPrice(grandTotal)}</span>
              </div>
              <Button 
                className="w-full h-12 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
                onClick={() => setStep('checkout')}
                data-testid="proceed-checkout-btn"
              >
                متابعة الطلب
                <ArrowLeft className="h-5 w-5 mr-2" />
              </Button>
            </div>
          </div>
        )}
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
            <h1 className="text-xl font-bold">إتمام الطلب</h1>
          </div>
        </header>

        <main className="max-w-lg mx-auto px-4 py-4 pb-32">
          <div className="space-y-4">
            {/* Customer Info */}
            <Card>
              <CardContent className="p-4 space-y-4">
                <h2 className="font-bold flex items-center gap-2">
                  <User className="h-5 w-5 text-orange-500" />
                  معلومات العميل
                </h2>
                
                <div>
                  <label className="text-sm font-medium mb-1 block">الاسم الكامل *</label>
                  <Input
                    placeholder="أدخل اسمك"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    data-testid="customer-name-input"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-1 block">رقم الهاتف *</label>
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
                  عنوان التوصيل
                </h2>
                
                <div>
                  <label className="text-sm font-medium mb-1 block">العنوان التفصيلي *</label>
                  <Textarea
                    placeholder="المنطقة، الشارع، أقرب نقطة دالة..."
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    rows={2}
                    data-testid="delivery-address-input"
                  />
                </div>

                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => setShowMap(true)}
                >
                  <Navigation className="h-4 w-4 ml-2" />
                  {deliveryLocation ? 'تم تحديد الموقع ✓' : 'تحديد الموقع على الخريطة'}
                </Button>

                <div>
                  <label className="text-sm font-medium mb-1 block">ملاحظات للسائق (اختياري)</label>
                  <Input
                    placeholder="ملاحظات إضافية..."
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
                  طريقة الدفع
                </h2>
                
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant={paymentMethod === 'cash' ? 'default' : 'outline'}
                    onClick={() => setPaymentMethod('cash')}
                    className={`h-20 flex-col gap-1 ${paymentMethod === 'cash' ? 'bg-orange-500 hover:bg-orange-600 border-2 border-orange-600' : 'border-2'}`}
                    data-testid="payment-cash-btn"
                  >
                    <Banknote className="h-6 w-6" />
                    <span className="text-xs font-bold">نقداً</span>
                  </Button>
                  <Button
                    variant={paymentMethod === 'card' ? 'default' : 'outline'}
                    onClick={() => setPaymentMethod('card')}
                    className={`h-20 flex-col gap-1 ${paymentMethod === 'card' ? 'bg-orange-500 hover:bg-orange-600 border-2 border-orange-600' : 'border-2'}`}
                    data-testid="payment-card-btn"
                  >
                    <CreditCard className="h-6 w-6" />
                    <span className="text-xs font-bold">بطاقة</span>
                  </Button>
                  <Button
                    variant={paymentMethod === 'zain_cash' ? 'default' : 'outline'}
                    onClick={() => setPaymentMethod('zain_cash')}
                    className={`h-20 flex-col gap-1 ${paymentMethod === 'zain_cash' ? 'bg-purple-500 hover:bg-purple-600 border-2 border-purple-600' : 'border-2'}`}
                    data-testid="payment-zaincash-btn"
                  >
                    <Smartphone className="h-6 w-6" />
                    <span className="text-xs font-bold">زين كاش</span>
                  </Button>
                </div>

                {/* Card Payment Form */}
                {paymentMethod === 'card' && (
                  <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 space-y-4">
                    <div className="flex items-center gap-2 text-blue-700 mb-2">
                      <CreditCard className="h-5 w-5" />
                      <span className="font-bold">بيانات البطاقة</span>
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">رقم البطاقة</label>
                      <Input
                        placeholder="0000 0000 0000 0000"
                        className="bg-white text-lg tracking-wider"
                        maxLength={19}
                        data-testid="card-number-input"
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-1 block">تاريخ الانتهاء</label>
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
                      <label className="text-sm font-medium text-gray-700 mb-1 block">اسم حامل البطاقة</label>
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
                      <span className="text-sm text-blue-700">حفظ البطاقة للطلبات القادمة</span>
                    </label>
                    
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      <span>جميع البيانات مشفرة ومحمية بتقنية SSL</span>
                    </div>
                  </div>
                )}

                {/* Zain Cash Form */}
                {paymentMethod === 'zain_cash' && (
                  <div className="p-4 bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl border border-purple-200 space-y-4">
                    <div className="flex items-center gap-2 text-purple-700 mb-2">
                      <Smartphone className="h-5 w-5" />
                      <span className="font-bold">الدفع عبر زين كاش</span>
                    </div>
                    
                    <div className="text-center p-4 bg-white rounded-lg">
                      <p className="text-sm text-gray-600 mb-3">امسح الكود أو أرسل المبلغ لهذا الرقم:</p>
                      
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
                        <p className="text-xs text-purple-600">رقم المحفظة:</p>
                        <p className="text-xl font-bold text-purple-800 tracking-wider">0770 000 0000</p>
                      </div>
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">رقم هاتفك (زين كاش)</label>
                      <Input
                        placeholder="07xx xxx xxxx"
                        className="bg-white"
                        type="tel"
                        data-testid="zaincash-phone-input"
                      />
                    </div>
                    
                    <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                      <p className="text-xs text-yellow-700">
                        ⚠️ بعد إرسال المبلغ، أدخل رقم هاتفك واضغط "تأكيد الطلب"
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Order Summary */}
            <Card>
              <CardContent className="p-4">
                <h2 className="font-bold mb-3">ملخص الطلب</h2>
                <div className="space-y-2 text-sm">
                  {cart.map(item => (
                    <div key={item.product_id} className="flex justify-between">
                      <span>{item.name} × {item.quantity}</span>
                      <span>{formatPrice(item.price * item.quantity)}</span>
                    </div>
                  ))}
                  <div className="border-t pt-2 mt-2">
                    <div className="flex justify-between">
                      <span>المجموع الفرعي</span>
                      <span>{formatPrice(cartTotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>التوصيل</span>
                      <span>{formatPrice(deliveryFee)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-lg mt-2 pt-2 border-t">
                      <span>الإجمالي</span>
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
                  {processingPayment ? 'جاري التحويل للدفع...' : 'جاري الإرسال...'}
                </>
              ) : (
                <>
                  <CheckCircle className="h-5 w-5 ml-2" />
                  {paymentMethod === 'card' ? 'متابعة للدفع' : 'تأكيد الطلب'}
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
                تحديد موقع التوصيل
              </DialogTitle>
            </DialogHeader>
            <LocationPicker 
              position={deliveryLocation} 
              setPosition={setDeliveryLocation}
              onClose={() => setShowMap(false)}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowMap(false)}>إلغاء</Button>
              <Button onClick={() => {
                if (deliveryLocation) {
                  toast.success('تم تحديد الموقع');
                }
                setShowMap(false);
              }}>
                تأكيد الموقع
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ==================== TRACKING VIEW ====================
  if (step === 'tracking' && currentOrder) {
    const statusSteps = [
      { status: 'pending', label: 'قيد الانتظار', icon: Clock },
      { status: 'preparing', label: 'قيد التحضير', icon: ChefHat },
      { status: 'ready', label: 'جاهز للتوصيل', icon: CheckCircle },
      { status: 'out_for_delivery', label: 'السائق في الطريق', icon: Truck },
      { status: 'delivered', label: 'تم التسليم', icon: CheckCircle }
    ];
    
    const statusOrder = ['pending', 'preparing', 'ready', 'out_for_delivery', 'delivered'];
    const currentIdx = statusOrder.indexOf(currentOrder.status);

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
