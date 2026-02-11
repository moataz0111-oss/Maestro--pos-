import React, { useState, useEffect, useCallback, useRef } from 'react';
import { API_URL, BACKEND_URL } from '../utils/api';
import axios from 'axios';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { formatPrice } from '../utils/currency';
import { 
  ChefHat, 
  Clock, 
  Check, 
  AlertTriangle,
  Bell,
  Volume2,
  VolumeX,
  RefreshCw,
  Maximize,
  Minimize,
  Utensils,
  Package,
  Truck,
  Coffee,
  Timer,
  ArrowRight,
  Home
} from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { useNavigate } from 'react-router-dom';

const API = API_URL;

// Order type icons and colors
const orderTypeConfig = {
  dine_in: { icon: Utensils, color: 'bg-blue-500', label: 'محلي', bgColor: 'bg-blue-500/20' },
  takeaway: { icon: Coffee, color: 'bg-purple-500', label: 'سفري', bgColor: 'bg-purple-500/20' },
  delivery: { icon: Truck, color: 'bg-orange-500', label: 'توصيل', bgColor: 'bg-orange-500/20' }
};

// Time formatting
const formatTime = (date) => {
  return new Date(date).toLocaleTimeString('ar-IQ', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
};

// Calculate elapsed time
const getElapsedTime = (createdAt) => {
  const now = new Date();
  const created = new Date(createdAt);
  const diff = Math.floor((now - created) / 1000 / 60); // minutes
  
  if (diff < 1) return 'الآن';
  if (diff < 60) return `${diff} د`;
  const hours = Math.floor(diff / 60);
  const mins = diff % 60;
  return `${hours}س ${mins}د`;
};

// Get urgency level based on elapsed time
const getUrgencyLevel = (createdAt, orderType) => {
  const now = new Date();
  const created = new Date(createdAt);
  const diff = Math.floor((now - created) / 1000 / 60);
  
  // Different thresholds for different order types
  const thresholds = {
    dine_in: { warning: 10, critical: 20 },
    takeaway: { warning: 8, critical: 15 },
    delivery: { warning: 15, critical: 25 }
  };
  
  const threshold = thresholds[orderType] || thresholds.dine_in;
  
  if (diff >= threshold.critical) return 'critical';
  if (diff >= threshold.warning) return 'warning';
  return 'normal';
};

// Order Card Component
const KitchenOrderCard = ({ order, onStatusChange, onItemComplete }) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const typeConfig = orderTypeConfig[order.order_type] || orderTypeConfig.dine_in;
  const TypeIcon = typeConfig.icon;
  const urgency = getUrgencyLevel(order.created_at, order.order_type);
  
  const urgencyStyles = {
    normal: 'border-gray-700',
    warning: 'border-yellow-500 animate-pulse',
    critical: 'border-red-500 animate-pulse ring-2 ring-red-500/50'
  };
  
  const handleComplete = async () => {
    setIsUpdating(true);
    try {
      await onStatusChange(order.id, 'ready');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Card className={`bg-gray-800 border-2 ${urgencyStyles[urgency]} transition-all hover:scale-[1.02]`}>
      <CardContent className="p-0">
        {/* Header */}
        <div className={`${typeConfig.bgColor} p-4 border-b border-gray-700`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 ${typeConfig.color} rounded-xl flex items-center justify-center shadow-lg`}>
                <TypeIcon className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="text-2xl font-black text-white">#{order.order_number}</h3>
                <p className="text-sm text-gray-300">{typeConfig.label}</p>
              </div>
            </div>
            
            <div className="text-left">
              <div className={`flex items-center gap-2 ${
                urgency === 'critical' ? 'text-red-400' : 
                urgency === 'warning' ? 'text-yellow-400' : 'text-gray-400'
              }`}>
                <Timer className="h-5 w-5" />
                <span className="text-xl font-bold">{getElapsedTime(order.created_at)}</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">{formatTime(order.created_at)}</p>
            </div>
          </div>
          
          {/* Customer/Table Info */}
          {(order.table_number || order.customer_name) && (
            <div className="mt-3 pt-3 border-t border-white/20 flex items-center gap-4">
              {order.table_number && (
                <Badge className="bg-white/20 text-white">
                  طاولة {order.table_number}
                </Badge>
              )}
              {order.customer_name && (
                <span className="text-white/80 text-sm">{order.customer_name}</span>
              )}
            </div>
          )}
        </div>
        
        {/* Items */}
        <div className="p-4 space-y-3 max-h-64 overflow-y-auto">
          {order.items?.map((item, idx) => (
            <div 
              key={idx} 
              className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
                item.completed ? 'bg-green-500/10 opacity-60' : 'bg-gray-700/50 hover:bg-gray-700'
              }`}
            >
              <button
                onClick={() => onItemComplete(order.id, idx, !item.completed)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                  item.completed 
                    ? 'bg-green-500 text-white' 
                    : 'bg-gray-600 text-gray-400 hover:bg-gray-500'
                }`}
              >
                {item.completed ? <Check className="h-5 w-5" /> : <span className="font-bold">{item.quantity}</span>}
              </button>
              
              <div className="flex-1">
                <p className={`font-medium ${item.completed ? 'line-through text-gray-500' : 'text-white'}`}>
                  {!item.completed && <span className="text-yellow-400 font-bold">{item.quantity}x </span>}
                  {item.name}
                </p>
                {item.notes && (
                  <p className="text-sm text-orange-400 mt-1 bg-orange-500/10 px-2 py-1 rounded">
                    ⚠️ {item.notes}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-gray-700 bg-gray-900/50">
          <Button
            onClick={handleComplete}
            disabled={isUpdating}
            className="w-full h-14 text-lg font-bold bg-green-500 hover:bg-green-600 text-white gap-3"
          >
            {isUpdating ? (
              <RefreshCw className="h-6 w-6 animate-spin" />
            ) : (
              <>
                <Check className="h-6 w-6" />
                جاهز للتسليم
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// Main Kitchen Display Component
export default function KitchenDisplay() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [filter, setFilter] = useState('all'); // all, pending, preparing
  const audioRef = useRef(null);
  const lastOrderCountRef = useRef(0);

  // Fetch orders
  const fetchOrders = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        navigate('/login');
        return;
      }
      
      // استخدام API المطبخ الجديد
      const res = await axios.get(`${API}/kitchen/orders`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const kitchenOrders = res.data
        .filter(o => o.kitchen_status !== 'completed_kitchen')
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      
      // Play sound for new orders
      if (kitchenOrders.length > lastOrderCountRef.current && soundEnabled) {
        playNewOrderSound();
      }
      lastOrderCountRef.current = kitchenOrders.length;
      
      setOrders(kitchenOrders);
    } catch (error) {
      console.error('Error fetching orders:', error);
      if (error.response?.status === 401) {
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  }, [navigate, soundEnabled]);

  // Initial fetch and polling
  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 10000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  // Sound effect
  const playNewOrderSound = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
  };

  // Update order status
  const handleStatusChange = async (orderId, newStatus) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API}/orders/${orderId}/status?status=${newStatus}`, 
        {},
        { headers: { Authorization: `Bearer ${token}` }}
      );
      
      toast.success(newStatus === 'ready' ? 'تم تجهيز الطلب!' : 'تم تحديث الحالة');
      fetchOrders();
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('فشل في تحديث الحالة');
    }
  };

  // Toggle item completion (local only for visual tracking)
  const handleItemComplete = (orderId, itemIndex, completed) => {
    setOrders(prev => prev.map(order => {
      if (order.id === orderId) {
        const newItems = [...order.items];
        newItems[itemIndex] = { ...newItems[itemIndex], completed };
        return { ...order, items: newItems };
      }
      return order;
    }));
  };

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Filter orders
  const filteredOrders = orders.filter(order => {
    if (filter === 'all') return true;
    return order.status === filter;
  });

  // Group by status
  const pendingOrders = filteredOrders.filter(o => o.status === 'pending');
  const preparingOrders = filteredOrders.filter(o => o.status === 'preparing');

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <RefreshCw className="h-12 w-12 text-yellow-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white" dir="rtl">
      <Toaster position="top-center" richColors />
      
      {/* Audio element for notifications */}
      <audio ref={audioRef} preload="auto">
        <source src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleVgMH26h3ejWqWUpEjRvmtT/7LdxLxA0aJfU/+24cy8QNHCZ1P/suHIuEDVvmdP/7blyLxE1b5rU/+24cTAQNHCZ0//tuHExEjVvmNP/7bhyLg80cJjS/+24ci4PM2+Y0//tuHIuDzNwmdP/7LdxLRA0b5jT/+24ci4QNHCa1P/st3EuEDVwmtT/67ZxLw81cJnT/+y3cy4PNHCa1P/st3EuEDRvmdT/7LdyLhA0cJnU/+y3cS8RNW+Z0//st3EvETVvmtP/7LdxLw81b5nU/+y3cS8PNW+Z0//st3EvDzRvmdT/7LdxLxA0b5rU/+u2cS8QNXCZ0//stnIuDzRvmtT/7LZyLw80b5rU/+y2ci4PNW+a0//rtnIvETVwmdP/67ZxLw80cJnU/+y2cS8QNW+Z1P/st3EuETVwmtT/67ZxLxA1b5nU/+y2cS8RNW+Z0//st3EuDzRvmtT/7LZxLxA0b5nT/+y3cS4QNW+a1P/st3EuEDVvmtT/7LZxLhE1b5rT/+y2cS8QNG+a0//stnEvEDVvmtP/7LZxLw80b5nU/+y2cS8QNG+a1P/rtnEvETVvmtP/7LZxLxA0b5nT/+y3cS4QNW+a1P/st3AuETRvmtT/7LdxLxE1cJnT/+y2cS4RNW+a0//st3EvEDVvmdT/7LZxLxE0b5rU/+y2cS4RNW+a0//stnEuETVvmtP/7LZxLxE1b5nT/+y2cS4RNW+a1P/stnEuETVvmtT/7LZxLxA1b5rT/+y2cC4RNW+a0//st3EvETVvmtP/7LZxLxE1b5rU/+y2cC4RNW+a0//stnAvETVvmtP/7LZxLxE1b5rU/+y2cS8RNW+a0//stnEuETVvmtT/7LZwLhE1b5rT/+y2cC8RNW+a0//stnEuETRvmtT/67ZxLhE1b5rU/+y2cC4RNW+a0//stnAvETVvmtP/7LZxLxE0b5rT/+y2cC8RNW+a0//st3EvETVvmtP/7LZxLhE1b5nT/+y2cC8RNW+a1P/stnAvETVvmtP/7LZwLxE1b5rT/+y2cC8RNW+a0//stnEuETVvmtT/7LZwLxE1b5rU/+y2cS8RNW+a0//stnAvETVvmtP/7LZwLxE1b5rU/+y2cC8RNW+a1P/stnAvETVvmtP/7LZwLxE1b5rU/+y2cC8RNXCZ0//stnAvETVvmtT/7LZwLxE1b5rU/+y2cC8RNW+a0//stnAvETVvmtP/7LZxLxE1b5rU/+y2cC8RNW+a0//stnAvETVvmtP/7LZwLxE1b5rU/+y2cC8RNW+a1P/stnAvETVvmtP/7LZwLxE1b5rU/+y2cC8RNW+a0//stnAvETVvmtT/7LZwLxE1b5rU/+y2cC8RNW+a0//stnEuETVvmtT/7LZwLxE1b5rU/+y2cC8RNW+a0//stnAvETVvmtP/7LZwLxE1b5rU/+y2cC8RNW+a1P/stnAvETVvmtP/7LZwLxE1b5rU/+y2cC8RNW+a0//stnAvETVvmtT/7LZwLxE1b5rU/+y2cC8RNW+a0//stnEvETVvmtT/7LZwLxE1b5rU/+y2cC8RNW+a0//stnAvETVvmtP/7LZwLw==" type="audio/wav" />
      </audio>
      
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 sticky top-0 z-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate('/')}
              className="text-gray-400 hover:text-white"
            >
              <Home className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-yellow-500/20 rounded-xl flex items-center justify-center">
                <ChefHat className="h-6 w-6 text-yellow-500" />
              </div>
              <div>
                <h1 className="text-xl font-bold">شاشة المطبخ</h1>
                <p className="text-sm text-gray-400">Kitchen Display System</p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Stats */}
            <div className="flex items-center gap-4 px-4 py-2 bg-gray-700/50 rounded-xl">
              <div className="text-center">
                <p className="text-2xl font-bold text-yellow-400">{pendingOrders.length}</p>
                <p className="text-xs text-gray-400">جديد</p>
              </div>
              <div className="w-px h-8 bg-gray-600" />
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-400">{preparingOrders.length}</p>
                <p className="text-xs text-gray-400">قيد التحضير</p>
              </div>
            </div>
            
            {/* Sound Toggle */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`border-gray-600 ${soundEnabled ? 'text-green-400' : 'text-gray-400'}`}
            >
              {soundEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
            </Button>
            
            {/* Refresh */}
            <Button
              variant="outline"
              size="icon"
              onClick={fetchOrders}
              className="border-gray-600"
            >
              <RefreshCw className="h-5 w-5" />
            </Button>
            
            {/* Fullscreen */}
            <Button
              variant="outline"
              size="icon"
              onClick={toggleFullscreen}
              className="border-gray-600"
            >
              {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
            </Button>
          </div>
        </div>
        
        {/* Filter Tabs */}
        <div className="flex gap-2 mt-4">
          {[
            { value: 'all', label: 'الكل', count: orders.length },
            { value: 'pending', label: 'جديد', count: pendingOrders.length, color: 'yellow' },
            { value: 'preparing', label: 'قيد التحضير', count: preparingOrders.length, color: 'blue' }
          ].map(tab => (
            <Button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={`gap-2 ${
                filter === tab.value 
                  ? 'bg-white/10 text-white' 
                  : 'bg-transparent text-gray-400 hover:text-white'
              }`}
              variant="ghost"
            >
              {tab.label}
              <Badge className={`${
                tab.color === 'yellow' ? 'bg-yellow-500/20 text-yellow-400' :
                tab.color === 'blue' ? 'bg-blue-500/20 text-blue-400' :
                'bg-gray-500/20 text-gray-400'
              }`}>
                {tab.count}
              </Badge>
            </Button>
          ))}
        </div>
      </header>
      
      {/* Main Content */}
      <main className="p-6">
        {filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[60vh] text-gray-400">
            <ChefHat className="h-24 w-24 mb-6 opacity-30" />
            <h2 className="text-2xl font-bold mb-2">لا توجد طلبات</h2>
            <p className="text-gray-500">الطلبات الجديدة ستظهر هنا تلقائياً</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredOrders.map(order => (
              <KitchenOrderCard
                key={order.id}
                order={order}
                onStatusChange={handleStatusChange}
                onItemComplete={handleItemComplete}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
