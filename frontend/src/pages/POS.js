import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { formatPrice } from '../utils/currency';
import { playClick, playSuccess } from '../utils/sound';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';
import { ScrollArea } from '../components/ui/scroll-area';
import { 
  ArrowRight,
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  CreditCard,
  Banknote,
  Clock,
  User,
  Phone,
  MapPin,
  Truck,
  UtensilsCrossed,
  Package,
  Printer,
  Check,
  X
} from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function POS() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState([]);
  const [orderType, setOrderType] = useState('dine_in');
  const [selectedTable, setSelectedTable] = useState(null);
  const [tables, setTables] = useState([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [discount, setDiscount] = useState(0);
  const [deliveryApp, setDeliveryApp] = useState('');
  const [deliveryApps, setDeliveryApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [currentShift, setCurrentShift] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [catRes, prodRes, tablesRes, appsRes, shiftRes] = await Promise.all([
        axios.get(`${API}/categories`),
        axios.get(`${API}/products`),
        axios.get(`${API}/tables`, { params: { branch_id: user?.branch_id } }),
        axios.get(`${API}/delivery-apps`),
        axios.get(`${API}/shifts/current`).catch(() => ({ data: null }))
      ]);

      setCategories(catRes.data);
      setProducts(prodRes.data);
      setTables(tablesRes.data);
      setDeliveryApps(appsRes.data);
      setCurrentShift(shiftRes.data);

      if (catRes.data.length > 0) {
        setSelectedCategory(catRes.data[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('فشل في تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = products.filter(p => {
    const matchesCategory = !selectedCategory || p.category_id === selectedCategory;
    const matchesSearch = !searchQuery || 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.name_en?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch && p.is_available;
  });

  const addToCart = useCallback((product) => {
    playClick();
    setCart(prev => {
      const existing = prev.find(item => item.product_id === product.id);
      if (existing) {
        return prev.map(item =>
          item.product_id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, {
        product_id: product.id,
        product_name: product.name,
        price: product.price,
        quantity: 1,
        notes: ''
      }];
    });
  }, []);

  const updateQuantity = useCallback((productId, delta) => {
    playClick();
    setCart(prev => prev.map(item => {
      if (item.product_id === productId) {
        const newQty = item.quantity + delta;
        return newQty > 0 ? { ...item, quantity: newQty } : item;
      }
      return item;
    }).filter(item => item.quantity > 0));
  }, []);

  const removeFromCart = useCallback((productId) => {
    playClick();
    setCart(prev => prev.filter(item => item.product_id !== productId));
  }, []);

  const clearCart = useCallback(() => {
    playClick();
    setCart([]);
    setCustomerName('');
    setCustomerPhone('');
    setDeliveryAddress('');
    setDiscount(0);
    setSelectedTable(null);
    setDeliveryApp('');
  }, []);

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const total = subtotal - discount;

  const handleSubmitOrder = async () => {
    if (cart.length === 0) {
      toast.error('السلة فارغة');
      return;
    }

    if (orderType === 'dine_in' && !selectedTable) {
      toast.error('يرجى اختيار طاولة');
      return;
    }

    if (orderType === 'delivery' && !deliveryAddress) {
      toast.error('يرجى إدخال عنوان التوصيل');
      return;
    }

    setSubmitting(true);
    try {
      const orderData = {
        order_type: orderType,
        table_id: orderType === 'dine_in' ? selectedTable : null,
        customer_name: customerName,
        customer_phone: customerPhone,
        delivery_address: orderType === 'delivery' ? deliveryAddress : null,
        items: cart,
        branch_id: user?.branch_id || (await axios.get(`${API}/branches`)).data[0]?.id,
        payment_method: paymentMethod,
        discount: discount,
        delivery_app: orderType === 'delivery' ? deliveryApp : null
      };

      const response = await axios.post(`${API}/orders`, orderData);
      
      playSuccess();
      toast.success(`تم إنشاء الطلب #${response.data.order_number} بنجاح`);
      clearCart();
      
      // Refresh tables
      const tablesRes = await axios.get(`${API}/tables`, { params: { branch_id: user?.branch_id } });
      setTables(tablesRes.data);
      
    } catch (error) {
      console.error('Failed to submit order:', error);
      toast.error(error.response?.data?.detail || 'فشل في إنشاء الطلب');
    } finally {
      setSubmitting(false);
    }
  };

  const getCategoryIcon = (iconName) => {
    const icons = {
      Beef: '🍔',
      Pizza: '🍕',
      Coffee: '☕',
      Cake: '🍰',
      Salad: '🥗',
    };
    return icons[iconName] || '📦';
  };

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
    <div className="h-screen flex bg-background overflow-hidden" dir="rtl" data-testid="pos-screen">
      {/* Right Sidebar - Categories */}
      <div className="w-24 bg-card border-l border-border flex flex-col">
        <Button
          variant="ghost"
          className="h-16 rounded-none border-b border-border"
          onClick={() => navigate('/')}
          data-testid="pos-back-btn"
        >
          <ArrowRight className="h-5 w-5" />
        </Button>
        
        <ScrollArea className="flex-1">
          <div className="py-2">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => { setSelectedCategory(cat.id); playClick(); }}
                className={`w-full py-4 px-2 flex flex-col items-center gap-2 transition-colors ${
                  selectedCategory === cat.id 
                    ? 'bg-primary/10 border-r-2 border-primary' 
                    : 'hover:bg-muted'
                }`}
                data-testid={`category-${cat.id}`}
              >
                <span className="text-2xl">{getCategoryIcon(cat.icon)}</span>
                <span className="text-xs font-medium text-foreground text-center leading-tight">{cat.name}</span>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Center - Products Grid */}
      <div className="flex-1 flex flex-col">
        {/* Search & Order Type */}
        <div className="p-4 border-b border-border bg-card/50">
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="بحث عن منتج..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10 h-12 bg-background"
                data-testid="pos-search"
              />
            </div>
          </div>
          
          {/* Order Type Tabs */}
          <div className="flex gap-2">
            {[
              { id: 'dine_in', label: 'داخلي', icon: UtensilsCrossed },
              { id: 'takeaway', label: 'سفري', icon: Package },
              { id: 'delivery', label: 'توصيل', icon: Truck },
            ].map(type => (
              <Button
                key={type.id}
                variant={orderType === type.id ? 'default' : 'outline'}
                className={`flex-1 h-12 ${orderType === type.id ? 'bg-primary text-primary-foreground' : ''}`}
                onClick={() => { setOrderType(type.id); playClick(); }}
                data-testid={`order-type-${type.id}`}
              >
                <type.icon className="h-5 w-5 ml-2" />
                {type.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Products Grid */}
        <ScrollArea className="flex-1 p-4">
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {filteredProducts.map(product => (
              <button
                key={product.id}
                onClick={() => addToCart(product)}
                className="pos-item-button group"
                data-testid={`product-${product.id}`}
              >
                <div className="aspect-square relative overflow-hidden rounded-t-xl">
                  {product.image ? (
                    <img 
                      src={product.image} 
                      alt={product.name}
                      className="w-full h-full object-cover transition-transform group-hover:scale-110"
                    />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <Package className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                </div>
                <div className="p-3">
                  <h3 className="font-medium text-sm text-foreground truncate">{product.name}</h3>
                  <p className="text-primary font-bold mt-1 tabular-nums">{formatPrice(product.price)}</p>
                </div>
              </button>
            ))}
          </div>
          
          {filteredProducts.length === 0 && (
            <div className="text-center py-12">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">لا توجد منتجات</p>
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Left Sidebar - Order Summary */}
      <div className="w-96 bg-card border-r border-border flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold font-cairo text-foreground">الطلب الحالي</h2>
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-primary" />
              <span className="bg-primary text-primary-foreground text-sm font-bold px-2 py-0.5 rounded-full">
                {cart.reduce((sum, item) => sum + item.quantity, 0)}
              </span>
            </div>
          </div>
        </div>

        {/* Customer Info */}
        <div className="p-4 border-b border-border space-y-3">
          {orderType === 'dine_in' && (
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">اختر طاولة</label>
              <div className="grid grid-cols-5 gap-2">
                {tables.filter(t => t.status === 'available' || t.id === selectedTable).map(table => (
                  <button
                    key={table.id}
                    onClick={() => { setSelectedTable(table.id); playClick(); }}
                    className={`p-2 rounded-lg text-sm font-medium transition-colors ${
                      selectedTable === table.id
                        ? 'bg-primary text-primary-foreground'
                        : table.status === 'occupied'
                        ? 'bg-destructive/20 text-destructive cursor-not-allowed'
                        : 'bg-muted hover:bg-muted/80 text-foreground'
                    }`}
                    disabled={table.status === 'occupied' && table.id !== selectedTable}
                    data-testid={`table-${table.number}`}
                  >
                    {table.number}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="relative">
              <User className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="اسم الزبون"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="pr-9 h-10 text-sm"
                data-testid="customer-name"
              />
            </div>
            <div className="relative">
              <Phone className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="رقم الهاتف"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="pr-9 h-10 text-sm"
                data-testid="customer-phone"
              />
            </div>
          </div>

          {orderType === 'delivery' && (
            <>
              <div className="relative">
                <MapPin className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="عنوان التوصيل"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  className="pr-9 h-10 text-sm"
                  data-testid="delivery-address"
                />
              </div>
              <select
                value={deliveryApp}
                onChange={(e) => setDeliveryApp(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm text-foreground"
                data-testid="delivery-app"
              >
                <option value="">طلب مباشر</option>
                {deliveryApps.map(app => (
                  <option key={app.id} value={app.id}>{app.name}</option>
                ))}
              </select>
            </>
          )}
        </div>

        {/* Cart Items */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-2">
            {cart.length === 0 ? (
              <div className="text-center py-8">
                <ShoppingCart className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">السلة فارغة</p>
              </div>
            ) : (
              cart.map(item => (
                <div 
                  key={item.product_id}
                  className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg"
                  data-testid={`cart-item-${item.product_id}`}
                >
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm text-foreground truncate">{item.product_name}</h4>
                    <p className="text-primary text-sm tabular-nums">{formatPrice(item.price)}</p>
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
                    <span className="w-8 text-center font-bold text-foreground">{item.quantity}</span>
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
                      className="h-8 w-8 text-destructive hover:bg-destructive/10"
                      onClick={() => removeFromCart(item.product_id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {/* Totals & Payment */}
        <div className="p-4 border-t border-border bg-muted/30 space-y-4">
          {/* Discount */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">خصم:</span>
            <Input
              type="number"
              value={discount}
              onChange={(e) => setDiscount(Number(e.target.value) || 0)}
              className="flex-1 h-9 text-sm"
              min="0"
              data-testid="discount-input"
            />
          </div>

          {/* Subtotal & Total */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">المجموع الفرعي:</span>
              <span className="tabular-nums text-foreground">{formatPrice(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-sm text-destructive">
                <span>الخصم:</span>
                <span className="tabular-nums">-{formatPrice(discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold pt-2 border-t border-border">
              <span className="text-foreground">الإجمالي:</span>
              <span className="text-primary tabular-nums">{formatPrice(total)}</span>
            </div>
          </div>

          {/* Payment Method */}
          <div className="flex gap-2">
            {[
              { id: 'cash', label: 'نقدي', icon: Banknote },
              { id: 'card', label: 'بطاقة', icon: CreditCard },
              { id: 'credit', label: 'آجل', icon: Clock },
            ].map(method => (
              <Button
                key={method.id}
                variant={paymentMethod === method.id ? 'default' : 'outline'}
                className={`flex-1 h-10 ${paymentMethod === method.id ? 'bg-secondary text-secondary-foreground' : ''}`}
                onClick={() => { setPaymentMethod(method.id); playClick(); }}
                data-testid={`payment-${method.id}`}
              >
                <method.icon className="h-4 w-4 ml-1" />
                {method.label}
              </Button>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 h-12"
              onClick={clearCart}
              disabled={cart.length === 0}
              data-testid="clear-cart"
            >
              <X className="h-5 w-5 ml-2" />
              إلغاء
            </Button>
            <Button
              className="flex-1 h-12 bg-primary text-primary-foreground hover:bg-primary/90 font-bold"
              onClick={handleSubmitOrder}
              disabled={cart.length === 0 || submitting}
              data-testid="submit-order"
            >
              {submitting ? (
                <span className="flex items-center">
                  <svg className="animate-spin h-5 w-5 ml-2" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  جاري...
                </span>
              ) : (
                <>
                  <Check className="h-5 w-5 ml-2" />
                  تأكيد الطلب
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
