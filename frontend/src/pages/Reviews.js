import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import {
  ArrowRight,
  Star,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  User,
  Calendar,
  TrendingUp,
  Award,
  Search,
  Filter
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';

const API = process.env.REACT_APP_BACKEND_URL;

export default function Reviews() {
  const navigate = useNavigate();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterRating, setFilterRating] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState({
    average: 0,
    total: 0,
    distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
  });

  useEffect(() => {
    fetchReviews();
  }, []);

  const fetchReviews = async () => {
    try {
      const res = await axios.get(`${API}/reviews`);
      setReviews(res.data.reviews || []);
      setStats(res.data.stats || stats);
    } catch (error) {
      // بيانات تجريبية
      const mockReviews = [
        {
          id: '1',
          customer_name: 'أحمد محمد',
          order_id: 'ORD-001',
          rating: 5,
          food_rating: 5,
          service_rating: 5,
          delivery_rating: 4,
          comment: 'طعام ممتاز وخدمة رائعة! سأطلب مرة أخرى بالتأكيد',
          created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
          reply: null
        },
        {
          id: '2',
          customer_name: 'فاطمة علي',
          order_id: 'ORD-002',
          rating: 4,
          food_rating: 5,
          service_rating: 4,
          delivery_rating: 3,
          comment: 'الطعام لذيذ جداً لكن التوصيل تأخر قليلاً',
          created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
          reply: 'شكراً لملاحظتك القيمة، سنعمل على تحسين وقت التوصيل'
        },
        {
          id: '3',
          customer_name: 'خالد سعيد',
          order_id: 'ORD-003',
          rating: 5,
          food_rating: 5,
          service_rating: 5,
          delivery_rating: 5,
          comment: 'أفضل مطعم جربته! كل شيء مثالي',
          created_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
          reply: null
        },
        {
          id: '4',
          customer_name: 'نورة أحمد',
          order_id: 'ORD-004',
          rating: 3,
          food_rating: 4,
          service_rating: 3,
          delivery_rating: 2,
          comment: 'الطعام جيد لكن الطلب وصل بارد',
          created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
          reply: 'نعتذر عن هذه التجربة، سنتواصل معك لتعويضك'
        },
        {
          id: '5',
          customer_name: 'عبدالله محمد',
          order_id: 'ORD-005',
          rating: 5,
          food_rating: 5,
          service_rating: 5,
          delivery_rating: 5,
          comment: 'خدمة سريعة وطعام شهي!',
          created_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
          reply: null
        }
      ];
      
      setReviews(mockReviews);
      
      // حساب الإحصائيات
      const total = mockReviews.length;
      const sum = mockReviews.reduce((acc, r) => acc + r.rating, 0);
      const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
      mockReviews.forEach(r => distribution[r.rating]++);
      
      setStats({
        average: total > 0 ? (sum / total).toFixed(1) : 0,
        total,
        distribution
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReply = async (reviewId, reply) => {
    try {
      await axios.post(`${API}/reviews/${reviewId}/reply`, { reply });
      toast.success('تم إضافة الرد');
      fetchReviews();
    } catch (error) {
      // تحديث محلي
      setReviews(reviews.map(r => 
        r.id === reviewId ? { ...r, reply } : r
      ));
      toast.success('تم إضافة الرد');
    }
  };

  const renderStars = (rating, size = 'h-4 w-4') => {
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`${size} ${star <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
          />
        ))}
      </div>
    );
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 1000 * 60 * 60) {
      const minutes = Math.floor(diff / (1000 * 60));
      return `منذ ${minutes} دقيقة`;
    } else if (diff < 1000 * 60 * 60 * 24) {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      return `منذ ${hours} ساعة`;
    } else {
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      return `منذ ${days} يوم`;
    }
  };

  const filteredReviews = reviews
    .filter(r => filterRating === 'all' || r.rating === parseInt(filterRating))
    .filter(r => 
      r.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.comment.toLowerCase().includes(searchQuery.toLowerCase())
    );

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card/95 backdrop-blur border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/dashboard')}
              className="rounded-lg"
            >
              <ArrowRight className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <Star className="h-6 w-6 text-amber-500 fill-amber-500" />
              <h1 className="text-xl font-bold font-cairo">التقييمات</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Average Rating Card */}
          <Card className="md:col-span-1 bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-amber-500/30">
            <CardContent className="p-6 text-center">
              <div className="text-5xl font-bold text-amber-500 mb-2">{stats.average}</div>
              {renderStars(Math.round(stats.average), 'h-5 w-5')}
              <p className="mt-2 text-sm text-muted-foreground">من {stats.total} تقييم</p>
            </CardContent>
          </Card>

          {/* Rating Distribution */}
          <Card className="md:col-span-3 bg-card border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">توزيع التقييمات</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[5, 4, 3, 2, 1].map((rating) => {
                const count = stats.distribution[rating] || 0;
                const percentage = stats.total > 0 ? (count / stats.total) * 100 : 0;
                return (
                  <div key={rating} className="flex items-center gap-3">
                    <div className="flex items-center gap-1 w-16">
                      <span className="text-sm">{rating}</span>
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    </div>
                    <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-amber-400 to-orange-400 rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="text-sm text-muted-foreground w-12">{count}</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-card border-border/50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <ThumbsUp className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{reviews.filter(r => r.rating >= 4).length}</p>
                <p className="text-xs text-muted-foreground">تقييم إيجابي</p>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-card border-border/50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                <ThumbsDown className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{reviews.filter(r => r.rating <= 2).length}</p>
                <p className="text-xs text-muted-foreground">يحتاج تحسين</p>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-card border-border/50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <MessageSquare className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{reviews.filter(r => r.comment).length}</p>
                <p className="text-xs text-muted-foreground">مع تعليق</p>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-card border-border/50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Award className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{reviews.filter(r => r.reply).length}</p>
                <p className="text-xs text-muted-foreground">تم الرد</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="bg-card border-border/50">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="بحث في التقييمات..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pr-10"
                  />
                </div>
              </div>
              
              <Select value={filterRating} onValueChange={setFilterRating}>
                <SelectTrigger className="w-40">
                  <Filter className="h-4 w-4 ml-2" />
                  <SelectValue placeholder="التقييم" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع التقييمات</SelectItem>
                  <SelectItem value="5">5 نجوم</SelectItem>
                  <SelectItem value="4">4 نجوم</SelectItem>
                  <SelectItem value="3">3 نجوم</SelectItem>
                  <SelectItem value="2">2 نجوم</SelectItem>
                  <SelectItem value="1">1 نجمة</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Reviews List */}
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
              <p className="mt-4 text-muted-foreground">جاري التحميل...</p>
            </div>
          ) : filteredReviews.length === 0 ? (
            <Card className="bg-card border-border/50">
              <CardContent className="p-12 text-center">
                <Star className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-lg text-muted-foreground">لا توجد تقييمات</p>
              </CardContent>
            </Card>
          ) : (
            filteredReviews.map((review) => (
              <Card key={review.id} className="bg-card border-border/50 hover:border-primary/30 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                      <User className="h-6 w-6 text-white" />
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-bold">{review.customer_name}</h3>
                          <p className="text-xs text-muted-foreground">طلب #{review.order_id}</p>
                        </div>
                        <div className="text-left">
                          {renderStars(review.rating)}
                          <p className="text-xs text-muted-foreground mt-1">
                            <Calendar className="h-3 w-3 inline ml-1" />
                            {formatDate(review.created_at)}
                          </p>
                        </div>
                      </div>
                      
                      {/* Detailed Ratings */}
                      <div className="flex gap-4 mt-3 text-xs">
                        <span className="flex items-center gap-1">
                          🍽️ الطعام: {renderStars(review.food_rating, 'h-3 w-3')}
                        </span>
                        <span className="flex items-center gap-1">
                          👨‍🍳 الخدمة: {renderStars(review.service_rating, 'h-3 w-3')}
                        </span>
                        <span className="flex items-center gap-1">
                          🚗 التوصيل: {renderStars(review.delivery_rating, 'h-3 w-3')}
                        </span>
                      </div>
                      
                      {review.comment && (
                        <p className="mt-3 text-sm bg-muted/50 p-3 rounded-lg">
                          "{review.comment}"
                        </p>
                      )}
                      
                      {review.reply && (
                        <div className="mt-3 mr-4 p-3 bg-primary/5 border-r-2 border-primary rounded">
                          <p className="text-xs text-primary font-medium mb-1">رد الإدارة:</p>
                          <p className="text-sm">{review.reply}</p>
                        </div>
                      )}
                      
                      {!review.reply && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-2 text-primary"
                          onClick={() => {
                            const reply = window.prompt('أدخل ردك على هذا التقييم:');
                            if (reply) handleReply(review.id, reply);
                          }}
                        >
                          <MessageSquare className="h-4 w-4 ml-1" />
                          إضافة رد
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
