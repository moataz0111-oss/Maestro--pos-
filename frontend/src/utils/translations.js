// ملف الترجمات - نظام ترجمة بسيط
const translations = {
  ar: {
    // القائمة الجانبية
    dashboard: 'الرئيسية',
    pos: 'نقطة البيع',
    orders: 'الطلبات',
    tables: 'الطاولات',
    menu: 'القائمة',
    inventory: 'المخزون',
    reports: 'التقارير',
    expenses: 'المصاريف',
    delivery: 'التوصيل',
    settings: 'الإعدادات',
    kitchen: 'المطبخ',
    hr: 'الموارد البشرية',
    logout: 'تسجيل الخروج',
    
    // أنواع الطلبات
    dine_in: 'داخل المطعم',
    takeaway: 'سفري',
    delivery_type: 'توصيل',
    
    // حالات الطلب
    pending: 'معلق',
    preparing: 'قيد التحضير',
    ready: 'جاهز',
    delivered: 'تم التسليم',
    cancelled: 'ملغي',
    
    // أزرار عامة
    save: 'حفظ',
    cancel: 'إلغاء',
    delete: 'حذف',
    edit: 'تعديل',
    add: 'إضافة',
    search: 'بحث',
    filter: 'فلتر',
    export: 'تصدير',
    print: 'طباعة',
    confirm: 'تأكيد',
    close: 'إغلاق',
    
    // رسائل
    loading: 'جاري التحميل...',
    no_data: 'لا توجد بيانات',
    success: 'تم بنجاح',
    error: 'حدث خطأ',
    
    // POS
    cart: 'السلة',
    total: 'الإجمالي',
    subtotal: 'المجموع الفرعي',
    discount: 'خصم',
    tax: 'ضريبة',
    cash: 'نقدي',
    card: 'بطاقة',
    credit: 'آجل',
    table: 'طاولة',
    customer: 'العميل',
    
    // المطبخ
    kitchen_display: 'شاشة المطبخ',
    new_orders: 'جديد',
    in_progress: 'قيد التحضير',
    ready_for_delivery: 'جاهز للتسليم',
    all: 'الكل',
    no_orders: 'لا توجد طلبات',
    orders_appear_here: 'الطلبات الجديدة ستظهر هنا تلقائياً',
  },
  
  en: {
    // Sidebar
    dashboard: 'Dashboard',
    pos: 'POS',
    orders: 'Orders',
    tables: 'Tables',
    menu: 'Menu',
    inventory: 'Inventory',
    reports: 'Reports',
    expenses: 'Expenses',
    delivery: 'Delivery',
    settings: 'Settings',
    kitchen: 'Kitchen',
    hr: 'HR',
    logout: 'Logout',
    
    // Order types
    dine_in: 'Dine In',
    takeaway: 'Takeaway',
    delivery_type: 'Delivery',
    
    // Order status
    pending: 'Pending',
    preparing: 'Preparing',
    ready: 'Ready',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
    
    // Common buttons
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    add: 'Add',
    search: 'Search',
    filter: 'Filter',
    export: 'Export',
    print: 'Print',
    confirm: 'Confirm',
    close: 'Close',
    
    // Messages
    loading: 'Loading...',
    no_data: 'No data',
    success: 'Success',
    error: 'Error occurred',
    
    // POS
    cart: 'Cart',
    total: 'Total',
    subtotal: 'Subtotal',
    discount: 'Discount',
    tax: 'Tax',
    cash: 'Cash',
    card: 'Card',
    credit: 'Credit',
    table: 'Table',
    customer: 'Customer',
    
    // Kitchen
    kitchen_display: 'Kitchen Display',
    new_orders: 'New',
    in_progress: 'In Progress',
    ready_for_delivery: 'Ready',
    all: 'All',
    no_orders: 'No orders',
    orders_appear_here: 'New orders will appear here automatically',
  },
  
  ku: {
    // کوردی - Kurdish
    dashboard: 'سەرەکی',
    pos: 'فرۆشتن',
    orders: 'داواکاری',
    tables: 'مێز',
    menu: 'لیست',
    inventory: 'کۆگا',
    reports: 'راپۆرت',
    expenses: 'خەرجی',
    delivery: 'گەیاندن',
    settings: 'ڕێکخستن',
    kitchen: 'چێشتخانە',
    hr: 'کارمەندان',
    logout: 'دەرچوون',
    
    dine_in: 'ناو چێشتخانە',
    takeaway: 'بردن',
    delivery_type: 'گەیاندن',
    
    pending: 'چاوەڕوان',
    preparing: 'ئامادەکردن',
    ready: 'ئامادەیە',
    delivered: 'گەیەندرا',
    cancelled: 'هەڵوەشێنرا',
    
    save: 'هەڵگرتن',
    cancel: 'هەڵوەشاندنەوە',
    delete: 'سڕینەوە',
    edit: 'دەستکاری',
    add: 'زیادکردن',
    search: 'گەڕان',
    loading: 'بارکردن...',
    no_data: 'داتا نییە',
    
    kitchen_display: 'شاشەی چێشتخانە',
    new_orders: 'نوێ',
    in_progress: 'لە ئامادەکردندا',
    ready_for_delivery: 'ئامادەیە',
    all: 'هەموو',
    no_orders: 'داواکاری نییە',
    orders_appear_here: 'داواکاری نوێ لێرە دەردەکەوێ',
  }
};

// الحصول على اللغة الحالية
export const getCurrentLanguage = () => {
  return localStorage.getItem('app_language') || 'ar';
};

// دالة الترجمة
export const t = (key) => {
  const lang = getCurrentLanguage();
  const langTranslations = translations[lang] || translations.ar;
  return langTranslations[key] || translations.ar[key] || key;
};

// تصدير كل الترجمات لاستخدامها مباشرة
export default translations;
