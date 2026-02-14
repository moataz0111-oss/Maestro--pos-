import React, { useState, useEffect } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { API_URL } from '../utils/api';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import {
  ArrowRight,
  Star,
  TrendingUp,
  TrendingDown,
  MessageSquare,
  User,
  Calendar,
  ChefHat,
  Truck,
  HeartHandshake,
  RefreshCw,
  Filter
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
const API = API_URL;
export default function Ratings() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [recentRatings, setRecentRatings] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState('all');
  // إعداد axios
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
  }, [token]);
  // جلب البيانات
  const fetchData = async () => {
    setLoading(true);
    try {
      // جلب ملخص التقييمات
      const summaryRes = await axios.get(`${API}/ratings/tenant-summary`);
      setSummary(summaryRes.data);
      // جلب الفروع
      const branchesRes = await axios.get(`${API}/branches`);
      setBranches(branchesRes.data || []);
      // جلب آخر التقييمات
      if (branchesRes.data && branchesRes.data.length > 0) {
        const branch = selectedBranch === 'all' ? branchesRes.data[0] : branchesRes.data.find(b => b.id === selectedBranch);
        if (branch) {
          const ratingsRes = await axios.get(`${API}/ratings/branch/${branch.id}`);
          setRecentRatings(ratingsRes.data.ratings || []);
        }
      }
    } catch (error) {
      console.error('Error fetching ratings:', error);
      toast.error(t('فشل في جلب التقييمات'));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    fetchData();
  }, [selectedBranch]);
  // مكون عرض النجوم
  const StarDisplay = ({ rating, size = 'sm' }) => {
    const sizeClass = size === 'lg' ? 'h-6 w-6' : 'h-4 w-4';
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`${sizeClass} ${
              star <= rating
                ? 'fill-yellow-400 text-yellow-400'
                : 'fill-gray-200 text-gray-200'
            }`}
          />
        ))}
      </div>
    );
  };
  // شريط توزيع التقييمات
  const RatingBar = ({ stars, count, total }) => {
    const percentage = total > 0 ? (count / total) * 100 : 0;
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="w-3 text-gray-600">{stars}</span>
        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-yellow-400 rounded-full transition-all duration-500"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <span className="w-8 text-gray-500 text-xs">{count}</span>
      </div>
    );
  };
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">{t('جاري تحميل التقييمات...')}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-gradient-to-r from-yellow-500 to-orange-500 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/')}
              className="text-white hover:bg-white/20"
            >
              <ArrowRight className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Star className="h-6 w-6" />
                {t('تقييمات العملاء')}
              </h1>
              <p className="text-yellow-100 text-sm">
                {summary?.total_ratings || 0} {t('تقييم')}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchData}
              className="text-white hover:bg-white/20"
            >
              <RefreshCw className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* ملخص التقييمات */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* التقييم العام */}
          <Card className="bg-gradient-to-br from-yellow-50 to-orange-50 border-yellow-200">
            <CardContent className="p-6 text-center">
              <div className="text-5xl font-bold text-yellow-600 mb-2">
                {summary?.avg_rating || 0}
              </div>
              <div className="flex justify-center mb-2">
                <StarDisplay rating={Math.round(summary?.avg_rating || 0)} size="lg" />
              </div>
              <p className="text-gray-600">
                {t('من')} {summary?.total_ratings || 0} {t('تقييم')}
              </p>
            </CardContent>
          </Card>
          {/* توزيع التقييمات */}
          <Card>
            <CardContent className="p-6">
              <h3 className="font-bold mb-4 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-500" />
                {t('توزيع التقييمات')}
              </h3>
              <div className="space-y-2">
                {[5, 4, 3, 2, 1].map((stars) => (
                  <RatingBar
                    key={stars}
                    stars={stars}
                    count={summary?.distribution?.[stars] || 0}
                    total={summary?.total_ratings || 0}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
          {/* التقييمات التفصيلية */}
          <Card>
            <CardContent className="p-6">
              <h3 className="font-bold mb-4">{t('التقييمات التفصيلية')}</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-gray-600">
                    <ChefHat className="h-5 w-5 text-orange-500" />
                    <span>{t('جودة الطعام')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{summary?.categories?.food || 0}</span>
                    <StarDisplay rating={Math.round(summary?.categories?.food || 0)} />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-gray-600">
                    <Truck className="h-5 w-5 text-blue-500" />
                    <span>{t('سرعة التوصيل')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{summary?.categories?.delivery || 0}</span>
                    <StarDisplay rating={Math.round(summary?.categories?.delivery || 0)} />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-gray-600">
                    <HeartHandshake className="h-5 w-5 text-pink-500" />
                    <span>{t('جودة الخدمة')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{summary?.categories?.service || 0}</span>
                    <StarDisplay rating={Math.round(summary?.categories?.service || 0)} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        {/* فلتر الفروع */}
        {branches.length > 1 && (
          <div className="flex items-center gap-3">
            <Filter className="h-5 w-5 text-gray-500" />
            <Select value={selectedBranch} onValueChange={setSelectedBranch}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="اختر الفرع" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('جميع الفروع')}</SelectItem>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {/* آخر التقييمات */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              {t('آخر التقييمات')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentRatings.length === 0 ? (
              <div className="text-center py-12">
                <Star className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">{t('لا توجد تقييمات حتى الآن')}</p>
                <p className="text-sm text-gray-400 mt-1">
                  {t('التقييمات ستظهر هنا عندما يقيّم العملاء طلباتهم')}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {recentRatings.map((rating) => (
                  <div
                    key={rating.id}
                    className={`p-4 rounded-lg border ${
                      rating.rating >= 4
                        ? 'bg-green-50 border-green-200'
                        : rating.rating >= 3
                        ? 'bg-yellow-50 border-yellow-200'
                        : 'bg-red-50 border-red-200'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                          <User className="h-5 w-5 text-gray-500" />
                        </div>
                        <div>
                          <p className="font-medium">{rating.customer_name || t('زبون')}</p>
                          <p className="text-sm text-gray-500 flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(rating.created_at).toLocaleDateString('ar-IQ', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </p>
                        </div>
                      </div>
                      <div className="text-left">
                        <StarDisplay rating={rating.rating} />
                        <Badge
                          variant="outline"
                          className={`mt-1 ${
                            rating.rating >= 4
                              ? 'border-green-500 text-green-600'
                              : rating.rating >= 3
                              ? 'border-yellow-500 text-yellow-600'
                              : 'border-red-500 text-red-600'
                          }`}
                        >
                          {rating.rating === 5
                            ? t('ممتاز')
                            : rating.rating === 4
                            ? t('جيد جداً')
                            : rating.rating === 3
                            ? t('جيد')
                            : rating.rating === 2
                            ? t('مقبول')
                            : t('سيء')}
                        </Badge>
                      </div>
                    </div>
                    {/* التقييمات التفصيلية */}
                    <div className="flex flex-wrap gap-4 text-sm text-gray-600 mb-2">
                      {rating.food_quality && (
                        <span className="flex items-center gap-1">
                          <ChefHat className="h-4 w-4 text-orange-500" />
                          {t('الطعام')}: {rating.food_quality}
                        </span>
                      )}
                      {rating.delivery_speed && (
                        <span className="flex items-center gap-1">
                          <Truck className="h-4 w-4 text-blue-500" />
                          {t('التوصيل')}: {rating.delivery_speed}
                        </span>
                      )}
                      {rating.service_quality && (
                        <span className="flex items-center gap-1">
                          <HeartHandshake className="h-4 w-4 text-pink-500" />
                          {t('الخدمة')}: {rating.service_quality}
                        </span>
                      )}
                    </div>
                    {/* التعليق */}
                    {rating.comment && (
                      <p className="text-gray-700 mt-2 bg-white/50 p-3 rounded-lg">
                        "{rating.comment}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
