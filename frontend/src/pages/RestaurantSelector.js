import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Store, Search, MapPin, Phone, Star, Loader2, ChefHat } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

export default function RestaurantSelector() {
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  // تحديث manifest للعملاء
  useEffect(() => {
    const manifestLink = document.querySelector('link[rel="manifest"]');
    if (manifestLink) {
      manifestLink.href = '/manifest-customer.json?v=' + Date.now();
    }
    
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = '#f97316';
    
    document.title = 'اطلب طعامك - اختر مطعمك المفضل';
  }, []);

  useEffect(() => {
    fetchRestaurants();
  }, []);

  const fetchRestaurants = async () => {
    try {
      const res = await axios.get(`${API}/customer/restaurants`);
      setRestaurants(res.data || []);
    } catch (error) {
      console.error('Error fetching restaurants:', error);
      toast.error('فشل في تحميل المطاعم');
    } finally {
      setLoading(false);
    }
  };

  const filteredRestaurants = restaurants.filter(r =>
    r.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectRestaurant = (slug) => {
    navigate(`/menu/${slug}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-orange-500 mx-auto mb-4" />
          <p className="text-gray-600">جاري تحميل المطاعم...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white" dir="rtl">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white py-8 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <ChefHat className="h-10 w-10" />
            <h1 className="text-3xl font-bold">اطلب طعامك</h1>
          </div>
          <p className="text-orange-100">اختر مطعمك المفضل وابدأ الطلب</p>
        </div>
      </div>

      {/* Search */}
      <div className="max-w-2xl mx-auto px-4 -mt-6">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <Input
            type="text"
            placeholder="ابحث عن مطعم..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-10 h-12 bg-white shadow-lg border-0 rounded-xl"
          />
        </div>
      </div>

      {/* Restaurants List */}
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
        {filteredRestaurants.length === 0 ? (
          <div className="text-center py-12">
            <Store className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">لا توجد مطاعم متاحة حالياً</p>
          </div>
        ) : (
          filteredRestaurants.map((restaurant) => (
            <Card 
              key={restaurant.id} 
              className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => handleSelectRestaurant(restaurant.menu_slug)}
            >
              <CardContent className="p-0">
                <div className="flex gap-4">
                  {/* Logo */}
                  <div className="w-24 h-24 bg-gradient-to-br from-orange-100 to-orange-50 flex items-center justify-center flex-shrink-0">
                    {restaurant.logo ? (
                      <img 
                        src={restaurant.logo} 
                        alt={restaurant.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Store className="h-10 w-10 text-orange-400" />
                    )}
                  </div>
                  
                  {/* Info */}
                  <div className="flex-1 py-3 pl-4">
                    <h3 className="font-bold text-lg text-gray-800 mb-1">
                      {restaurant.name}
                    </h3>
                    {restaurant.description && (
                      <p className="text-sm text-gray-500 mb-2 line-clamp-1">
                        {restaurant.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-gray-400">
                      {restaurant.address && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {restaurant.address}
                        </span>
                      )}
                      {restaurant.branches_count > 0 && (
                        <span className="flex items-center gap-1">
                          <Store className="h-3 w-3" />
                          {restaurant.branches_count} فرع
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* PWA Install Banner */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t shadow-lg">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
              <ChefHat className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <p className="font-medium text-sm">ثبّت التطبيق</p>
              <p className="text-xs text-gray-500">للوصول السريع</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
