// Hook للترجمة - يُستخدم في جميع الصفحات
import { useCallback, useEffect, useState } from 'react';

// الترجمات المضمنة
const translations = {
  ar: {
    // القائمة والتنقل
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
    kitchen_display: 'شاشة المطبخ',
    hr: 'الموارد البشرية',
    logout: 'تسجيل الخروج',
    login: 'تسجيل الدخول',
    
    // أنواع الطلبات
    dine_in: 'داخل المطعم',
    takeaway: 'سفري',
    delivery_type: 'توصيل',
    all_types: 'جميع الأنواع',
    
    // حالات الطلب
    pending: 'معلق',
    preparing: 'قيد التحضير',
    ready: 'جاهز',
    delivered: 'تم التسليم',
    cancelled: 'ملغي',
    completed: 'مكتمل',
    
    // أزرار
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
    back: 'رجوع',
    refresh: 'تحديث',
    yes: 'نعم',
    no: 'لا',
    
    // رسائل
    loading: 'جاري التحميل...',
    no_data: 'لا توجد بيانات',
    success: 'تم بنجاح',
    error: 'حدث خطأ',
    saved_successfully: 'تم الحفظ بنجاح',
    deleted_successfully: 'تم الحذف بنجاح',
    confirm_delete: 'هل أنت متأكد من الحذف؟',
    no_results: 'لا توجد نتائج',
    
    // POS
    cart: 'السلة',
    cart_empty: 'السلة فارغة',
    total: 'الإجمالي',
    subtotal: 'المجموع الفرعي',
    discount: 'خصم',
    tax: 'ضريبة',
    cash: 'نقدي',
    card: 'بطاقة',
    credit: 'آجل',
    table: 'طاولة',
    customer: 'العميل',
    customer_name: 'اسم العميل',
    customer_phone: 'هاتف العميل',
    select_table: 'اختر طاولة',
    add_to_cart: 'أضف للسلة',
    clear_cart: 'تفريغ السلة',
    checkout: 'إتمام الطلب',
    payment_method: 'طريقة الدفع',
    order_notes: 'ملاحظات الطلب',
    send_to_kitchen: 'إرسال للمطبخ',
    complete_order: 'إتمام الطلب',
    pending_orders: 'الطلبات المعلقة',
    categories: 'الفئات',
    products: 'المنتجات',
    all_categories: 'جميع الفئات',
    search_products: 'بحث عن منتج...',
    quantity: 'الكمية',
    price: 'السعر',
    shift: 'الوردية',
    open_shift: 'فتح وردية',
    close_shift: 'إغلاق الوردية',
    all_branches: 'جميع الفروع',
    select_branch: 'اختر الفرع',
    
    // المطبخ
    new_orders: 'جديد',
    in_progress: 'قيد التحضير',
    ready_for_delivery: 'جاهز للتسليم',
    all: 'الكل',
    no_orders: 'لا توجد طلبات',
    orders_appear_here: 'الطلبات الجديدة ستظهر هنا تلقائياً',
    mark_ready: 'تحديد جاهز',
    new_order_alert: 'طلب جديد!',
    
    // الطلبات
    order: 'طلب',
    order_number: 'رقم الطلب',
    order_date: 'تاريخ الطلب',
    order_status: 'حالة الطلب',
    order_type: 'نوع الطلب',
    order_total: 'إجمالي الطلب',
    order_details: 'تفاصيل الطلب',
    new_order: 'طلب جديد',
    edit_order: 'تعديل الطلب',
    cancel_order: 'إلغاء الطلب',
    today_orders: 'طلبات اليوم',
    
    // التوصيل
    drivers: 'السائقين',
    driver: 'سائق',
    driver_name: 'اسم السائق',
    assign_driver: 'تعيين سائق',
    add_driver: 'إضافة سائق',
    no_drivers: 'لا يوجد سائقين',
    select_driver: 'اختر سائق',
    
    // الطاولات
    table_number: 'رقم الطاولة',
    available_tables: 'الطاولات المتاحة',
    occupied_tables: 'الطاولات المشغولة',
    add_table: 'إضافة طاولة',
    inside: 'داخلي',
    outside: 'خارجي',
    
    // المخزون
    stock: 'المخزون',
    current_stock: 'المخزون الحالي',
    low_stock: 'مخزون منخفض',
    add_stock: 'إضافة مخزون',
    unit: 'الوحدة',
    supplier: 'المورد',
    purchases: 'المشتريات',
    
    // التقارير
    daily_report: 'تقرير يومي',
    sales_report: 'تقرير المبيعات',
    from_date: 'من تاريخ',
    to_date: 'إلى تاريخ',
    total_sales: 'إجمالي المبيعات',
    total_expenses: 'إجمالي المصاريف',
    total_profit: 'إجمالي الأرباح',
    net_profit: 'صافي الربح',
    average_order: 'متوسط الطلب',
    orders_count: 'عدد الطلبات',
    best_selling: 'الأكثر مبيعاً',
    
    // المصاريف
    expense: 'مصروف',
    add_expense: 'إضافة مصروف',
    rent: 'إيجار',
    salaries: 'رواتب',
    maintenance: 'صيانة',
    other: 'أخرى',
    
    // الموظفين
    employee: 'موظف',
    employees: 'الموظفين',
    add_employee: 'إضافة موظف',
    attendance: 'الحضور',
    check_in: 'تسجيل حضور',
    check_out: 'تسجيل انصراف',
    payroll: 'كشف الرواتب',
    
    // الإعدادات
    general_settings: 'الإعدادات العامة',
    system_settings: 'إعدادات النظام',
    branch_settings: 'إعدادات الفرع',
    language: 'اللغة',
    currency: 'العملة',
    country: 'البلد',
    theme: 'المظهر',
    dark_mode: 'الوضع الداكن',
    light_mode: 'الوضع الفاتح',
    
    // المستخدمين
    users: 'المستخدمين',
    username: 'اسم المستخدم',
    password: 'كلمة المرور',
    change_password: 'تغيير كلمة المرور',
    email: 'البريد الإلكتروني',
    phone: 'الهاتف',
    role: 'الدور',
    permissions: 'الصلاحيات',
    admin: 'مدير',
    cashier: 'كاشير',
    
    // الفروع
    branch: 'فرع',
    branches: 'الفروع',
    branch_name: 'اسم الفرع',
    main_branch: 'الفرع الرئيسي',
    add_branch: 'إضافة فرع',
    
    // لوحة التحكم
    welcome: 'مرحباً',
    overview: 'نظرة عامة',
    quick_stats: 'إحصائيات سريعة',
    recent_orders: 'أحدث الطلبات',
    top_products: 'أفضل المنتجات',
    revenue: 'الإيرادات',
    profit: 'الربح',
    today: 'اليوم',
    this_week: 'هذا الأسبوع',
    this_month: 'هذا الشهر',
    
    // أخرى
    notes: 'ملاحظات',
    name: 'الاسم',
    address: 'العنوان',
    status: 'الحالة',
    type: 'النوع',
    amount: 'المبلغ',
    date: 'التاريخ',
    time: 'الوقت',
    actions: 'الإجراءات',
    details: 'التفاصيل',
    
    // Dashboard icons
    smart_reports: 'تقرير ذكي',
    ratings: 'التقييمات',
    warehouse: 'المخزن والتصنيع',
    branch_orders: 'طلبات الفروع',
    inventory_reports: 'تقارير المخزون',
    reservations: 'الحجوزات',
    call_logs: 'سجل المكالمات',
    loyalty: 'برنامج الولاء',
    coupons: 'الكوبونات',
    
    // Super Admin
    owner_dashboard: 'لوحة تحكم المالك',
    all_restaurants: 'جميع المطاعم',
    total_revenue: 'إجمالي الإيرادات',
    currency_conversion: 'تحويل العملات',
    exchange_rate: 'سعر الصرف',
    live_rates: 'أسعار حية',
    custom_rates: 'أسعار مخصصة',
  },
  
  en: {
    // Navigation
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
    kitchen_display: 'Kitchen Display',
    hr: 'HR',
    logout: 'Logout',
    login: 'Login',
    
    // Order types
    dine_in: 'Dine In',
    takeaway: 'Takeaway',
    delivery_type: 'Delivery',
    all_types: 'All Types',
    
    // Order status
    pending: 'Pending',
    preparing: 'Preparing',
    ready: 'Ready',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
    completed: 'Completed',
    
    // Buttons
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
    back: 'Back',
    refresh: 'Refresh',
    yes: 'Yes',
    no: 'No',
    
    // Messages
    loading: 'Loading...',
    no_data: 'No data',
    success: 'Success',
    error: 'Error',
    saved_successfully: 'Saved successfully',
    deleted_successfully: 'Deleted successfully',
    confirm_delete: 'Are you sure you want to delete?',
    no_results: 'No results',
    
    // POS
    cart: 'Cart',
    cart_empty: 'Cart is empty',
    total: 'Total',
    subtotal: 'Subtotal',
    discount: 'Discount',
    tax: 'Tax',
    cash: 'Cash',
    card: 'Card',
    credit: 'Credit',
    table: 'Table',
    customer: 'Customer',
    customer_name: 'Customer Name',
    customer_phone: 'Customer Phone',
    select_table: 'Select Table',
    add_to_cart: 'Add to Cart',
    clear_cart: 'Clear Cart',
    checkout: 'Checkout',
    payment_method: 'Payment Method',
    order_notes: 'Order Notes',
    send_to_kitchen: 'Send to Kitchen',
    complete_order: 'Complete Order',
    pending_orders: 'Pending Orders',
    categories: 'Categories',
    products: 'Products',
    all_categories: 'All Categories',
    search_products: 'Search products...',
    quantity: 'Quantity',
    price: 'Price',
    shift: 'Shift',
    open_shift: 'Open Shift',
    close_shift: 'Close Shift',
    all_branches: 'All Branches',
    select_branch: 'Select Branch',
    
    // Kitchen
    new_orders: 'New',
    in_progress: 'In Progress',
    ready_for_delivery: 'Ready',
    all: 'All',
    no_orders: 'No orders',
    orders_appear_here: 'New orders will appear here automatically',
    mark_ready: 'Mark Ready',
    new_order_alert: 'New Order!',
    
    // Orders
    order: 'Order',
    order_number: 'Order Number',
    order_date: 'Order Date',
    order_status: 'Order Status',
    order_type: 'Order Type',
    order_total: 'Order Total',
    order_details: 'Order Details',
    new_order: 'New Order',
    edit_order: 'Edit Order',
    cancel_order: 'Cancel Order',
    today_orders: 'Today\'s Orders',
    
    // Delivery
    drivers: 'Drivers',
    driver: 'Driver',
    driver_name: 'Driver Name',
    assign_driver: 'Assign Driver',
    add_driver: 'Add Driver',
    no_drivers: 'No drivers',
    select_driver: 'Select Driver',
    
    // Tables
    table_number: 'Table Number',
    available_tables: 'Available Tables',
    occupied_tables: 'Occupied Tables',
    add_table: 'Add Table',
    inside: 'Inside',
    outside: 'Outside',
    
    // Inventory
    stock: 'Stock',
    current_stock: 'Current Stock',
    low_stock: 'Low Stock',
    add_stock: 'Add Stock',
    unit: 'Unit',
    supplier: 'Supplier',
    purchases: 'Purchases',
    
    // Reports
    daily_report: 'Daily Report',
    sales_report: 'Sales Report',
    from_date: 'From Date',
    to_date: 'To Date',
    total_sales: 'Total Sales',
    total_expenses: 'Total Expenses',
    total_profit: 'Total Profit',
    net_profit: 'Net Profit',
    average_order: 'Average Order',
    orders_count: 'Orders Count',
    best_selling: 'Best Selling',
    
    // Expenses
    expense: 'Expense',
    add_expense: 'Add Expense',
    rent: 'Rent',
    salaries: 'Salaries',
    maintenance: 'Maintenance',
    other: 'Other',
    
    // Employees
    employee: 'Employee',
    employees: 'Employees',
    add_employee: 'Add Employee',
    attendance: 'Attendance',
    check_in: 'Check In',
    check_out: 'Check Out',
    payroll: 'Payroll',
    
    // Settings
    general_settings: 'General Settings',
    system_settings: 'System Settings',
    branch_settings: 'Branch Settings',
    language: 'Language',
    currency: 'Currency',
    country: 'Country',
    theme: 'Theme',
    dark_mode: 'Dark Mode',
    light_mode: 'Light Mode',
    
    // Users
    users: 'Users',
    username: 'Username',
    password: 'Password',
    change_password: 'Change Password',
    email: 'Email',
    phone: 'Phone',
    role: 'Role',
    permissions: 'Permissions',
    admin: 'Admin',
    cashier: 'Cashier',
    
    // Branches
    branch: 'Branch',
    branches: 'Branches',
    branch_name: 'Branch Name',
    main_branch: 'Main Branch',
    add_branch: 'Add Branch',
    
    // Dashboard
    welcome: 'Welcome',
    overview: 'Overview',
    quick_stats: 'Quick Stats',
    recent_orders: 'Recent Orders',
    top_products: 'Top Products',
    revenue: 'Revenue',
    profit: 'Profit',
    today: 'Today',
    this_week: 'This Week',
    this_month: 'This Month',
    
    // Other
    notes: 'Notes',
    name: 'Name',
    address: 'Address',
    status: 'Status',
    type: 'Type',
    amount: 'Amount',
    date: 'Date',
    time: 'Time',
    actions: 'Actions',
    details: 'Details',
    
    // Dashboard icons
    smart_reports: 'Smart Reports',
    ratings: 'Ratings',
    warehouse: 'Warehouse',
    branch_orders: 'Branch Orders',
    inventory_reports: 'Inventory Reports',
    reservations: 'Reservations',
    call_logs: 'Call Logs',
    loyalty: 'Loyalty',
    coupons: 'Coupons',
    
    // Super Admin
    owner_dashboard: 'Owner Dashboard',
    all_restaurants: 'All Restaurants',
    total_revenue: 'Total Revenue',
    currency_conversion: 'Currency Conversion',
    exchange_rate: 'Exchange Rate',
    live_rates: 'Live Rates',
    custom_rates: 'Custom Rates',
  },
  
  ku: {
    // کوردی
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
    kitchen_display: 'شاشەی چێشتخانە',
    hr: 'کارمەندان',
    logout: 'دەرچوون',
    login: 'چوونەژوورەوە',
    
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
    
    cart: 'سەبەتە',
    total: 'کۆ',
    cash: 'نەقد',
    card: 'کارت',
    
    new_orders: 'نوێ',
    in_progress: 'لە ئامادەکردندا',
    all: 'هەموو',
    no_orders: 'داواکاری نییە',
    
    today: 'ئەمڕۆ',
    welcome: 'بەخێربێیت',
    
    language: 'زمان',
    settings: 'ڕێکخستن',
  }
};

