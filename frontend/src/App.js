import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "./components/ui/sonner";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { BranchProvider } from "./context/BranchContext";
import { CurrencyProvider } from "./context/CurrencyContext";
import { LanguageProvider } from "./context/LanguageContext";
import ErrorBoundary from "./components/ErrorBoundary";
import React, { Suspense, lazy } from "react";
import { t } from "./utils/translations";

// Loading Component
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen bg-background">
    <div className="flex flex-col items-center gap-4">
      <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      <p className="text-muted-foreground">{t('loading')}</p>
    </div>
  </div>
);

// Lazy loaded pages - تحميل الصفحات عند الحاجة فقط
const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const POS = lazy(() => import("./pages/POS"));
const Tables = lazy(() => import("./pages/Tables"));
const Orders = lazy(() => import("./pages/Orders"));
const Inventory = lazy(() => import("./pages/Inventory"));
const Delivery = lazy(() => import("./pages/Delivery"));
const Settings = lazy(() => import("./pages/Settings"));
const Reports = lazy(() => import("./pages/Reports"));
const Expenses = lazy(() => import("./pages/Expenses"));
// DriverPortal تم إزالته ودمجه في DriverApp
const SuperAdmin = lazy(() => import("./pages/SuperAdmin"));
const CallLogs = lazy(() => import("./pages/CallLogs"));
const InstallApp = lazy(() => import("./pages/InstallApp"));
const HR = lazy(() => import("./pages/HR"));
const WarehouseTransfers = lazy(() => import("./pages/WarehouseTransfers"));
const KitchenDisplay = lazy(() => import("./pages/KitchenDisplay"));
const Loyalty = lazy(() => import("./pages/Loyalty"));
const Recipes = lazy(() => import("./pages/Recipes"));
const Coupons = lazy(() => import("./pages/Coupons"));
const PayrollPrint = lazy(() => import("./pages/PayrollPrint"));
const Reservations = lazy(() => import("./pages/Reservations"));
const SmartReports = lazy(() => import("./pages/SmartReports"));
const Purchasing = lazy(() => import("./pages/Purchasing"));
const BranchOrders = lazy(() => import("./pages/BranchOrders"));
const SystemAdmin = lazy(() => import("./pages/SystemAdmin"));
const CustomerMenu = lazy(() => import("./pages/CustomerMenu"));
const CustomerInstall = lazy(() => import("./pages/CustomerInstall"));
const RestaurantSelector = lazy(() => import("./pages/RestaurantSelector"));
const PurchasesPage = lazy(() => import("./pages/PurchasesPage"));
const Ratings = lazy(() => import("./pages/Ratings"));
const DriverApp = lazy(() => import("./pages/DriverApp"));
const WarehouseManufacturing = lazy(() => import("./pages/WarehouseManufacturing"));
const InventoryReports = lazy(() => import("./pages/InventoryReports"));

// Components
import IncomingCallPopup from "./components/IncomingCallPopup";

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();
  
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
  
  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }
  
  // توجيه مستخدمي الديليفري لبوابة السائق فقط إذا كانوا يحاولون الوصول للوحة التحكم
  // ولكن نسمح لهم بالبقاء في صفحة تسجيل الدخول العادية
  if (user?.role === 'delivery') {
    // تسجيل الخروج من النظام الرئيسي وتوجيه للسائق
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/driver-app';
    return null;
  }
  
  return children;
};

// Permission Route - للتحقق من صلاحية الوصول للصفحة
const PermissionRoute = ({ children, permission }) => {
  const { hasPermission, user } = useAuth();
  
  // المدير (admin) لديه جميع الصلاحيات
  if (user?.role === 'admin' || user?.role === 'super_admin') {
    return children;
  }
  
  // مدير الفرع لديه معظم الصلاحيات
  if (user?.role === 'branch_manager') {
    return children;
  }
  
  // التحقق من الصلاحية
  if (!hasPermission(permission)) {
    return <Navigate to="/" />;
  }
  
  return children;
};

