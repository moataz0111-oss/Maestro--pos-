// مكون الترجمة التلقائية - يترجم أي نص عربي تلقائياً
import { useMemo } from 'react';

// قاموس الترجمات الشامل
const translationMap = {
  // ===== القوائم والتنقل =====
  'الرئيسية': { en: 'Dashboard', ku: 'سەرەکی' },
  'نقطة البيع': { en: 'POS', ku: 'فرۆشتن' },
  'نقاط البيع': { en: 'POS', ku: 'فرۆشتن' },
  'الطلبات': { en: 'Orders', ku: 'داواکاری' },
  'إدارة الطلبات': { en: 'Order Management', ku: 'بەڕێوەبردنی داواکاری' },
  'الطاولات': { en: 'Tables', ku: 'مێز' },
  'القائمة': { en: 'Menu', ku: 'لیست' },
  'المخزون': { en: 'Inventory', ku: 'کۆگا' },
  'التقارير': { en: 'Reports', ku: 'راپۆرت' },
  'المصاريف': { en: 'Expenses', ku: 'خەرجی' },
  'التوصيل': { en: 'Delivery', ku: 'گەیاندن' },
  'الإعدادات': { en: 'Settings', ku: 'ڕێکخستن' },
  'المطبخ': { en: 'Kitchen', ku: 'چێشتخانە' },
  'شاشة المطبخ': { en: 'Kitchen Display', ku: 'شاشەی چێشتخانە' },
  'الموارد البشرية': { en: 'HR', ku: 'کارمەندان' },
  'تسجيل الخروج': { en: 'Logout', ku: 'دەرچوون' },
  'تسجيل الدخول': { en: 'Login', ku: 'چوونەژوورەوە' },
  'التقارير الذكية': { en: 'Smart Reports', ku: 'راپۆرتی زیرەک' },
  'التقييمات': { en: 'Ratings', ku: 'هەڵسەنگاندن' },
  'المشتريات': { en: 'Purchases', ku: 'کڕین' },
  'المخزن والتصنيع': { en: 'Warehouse', ku: 'کۆگا' },
  'طلبات الفروع': { en: 'Branch Orders', ku: 'داواکاری لقەکان' },
  'تقارير المخزون': { en: 'Inventory Reports', ku: 'راپۆرتی کۆگا' },
  'الحجوزات': { en: 'Reservations', ku: 'حجز' },
  'سجل المكالمات': { en: 'Call Logs', ku: 'تۆماری پەیوەندی' },
  'برنامج الولاء': { en: 'Loyalty', ku: 'وەفاداری' },
  'الكوبونات': { en: 'Coupons', ku: 'کوپۆن' },
  
  // ===== أنواع الطلبات =====
  'داخل المطعم': { en: 'Dine In', ku: 'ناو چێشتخانە' },
  'محلي': { en: 'Dine In', ku: 'ناو چێشتخانە' },
  'سفري': { en: 'Takeaway', ku: 'بردن' },
  'توصيل': { en: 'Delivery', ku: 'گەیاندن' },
  'جميع الأنواع': { en: 'All Types', ku: 'هەموو جۆرەکان' },
  
  // ===== حالات الطلب =====
  'معلق': { en: 'Pending', ku: 'چاوەڕوان' },
  'قيد التحضير': { en: 'Preparing', ku: 'ئامادەکردن' },
  'جاهز': { en: 'Ready', ku: 'ئامادەیە' },
  'تم التسليم': { en: 'Delivered', ku: 'گەیەندرا' },
  'ملغي': { en: 'Cancelled', ku: 'هەڵوەشێنرا' },
  'مكتمل': { en: 'Completed', ku: 'تەواو' },
  
  // ===== الأزرار =====
  'حفظ': { en: 'Save', ku: 'هەڵگرتن' },
  'إلغاء': { en: 'Cancel', ku: 'هەڵوەشاندنەوە' },
  'حذف': { en: 'Delete', ku: 'سڕینەوە' },
  'تعديل': { en: 'Edit', ku: 'دەستکاری' },
  'إضافة': { en: 'Add', ku: 'زیادکردن' },
  'بحث': { en: 'Search', ku: 'گەڕان' },
  'فلتر': { en: 'Filter', ku: 'فلتەر' },
  'تصدير': { en: 'Export', ku: 'هەناردەکردن' },
  'طباعة': { en: 'Print', ku: 'چاپکردن' },
  'تأكيد': { en: 'Confirm', ku: 'دڵنیاکردنەوە' },
  'إغلاق': { en: 'Close', ku: 'داخستن' },
  'رجوع': { en: 'Back', ku: 'گەڕانەوە' },
  'التالي': { en: 'Next', ku: 'دواتر' },
  'السابق': { en: 'Previous', ku: 'پێشتر' },
  'تحديث': { en: 'Refresh', ku: 'نوێکردنەوە' },
  'نعم': { en: 'Yes', ku: 'بەڵێ' },
  'لا': { en: 'No', ku: 'نەخێر' },
  'تم': { en: 'Done', ku: 'تەواو' },
  'موافق': { en: 'OK', ku: 'باشە' },
  'عرض': { en: 'View', ku: 'بینین' },
  'المزيد': { en: 'More', ku: 'زیاتر' },
  'أقل': { en: 'Less', ku: 'کەمتر' },
  
  // ===== الرسائل =====
  'جاري التحميل...': { en: 'Loading...', ku: 'بارکردن...' },
  'جاري التحميل': { en: 'Loading', ku: 'بارکردن' },
  'لا توجد بيانات': { en: 'No data', ku: 'داتا نییە' },
  'تم بنجاح': { en: 'Success', ku: 'سەرکەوتوو' },
  'حدث خطأ': { en: 'Error', ku: 'هەڵە' },
  'تم الحفظ بنجاح': { en: 'Saved successfully', ku: 'بە سەرکەوتوویی هەڵگیرا' },
  'تم الحذف بنجاح': { en: 'Deleted successfully', ku: 'بە سەرکەوتوویی سڕایەوە' },
  'هل أنت متأكد؟': { en: 'Are you sure?', ku: 'دڵنیایت؟' },
  'لا توجد نتائج': { en: 'No results', ku: 'ئەنجام نییە' },
  'فشل في': { en: 'Failed to', ku: 'سەرنەکەوت' },
  
  // ===== نقطة البيع =====
  'السلة': { en: 'Cart', ku: 'سەبەتە' },
  'السلة فارغة': { en: 'Cart is empty', ku: 'سەبەتە بەتاڵە' },
  'الإجمالي': { en: 'Total', ku: 'کۆ' },
  'المجموع': { en: 'Subtotal', ku: 'کۆی فرعی' },
  'المجموع الفرعي': { en: 'Subtotal', ku: 'کۆی فرعی' },
  'خصم': { en: 'Discount', ku: 'داشکان' },
  'ضريبة': { en: 'Tax', ku: 'باج' },
  'نقدي': { en: 'Cash', ku: 'نەقد' },
  'بطاقة': { en: 'Card', ku: 'کارت' },
  'آجل': { en: 'Credit', ku: 'قەرز' },
  'طاولة': { en: 'Table', ku: 'مێز' },
  'العميل': { en: 'Customer', ku: 'کڕیار' },
  'اسم العميل': { en: 'Customer Name', ku: 'ناوی کڕیار' },
  'هاتف العميل': { en: 'Customer Phone', ku: 'تەلەفۆنی کڕیار' },
  'اختر طاولة': { en: 'Select Table', ku: 'مێز هەڵبژێرە' },
  'أضف للسلة': { en: 'Add to Cart', ku: 'زیادکردن بۆ سەبەتە' },
  'تفريغ السلة': { en: 'Clear Cart', ku: 'بەتاڵکردنی سەبەتە' },
  'إتمام الطلب': { en: 'Complete Order', ku: 'تەواوکردنی داواکاری' },
  'طريقة الدفع': { en: 'Payment Method', ku: 'شێوازی پارەدان' },
  'ملاحظات الطلب': { en: 'Order Notes', ku: 'تێبینی داواکاری' },
  'إرسال للمطبخ': { en: 'Send to Kitchen', ku: 'ناردن بۆ چێشتخانە' },
  'الطلبات المعلقة': { en: 'Pending Orders', ku: 'داواکاری چاوەڕوان' },
  'الفئات': { en: 'Categories', ku: 'پۆلەکان' },
  'المنتجات': { en: 'Products', ku: 'بەرهەمەکان' },
  'جميع الفئات': { en: 'All Categories', ku: 'هەموو پۆلەکان' },
  'بحث عن منتج...': { en: 'Search products...', ku: 'گەڕان بەدوای بەرهەم...' },
  'الكمية': { en: 'Quantity', ku: 'بڕ' },
  'السعر': { en: 'Price', ku: 'نرخ' },
  'الوردية': { en: 'Shift', ku: 'شیفت' },
  'فتح وردية': { en: 'Open Shift', ku: 'کردنەوەی شیفت' },
  'إغلاق الوردية': { en: 'Close Shift', ku: 'داخستنی شیفت' },
  'إغلاق الصندوق': { en: 'Close Register', ku: 'داخستنی سندوق' },
  'جميع الفروع': { en: 'All Branches', ku: 'هەموو لقەکان' },
  'اختر الفرع': { en: 'Select Branch', ku: 'لق هەڵبژێرە' },
  'عنوان التوصيل': { en: 'Delivery Address', ku: 'ناونیشانی گەیاندن' },
  
  // ===== المطبخ =====
  'جديد': { en: 'New', ku: 'نوێ' },
  'الكل': { en: 'All', ku: 'هەموو' },
  'لا توجد طلبات': { en: 'No orders', ku: 'داواکاری نییە' },
  'الطلبات الجديدة ستظهر هنا تلقائياً': { en: 'New orders will appear here automatically', ku: 'داواکاری نوێ لێرە دەردەکەوێ' },
  'جاهز للتسليم': { en: 'Ready', ku: 'ئامادەیە' },
  'طلب جديد!': { en: 'New Order!', ku: 'داواکاری نوێ!' },
  
  // ===== الطلبات =====
  'طلب': { en: 'Order', ku: 'داواکاری' },
  'رقم الطلب': { en: 'Order Number', ku: 'ژمارەی داواکاری' },
  'تاريخ الطلب': { en: 'Order Date', ku: 'بەرواری داواکاری' },
  'حالة الطلب': { en: 'Order Status', ku: 'حاڵەتی داواکاری' },
  'نوع الطلب': { en: 'Order Type', ku: 'جۆری داواکاری' },
  'إجمالي الطلب': { en: 'Order Total', ku: 'کۆی داواکاری' },
  'تفاصيل الطلب': { en: 'Order Details', ku: 'وردەکاری داواکاری' },
  'طلب جديد': { en: 'New Order', ku: 'داواکاری نوێ' },
  'تعديل الطلب': { en: 'Edit Order', ku: 'دەستکاری داواکاری' },
  'إلغاء الطلب': { en: 'Cancel Order', ku: 'هەڵوەشاندنەوەی داواکاری' },
  'طلبات اليوم': { en: 'Today\'s Orders', ku: 'داواکاری ئەمڕۆ' },
  
  // ===== التوصيل =====
  'السائقين': { en: 'Drivers', ku: 'شۆفێرەکان' },
  'سائق': { en: 'Driver', ku: 'شۆفێر' },
  'اسم السائق': { en: 'Driver Name', ku: 'ناوی شۆفێر' },
  'تعيين سائق': { en: 'Assign Driver', ku: 'دیاریکردنی شۆفێر' },
  'إضافة سائق': { en: 'Add Driver', ku: 'زیادکردنی شۆفێر' },
  'لا يوجد سائقين': { en: 'No drivers', ku: 'شۆفێر نییە' },
  'اختر سائق': { en: 'Select Driver', ku: 'شۆفێر هەڵبژێرە' },
  
  // ===== الطاولات =====
  'رقم الطاولة': { en: 'Table Number', ku: 'ژمارەی مێز' },
  'الطاولات المتاحة': { en: 'Available Tables', ku: 'مێزی بەردەست' },
  'الطاولات المشغولة': { en: 'Occupied Tables', ku: 'مێزی گیراو' },
  'إضافة طاولة': { en: 'Add Table', ku: 'زیادکردنی مێز' },
  'داخلي': { en: 'Inside', ku: 'ناوەوە' },
  'خارجي': { en: 'Outside', ku: 'دەرەوە' },
  
  // ===== المخزون =====
  'المخزون الحالي': { en: 'Current Stock', ku: 'کۆگای ئێستا' },
  'مخزون منخفض': { en: 'Low Stock', ku: 'کۆگای کەم' },
  'إضافة مخزون': { en: 'Add Stock', ku: 'زیادکردنی کۆگا' },
  'الوحدة': { en: 'Unit', ku: 'یەکە' },
  'المورد': { en: 'Supplier', ku: 'دابینکەر' },
  
  // ===== التقارير =====
  'تقرير يومي': { en: 'Daily Report', ku: 'راپۆرتی ڕۆژانە' },
  'تقرير المبيعات': { en: 'Sales Report', ku: 'راپۆرتی فرۆشتن' },
  'من تاريخ': { en: 'From Date', ku: 'لە بەروار' },
  'إلى تاريخ': { en: 'To Date', ku: 'تا بەروار' },
  'إجمالي المبيعات': { en: 'Total Sales', ku: 'کۆی فرۆشتن' },
  'إجمالي المصاريف': { en: 'Total Expenses', ku: 'کۆی خەرجی' },
  'إجمالي الأرباح': { en: 'Total Profit', ku: 'کۆی قازانج' },
  'صافي الربح': { en: 'Net Profit', ku: 'قازانجی خاوێن' },
  'متوسط الطلب': { en: 'Average Order', ku: 'تێکڕای داواکاری' },
  'عدد الطلبات': { en: 'Orders Count', ku: 'ژمارەی داواکاری' },
  'الأكثر مبيعاً': { en: 'Best Selling', ku: 'زۆرترین فرۆشتن' },
  'مبيعات اليوم': { en: 'Today\'s Sales', ku: 'فرۆشتنی ئەمڕۆ' },
  
  // ===== المصاريف =====
  'مصروف': { en: 'Expense', ku: 'خەرجی' },
  'إضافة مصروف': { en: 'Add Expense', ku: 'زیادکردنی خەرجی' },
  'إيجار': { en: 'Rent', ku: 'کرێ' },
  'رواتب': { en: 'Salaries', ku: 'موچە' },
  'صيانة': { en: 'Maintenance', ku: 'چاککردنەوە' },
  'أخرى': { en: 'Other', ku: 'تر' },
  
  // ===== الموظفين =====
  'موظف': { en: 'Employee', ku: 'کارمەند' },
  'الموظفين': { en: 'Employees', ku: 'کارمەندان' },
  'إضافة موظف': { en: 'Add Employee', ku: 'زیادکردنی کارمەند' },
  'الحضور': { en: 'Attendance', ku: 'ئامادەبوون' },
  'تسجيل حضور': { en: 'Check In', ku: 'تۆمارکردنی هاتن' },
  'تسجيل انصراف': { en: 'Check Out', ku: 'تۆمارکردنی ڕۆشتن' },
  'كشف الرواتب': { en: 'Payroll', ku: 'لیستی موچە' },
  
  // ===== الإعدادات =====
  'الإعدادات العامة': { en: 'General Settings', ku: 'ڕێکخستنی گشتی' },
  'إعدادات النظام': { en: 'System Settings', ku: 'ڕێکخستنی سیستەم' },
  'إعدادات الفرع': { en: 'Branch Settings', ku: 'ڕێکخستنی لق' },
  'اللغة': { en: 'Language', ku: 'زمان' },
  'العملة': { en: 'Currency', ku: 'دراو' },
  'البلد': { en: 'Country', ku: 'وڵات' },
  'المظهر': { en: 'Theme', ku: 'ڕواڵەت' },
  'الوضع الداكن': { en: 'Dark Mode', ku: 'دۆخی تاریک' },
  'الوضع الفاتح': { en: 'Light Mode', ku: 'دۆخی ڕووناک' },
  'حفظ إعدادات النظام': { en: 'Save System Settings', ku: 'هەڵگرتنی ڕێکخستنی سیستەم' },
  
  // ===== المستخدمين =====
  'المستخدمين': { en: 'Users', ku: 'بەکارهێنەران' },
  'اسم المستخدم': { en: 'Username', ku: 'ناوی بەکارهێنەر' },
  'كلمة المرور': { en: 'Password', ku: 'وشەی نهێنی' },
  'تغيير كلمة المرور': { en: 'Change Password', ku: 'گۆڕینی وشەی نهێنی' },
  'البريد الإلكتروني': { en: 'Email', ku: 'ئیمەیل' },
  'الهاتف': { en: 'Phone', ku: 'تەلەفۆن' },
  'الدور': { en: 'Role', ku: 'ڕۆڵ' },
  'الصلاحيات': { en: 'Permissions', ku: 'دەسەڵات' },
  'مدير': { en: 'Admin', ku: 'بەڕێوەبەر' },
  'كاشير': { en: 'Cashier', ku: 'کاشێر' },
  
  // ===== الفروع =====
  'فرع': { en: 'Branch', ku: 'لق' },
  'الفروع': { en: 'Branches', ku: 'لقەکان' },
  'اسم الفرع': { en: 'Branch Name', ku: 'ناوی لق' },
  'الفرع الرئيسي': { en: 'Main Branch', ku: 'لقی سەرەکی' },
  'إضافة فرع': { en: 'Add Branch', ku: 'زیادکردنی لق' },
  
  // ===== لوحة التحكم =====
  'مرحباً': { en: 'Welcome', ku: 'بەخێربێیت' },
  'نظرة عامة': { en: 'Overview', ku: 'پوختەی گشتی' },
  'الإجراءات السريعة': { en: 'Quick Actions', ku: 'کردارە خێراکان' },
  'إحصائيات سريعة': { en: 'Quick Stats', ku: 'ئامارە خێراکان' },
  'الإحصائيات': { en: 'Statistics', ku: 'ئامار' },
  'أحدث الطلبات': { en: 'Recent Orders', ku: 'داواکاری نوێ' },
  'أفضل المنتجات': { en: 'Top Products', ku: 'باشترین بەرهەم' },
  'الإيرادات': { en: 'Revenue', ku: 'داهات' },
  'الربح': { en: 'Profit', ku: 'قازانج' },
  'اليوم': { en: 'Today', ku: 'ئەمڕۆ' },
  'هذا الأسبوع': { en: 'This Week', ku: 'ئەم هەفتە' },
  'الأسبوع': { en: 'Week', ku: 'هەفتە' },
  'هذا الشهر': { en: 'This Month', ku: 'ئەم مانگ' },
  'الشهر': { en: 'Month', ku: 'مانگ' },
  'إدارة اليوم': { en: 'Today\'s Management', ku: 'بەڕێوەبردنی ئەمڕۆ' },
  
  // ===== أخرى =====
  'ملاحظات': { en: 'Notes', ku: 'تێبینی' },
  'الاسم': { en: 'Name', ku: 'ناو' },
  'العنوان': { en: 'Address', ku: 'ناونیشان' },
  'الحالة': { en: 'Status', ku: 'حاڵەت' },
  'النوع': { en: 'Type', ku: 'جۆر' },
  'المبلغ': { en: 'Amount', ku: 'بڕ' },
  'التاريخ': { en: 'Date', ku: 'بەروار' },
  'الوقت': { en: 'Time', ku: 'کات' },
  'الإجراءات': { en: 'Actions', ku: 'کردار' },
  'التفاصيل': { en: 'Details', ku: 'وردەکاری' },
  'تثبيت التطبيق': { en: 'Install App', ku: 'دامەزراندنی ئەپ' },
  'قائمة العملاء': { en: 'Customer Menu', ku: 'لیستی کڕیار' },
  'التنبيهات': { en: 'Notifications', ku: 'ئاگادارکردنەوە' },
  'طباعة الفاتورة': { en: 'Print Invoice', ku: 'چاپکردنی پسوولە' },
  
  // ===== SuperAdmin =====
  'لوحة تحكم المالك': { en: 'Owner Dashboard', ku: 'داشبۆردی خاوەن' },
  'جميع المطاعم': { en: 'All Restaurants', ku: 'هەموو چێشتخانەکان' },
  'إجمالي الإيرادات': { en: 'Total Revenue', ku: 'کۆی داهات' },
  'تحويل العملات': { en: 'Currency Conversion', ku: 'گۆڕینی دراو' },
  'سعر الصرف': { en: 'Exchange Rate', ku: 'ڕێژەی گۆڕین' },
  'أسعار حية': { en: 'Live Rates', ku: 'نرخی زیندوو' },
  'أسعار مخصصة': { en: 'Custom Rates', ku: 'نرخی تایبەت' },
  
  // ===== Login =====
  'تسجيل دخول': { en: 'Sign In', ku: 'چوونەژوورەوە' },
  'أدخل بريدك الإلكتروني': { en: 'Enter your email', ku: 'ئیمەیلەکەت بنووسە' },
  'أدخل كلمة المرور': { en: 'Enter password', ku: 'وشەی نهێنی بنووسە' },
  'تذكرني': { en: 'Remember me', ku: 'بمهێڵەوە' },
  'نسيت كلمة المرور؟': { en: 'Forgot password?', ku: 'وشەی نهێنیت بیرچووەتەوە؟' },
  'دخول': { en: 'Login', ku: 'چوونەژوورەوە' },
  'ليس لديك حساب؟': { en: 'Don\'t have an account?', ku: 'هەژمارت نییە؟' },
  'إنشاء حساب': { en: 'Create Account', ku: 'دروستکردنی هەژمار' },
  
  // ===== عبارات إضافية =====
  'تحديد الكل': { en: 'Select All', ku: 'هەموو هەڵبژێرە' },
  'حذف المحدد': { en: 'Delete Selected', ku: 'سڕینەوەی هەڵبژێردراو' },
  'تم إتمام الطلب': { en: 'Order Completed', ku: 'داواکاری تەواو بوو' },
  'تم إتمام الطلب من المطبخ': { en: 'Order completed from kitchen', ku: 'داواکاری لە چێشتخانە تەواو بوو' },
  'رقم جهاز التنبيه': { en: 'Buzzer Number', ku: 'ژمارەی ئامێری ئاگادارکردنەوە' },
  'تطبيق السائق': { en: 'Driver App', ku: 'ئەپی شۆفێر' },
};

// الحصول على اللغة الحالية
const getCurrentLang = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('app_language') || 'ar';
  }
  return 'ar';
};

// دالة الترجمة الرئيسية
export const translate = (text) => {
  if (!text || typeof text !== 'string') return text;
  
  const lang = getCurrentLang();
  if (lang === 'ar') return text; // اللغة العربية هي الأصلية
  
  // بحث مباشر
  if (translationMap[text]) {
    return translationMap[text][lang] || text;
  }
  
  // بحث بإزالة المسافات الزائدة
  const trimmed = text.trim();
  if (translationMap[trimmed]) {
    return translationMap[trimmed][lang] || text;
  }
  
  return text;
};

// Hook للاستخدام في المكونات
export const useAutoTranslation = () => {
  const lang = useMemo(() => getCurrentLang(), []);
  
  const t = useMemo(() => (text) => translate(text), []);
  
  return { t, lang, isRTL: ['ar', 'ku', 'fa', 'he'].includes(lang) };
};

// تصدير القاموس
export default translationMap;
