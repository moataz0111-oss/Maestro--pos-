import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "./components/ui/sonner";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { BranchProvider } from "./context/BranchContext";
import ErrorBoundary from "./components/ErrorBoundary";

// Pages
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import POS from "./pages/POS";
import Tables from "./pages/Tables";
import Orders from "./pages/Orders";
import Inventory from "./pages/Inventory";
import Delivery from "./pages/Delivery";
import Settings from "./pages/Settings";
import Reports from "./pages/Reports";
import Expenses from "./pages/Expenses";
import DriverPortal from "./pages/DriverPortal";
import SuperAdmin from "./pages/SuperAdmin";
import CallLogs from "./pages/CallLogs";
import InstallApp from "./pages/InstallApp";
import HR from "./pages/HR";
import WarehouseTransfers from "./pages/WarehouseTransfers";
import KitchenDisplay from "./pages/KitchenDisplay";
import Loyalty from "./pages/Loyalty";
import Recipes from "./pages/Recipes";
// Invoices page removed as per user request
// import Invoices from "./pages/Invoices";
import Coupons from "./pages/Coupons";
import PayrollPrint from "./pages/PayrollPrint";
import Reservations from "./pages/Reservations";
// import Reviews from "./pages/Reviews"; // تم حذفها
import SmartReports from "./pages/SmartReports";
import Purchasing from "./pages/Purchasing";
import BranchOrders from "./pages/BranchOrders";
import SystemAdmin from "./pages/SystemAdmin";
import CustomerMenu from "./pages/CustomerMenu";
import CustomerInstall from "./pages/CustomerInstall";
import PurchasesPage from "./pages/PurchasesPage";
import WarehouseManufacturing from "./pages/WarehouseManufacturing";
import InventoryReports from "./pages/InventoryReports";

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
    window.location.href = '/driver';
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
      {/* صفحة السائق - بدون حماية للوصول من الهاتف */}
      <Route path="/driver" element={<DriverPortal />} />
      {/* صفحة Super Admin - لوحة تحكم المالك */}
      <Route path="/super-admin" element={<SuperAdmin />} />
      {/* صفحة إدارة النظام */}
      <Route path="/system-admin" element={<ProtectedRoute><SystemAdmin /></ProtectedRoute>} />
      {/* قائمة العملاء - بدون حماية */}
      <Route path="/menu/:tenantId" element={<CustomerMenu />} />
      <Route path="/install-app" element={<CustomerInstall />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
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
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
