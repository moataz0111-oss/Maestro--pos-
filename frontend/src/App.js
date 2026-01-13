import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "./components/ui/sonner";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";

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
            <POS />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/tables" 
        element={
          <ProtectedRoute>
            <Tables />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/orders" 
        element={
          <ProtectedRoute>
            <Orders />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/inventory" 
        element={
          <ProtectedRoute>
            <Inventory />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/delivery" 
        element={
          <ProtectedRoute>
            <Delivery />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/settings" 
        element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/reports" 
        element={
          <ProtectedRoute>
            <Reports />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/expenses" 
        element={
          <ProtectedRoute>
            <Expenses />
          </ProtectedRoute>
        } 
      />
      {/* صفحة السائق - بدون حماية للوصول من الهاتف */}
      <Route path="/driver" element={<DriverPortal />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <div className="App" dir="rtl">
          <BrowserRouter>
            <AppRoutes />
            <Toaster position="top-center" richColors />
          </BrowserRouter>
        </div>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