// دالة الترجمة الرئيسية
export const useTranslation = () => {
  const [lang, setLang] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('app_language') || 'ar';
    }
    return 'ar';
  });

  // تحديث الاتجاه عند تغيير اللغة
  useEffect(() => {
    const isRTL = ['ar', 'ku', 'fa', 'he'].includes(lang);
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  // الاستماع لتغييرات localStorage
  useEffect(() => {
    const handleStorage = () => {
      const newLang = localStorage.getItem('app_language') || 'ar';
      if (newLang !== lang) {
        setLang(newLang);
      }
    };
    
    window.addEventListener('storage', handleStorage);
    // أيضاً نتحقق عند التحميل
    handleStorage();
    
    return () => window.removeEventListener('storage', handleStorage);
  }, [lang]);

  const t = useCallback((key, fallback = null) => {
    const langData = translations[lang] || translations.ar;
    return langData[key] || translations.ar[key] || fallback || key;
  }, [lang]);

  const changeLanguage = useCallback((newLang) => {
    localStorage.setItem('app_language', newLang);
    setLang(newLang);
    // تطبيق الاتجاه فوراً
    const isRTL = ['ar', 'ku', 'fa', 'he'].includes(newLang);
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    document.documentElement.lang = newLang;
  }, []);

  return { t, lang, changeLanguage, isRTL: ['ar', 'ku', 'fa', 'he'].includes(lang) };
};

// دالة ترجمة مباشرة (للاستخدام خارج React components)
export const t = (key, fallback = null) => {
  const lang = typeof window !== 'undefined' ? localStorage.getItem('app_language') || 'ar' : 'ar';
  const langData = translations[lang] || translations.ar;
  return langData[key] || translations.ar[key] || fallback || key;
};

// تصدير الترجمات للاستخدام المباشر
export const getTranslations = (lang = null) => {
  const currentLang = lang || (typeof window !== 'undefined' ? localStorage.getItem('app_language') : 'ar') || 'ar';
  return translations[currentLang] || translations.ar;
};

export default translations;