// Public Route (redirect to home if authenticated)
const PublicRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();
  
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
  
  // إذا كان مستخدم delivery، لا نعتبره authenticated للنظام الرئيسي
  if (isAuthenticated && user?.role === 'delivery') {
    return children;
  }
  
  return isAuthenticated ? <Navigate to="/" /> : children;
};

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route 
          path="/login" 
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          } 
        />
      <Route 
        path="/" 
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/pos" 
        element={
          <ProtectedRoute>
            <PermissionRoute permission="pos">
              <POS />
            </PermissionRoute>
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/tables" 
        element={
          <ProtectedRoute>
            <PermissionRoute permission="tables">
              <Tables />
            </PermissionRoute>
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/orders" 
        element={
          <ProtectedRoute>
            <PermissionRoute permission="orders">
              <Orders />
            </PermissionRoute>
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/inventory" 
        element={
          <ProtectedRoute>
            <PermissionRoute permission="inventory">
              <Inventory />
            </PermissionRoute>
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/delivery" 
        element={
          <ProtectedRoute>
            <PermissionRoute permission="delivery">
              <Delivery />
            </PermissionRoute>
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/settings" 
        element={
          <ProtectedRoute>
            <PermissionRoute permission="settings">
              <Settings />
            </PermissionRoute>
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/reports" 
        element={
          <ProtectedRoute>
            <PermissionRoute permission="reports">
              <Reports />
            </PermissionRoute>
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/ratings" 
        element={
          <ProtectedRoute>
            <Ratings />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/expenses" 
        element={
          <ProtectedRoute>
            <PermissionRoute permission="expenses">
              <Expenses />
            </PermissionRoute>
          </ProtectedRoute>
        } 
      />
      {/* سجل المكالمات */}
      <Route 
        path="/call-logs" 
        element={
          <ProtectedRoute>
            <CallLogs />
          </ProtectedRoute>
        } 
      />
      {/* إدارة الموارد البشرية */}
      <Route 
        path="/hr" 
        element={
          <ProtectedRoute>
            <HR />
          </ProtectedRoute>
        } 
      />
      {/* إدارة المخزون والتحويلات */}
      <Route 
        path="/warehouse" 
        element={
          <ProtectedRoute>
            <WarehouseTransfers />
          </ProtectedRoute>
        } 
      />
      {/* شاشة المطبخ */}
      <Route 
        path="/kitchen" 
        element={
          <ProtectedRoute>
            <KitchenDisplay />
          </ProtectedRoute>
        } 
      />
      {/* برنامج الولاء */}
      <Route 
        path="/loyalty" 
        element={
          <ProtectedRoute>
            <Loyalty />
          </ProtectedRoute>
        } 
      />
      {/* الوصفات والمواد الخام */}
      <Route 
        path="/recipes" 
        element={
          <ProtectedRoute>
            <Recipes />
          </ProtectedRoute>
        } 
      />
      {/* الفواتير والطباعة - تم إزالتها حسب طلب المستخدم */}
      {/* الكوبونات والعروض */}
      <Route 
        path="/coupons" 
        element={
          <ProtectedRoute>
            <Coupons />
          </ProtectedRoute>
        } 
      />
      {/* طباعة كشف الراتب */}
      <Route 
        path="/payroll/print/:payrollId" 
        element={
          <ProtectedRoute>
            <PayrollPrint />
          </ProtectedRoute>
        } 
      />
      {/* الحجوزات */}
      <Route 
        path="/reservations" 
        element={
          <ProtectedRoute>
            <Reservations />
          </ProtectedRoute>
        } 
      />
      {/* التقييمات - تم حذفها */}
      {/* التقارير الذكية */}
      <Route 
        path="/smart-reports" 
        element={
          <ProtectedRoute>
            <SmartReports />
          </ProtectedRoute>
        } 
      />
      {/* المشتريات */}
      <Route 
        path="/purchasing" 
        element={
          <ProtectedRoute>
            <Purchasing />
          </ProtectedRoute>
        } 
      />
      {/* طلبات الفروع */}
      <Route 
        path="/branch-orders" 
        element={
          <ProtectedRoute>
            <BranchOrders />
          </ProtectedRoute>
        } 
      />
      {/* المشتريات الجديدة */}
      <Route 
        path="/purchases-new" 
        element={
          <ProtectedRoute>
            <PurchasesPage />
          </ProtectedRoute>
        } 
      />
      {/* المخزن والتصنيع */}
      <Route 
        path="/warehouse-manufacturing" 
        element={
          <ProtectedRoute>
            <WarehouseManufacturing />
          </ProtectedRoute>
        } 
      />
      {/* تقارير المخزون */}
      <Route 
        path="/inventory-reports" 
        element={
          <ProtectedRoute>
            <InventoryReports />
          </ProtectedRoute>
        } 
      />
      {/* صفحة Super Admin - لوحة تحكم المالك */}
      <Route path="/super-admin" element={<SuperAdmin />} />
      {/* صفحة إدارة النظام */}
      <Route path="/system-admin" element={<ProtectedRoute><SystemAdmin /></ProtectedRoute>} />
      {/* قائمة العملاء - بدون حماية */}
      <Route path="/menu" element={<RestaurantSelector />} />
      <Route path="/menu/:tenantId" element={<CustomerMenu />} />
      <Route path="/install-app" element={<CustomerInstall />} />
      {/* تطبيق السائق - بدون حماية */}
      <Route path="/driver-app" element={<DriverApp />} />
      <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <CurrencyProvider>
            <BranchProvider>
              <div className="App" dir="rtl">
                <BrowserRouter>
                  <AppRoutes />
                  <Toaster position="top-center" richColors />
                  {/* Incoming Call Popup - يظهر في جميع الصفحات */}
                  <IncomingCallPopup />
                </BrowserRouter>
              </div>
            </BranchProvider>
          </CurrencyProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
