import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
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
  X,
  ArrowRight,
  Search,
  Download,
  Smartphone,
  Share2
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

export default function CustomerMenu() {
  const { tenantId } = useParams();
  const [restaurant, setRestaurant] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCart, setShowCart] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showTracking, setShowTracking] = useState(false);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  
  // بيانات العميل
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchMenu();
    // تحميل السلة من localStorage
    const savedCart = localStorage.getItem(`cart_${tenantId}`);
    if (savedCart) {
      setCart(JSON.parse(savedCart));
    }
  }, [tenantId]);

  // حفظ السلة في localStorage
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
      
      if (res.data.branches?.length > 0) {
        setSelectedBranch(res.data.branches[0].id);
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

  const filteredProducts = products.filter(p => {
    const matchesCategory = !selectedCategory || p.category_id === selectedCategory;
    const matchesSearch = !searchQuery || 
      p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.name_en?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
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

  const handleSubmitOrder = async () => {
    if (!customerName || !customerPhone || !deliveryAddress) {
      toast.error('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    if (cart.length === 0) {
      toast.error('السلة فارغة');
      return;
    }

    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/customer/order/${tenantId}`, {
        items: cart.map(item => ({
          product_id: item.product_id,
          quantity: item.quantity,
          notes: item.notes
        })),
        delivery_address: deliveryAddress,
        delivery_notes: deliveryNotes,
        payment_method: paymentMethod,
        customer_name: customerName,
        customer_phone: customerPhone,
        branch_id: selectedBranch
      });

      if (res.data.success) {
        toast.success(res.data.message);
        setCurrentOrder(res.data.order);
        setCart([]);
        setShowCheckout(false);
        setShowTracking(true);
        localStorage.removeItem(`cart_${tenantId}`);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إرسال الطلب');
    } finally {
      setSubmitting(false);
    }
  };

  const trackOrder = async (orderId) => {
    try {
      const res = await axios.get(`${API}/customer/order/${tenantId}/${orderId}`);
      setCurrentOrder(res.data.order);
      setShowTracking(true);
    } catch (error) {
      toast.error('فشل في جلب حالة الطلب');
    }
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat('ar-IQ').format(price) + ' د.ع';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">جاري تحميل القائمة...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-primary text-primary-foreground shadow-lg">
        <div className="max-w-lg mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            {restaurant?.logo && (
              <img src={restaurant.logo} alt="" className="w-12 h-12 rounded-full object-cover bg-white" />
            )}
            <div className="flex-1">
              <h1 className="text-xl font-bold">{restaurant?.name || 'المطعم'}</h1>
              {restaurant?.phone && (
                <p className="text-sm opacity-80 flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {restaurant.phone}
                </p>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Search */}
      <div className="sticky top-[72px] z-30 bg-background border-b px-4 py-2">
        <div className="max-w-lg mx-auto relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="ابحث عن منتج..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-10"
          />
        </div>
      </div>

      {/* Categories */}
      <div className="sticky top-[128px] z-30 bg-background border-b">
        <div className="max-w-lg mx-auto px-4 py-2 overflow-x-auto">
          <div className="flex gap-2">
            <Button
              variant={!selectedCategory ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory(null)}
              className="whitespace-nowrap"
            >
              الكل
            </Button>
            {categories.map(cat => (
              <Button
                key={cat.id}
                variant={selectedCategory === cat.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedCategory(cat.id)}
                className="whitespace-nowrap"
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
          <div className="text-center py-12 text-muted-foreground">
            <p>لا توجد منتجات</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filteredProducts.map(product => (
              <Card key={product.id} className="overflow-hidden">
                <div className="aspect-square relative bg-muted">
                  {product.image ? (
                    <img 
                      src={product.image} 
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl">
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
                  <h3 className="font-medium text-sm line-clamp-2 mb-1">{product.name}</h3>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-primary">{formatPrice(product.price)}</span>
                    <Button
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => addToCart(product)}
                      disabled={!product.is_available}
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
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t z-50">
          <div className="max-w-lg mx-auto">
            <Button 
              className="w-full h-14 text-lg gap-2" 
              onClick={() => setShowCart(true)}
            >
              <ShoppingCart className="h-5 w-5" />
              عرض السلة ({cartCount})
              <span className="mr-auto font-bold">{formatPrice(cartTotal)}</span>
            </Button>
          </div>
        </div>
      )}

      {/* Cart Dialog */}
      <Dialog open={showCart} onOpenChange={setShowCart}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              سلة المشتريات
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-4">
            {cart.map(item => (
              <div key={item.product_id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                <div className="flex-1">
                  <p className="font-medium">{item.name}</p>
                  <p className="text-sm text-primary font-bold">{formatPrice(item.price)}</p>
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
                    className="h-8 w-8 text-red-500"
                    onClick={() => removeFromCart(item.product_id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t pt-4 space-y-2">
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
              <span className="text-primary">{formatPrice(grandTotal)}</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCart(false)}>
              متابعة التسوق
            </Button>
            <Button onClick={() => { setShowCart(false); setShowCheckout(true); }}>
              إتمام الطلب
              <ArrowRight className="h-4 w-4 mr-2" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Checkout Dialog */}
      <Dialog open={showCheckout} onOpenChange={setShowCheckout}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>إتمام الطلب</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-1 block">الاسم *</label>
              <Input
                placeholder="اسمك الكامل"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">رقم الهاتف *</label>
              <Input
                placeholder="07xxxxxxxxx"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                type="tel"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">عنوان التوصيل *</label>
              <Textarea
                placeholder="المنطقة، الشارع، أقرب نقطة دالة..."
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                rows={2}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">ملاحظات إضافية</label>
              <Input
                placeholder="ملاحظات للسائق أو المطبخ..."
                value={deliveryNotes}
                onChange={(e) => setDeliveryNotes(e.target.value)}
              />
            </div>

            {branches.length > 1 && (
              <div>
                <label className="text-sm font-medium mb-1 block">الفرع</label>
                <select
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  className="w-full h-10 px-3 border rounded-md"
                >
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="text-sm font-medium mb-2 block">طريقة الدفع</label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={paymentMethod === 'cash' ? 'default' : 'outline'}
                  onClick={() => setPaymentMethod('cash')}
                  className="h-12 gap-2"
                >
                  <Banknote className="h-5 w-5" />
                  نقداً عند الاستلام
                </Button>
                <Button
                  variant={paymentMethod === 'card' ? 'default' : 'outline'}
                  onClick={() => setPaymentMethod('card')}
                  className="h-12 gap-2"
                  disabled
                >
                  <CreditCard className="h-5 w-5" />
                  بطاقة (قريباً)
                </Button>
              </div>
            </div>

            <div className="bg-muted/30 rounded-lg p-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span>المنتجات ({cartCount})</span>
                <span>{formatPrice(cartTotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>التوصيل</span>
                <span>{formatPrice(deliveryFee)}</span>
              </div>
              <div className="flex justify-between font-bold pt-2 border-t">
                <span>الإجمالي</span>
                <span className="text-primary">{formatPrice(grandTotal)}</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCheckout(false)}>
              رجوع
            </Button>
            <Button onClick={handleSubmitOrder} disabled={submitting}>
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin ml-2" />
                  جاري الإرسال...
                </>
              ) : (
                'تأكيد الطلب'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Tracking Dialog */}
      <Dialog open={showTracking} onOpenChange={setShowTracking}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              تتبع الطلب #{currentOrder?.order_number}
            </DialogTitle>
          </DialogHeader>

          {currentOrder && (
            <div className="space-y-6 py-4">
              {/* Status Timeline */}
              <div className="space-y-4">
                {[
                  { status: 'pending', label: 'قيد الانتظار', icon: Clock },
                  { status: 'preparing', label: 'قيد التحضير', icon: ChefHat },
                  { status: 'ready', label: 'جاهز للتوصيل', icon: CheckCircle },
                  { status: 'out_for_delivery', label: 'السائق في الطريق', icon: Truck },
                  { status: 'delivered', label: 'تم التسليم', icon: CheckCircle }
                ].map((step, idx) => {
                  const statusOrder = ['pending', 'preparing', 'ready', 'out_for_delivery', 'delivered'];
                  const currentIdx = statusOrder.indexOf(currentOrder.status);
                  const stepIdx = statusOrder.indexOf(step.status);
                  const isCompleted = stepIdx <= currentIdx;
                  const isCurrent = step.status === currentOrder.status;
                  
                  return (
                    <div key={step.status} className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        isCompleted 
                          ? 'bg-green-500 text-white' 
                          : 'bg-muted text-muted-foreground'
                      } ${isCurrent ? 'ring-2 ring-green-500 ring-offset-2' : ''}`}>
                        <step.icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <p className={`font-medium ${isCompleted ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {step.label}
                        </p>
                        {isCurrent && (
                          <p className="text-sm text-green-500">الحالة الحالية</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Order Summary */}
              <div className="bg-muted/30 rounded-lg p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>المجموع</span>
                  <span className="font-bold">{formatPrice(currentOrder.total)}</span>
                </div>
                <div className="flex justify-between">
                  <span>طريقة الدفع</span>
                  <span>{currentOrder.payment_method === 'cash' ? 'نقداً' : 'بطاقة'}</span>
                </div>
                <div className="flex justify-between">
                  <span>العنوان</span>
                  <span className="text-left max-w-[200px] truncate">{currentOrder.delivery_address}</span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setShowTracking(false)}>
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
