import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { canWrite } from './utils/permissions';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import Vendors from './pages/Vendors';
import VendorDetail from './pages/VendorDetail';
import PurchaseOrders from './pages/PurchaseOrders';
import PurchaseOrderDetail from './pages/PurchaseOrderDetail';
import NewPurchaseOrder from './pages/NewPurchaseOrder';
import Invoices from './pages/Invoices';
import InvoiceDetail from './pages/InvoiceDetail';
import UploadInvoice from './pages/UploadInvoice';

function PrivateRoute({ children }) {
  const { user } = useAuth();
  return user ? <Layout>{children}</Layout> : <Navigate to="/login" replace />;
}

// Same as PrivateRoute, but also requires accountant/admin — viewers are bounced
// back to the resource's list page. The backend enforces this independently
// (see backend/src/routes/*Routes.js); this just avoids showing a form a
// viewer's submit would 403 on.
function WriteRoute({ children, fallback }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!canWrite(user)) return <Navigate to={fallback} replace />;
  return <Layout>{children}</Layout>;
}

function HomeRoute() {
  const { user } = useAuth();
  return user ? <Layout><Dashboard /></Layout> : <Landing />;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <Register />} />
      <Route path="/forgot-password" element={user ? <Navigate to="/" replace /> : <ForgotPassword />} />
      <Route path="/reset-password/:token" element={user ? <Navigate to="/" replace /> : <ResetPassword />} />
      <Route path="/vendors" element={<PrivateRoute><Vendors /></PrivateRoute>} />
      <Route path="/vendors/:id" element={<PrivateRoute><VendorDetail /></PrivateRoute>} />
      <Route path="/purchase-orders" element={<PrivateRoute><PurchaseOrders /></PrivateRoute>} />
      <Route path="/purchase-orders/new" element={<WriteRoute fallback="/purchase-orders"><NewPurchaseOrder /></WriteRoute>} />
      <Route path="/purchase-orders/:id" element={<PrivateRoute><PurchaseOrderDetail /></PrivateRoute>} />
      <Route path="/invoices" element={<PrivateRoute><Invoices /></PrivateRoute>} />
      <Route path="/invoices/:id" element={<PrivateRoute><InvoiceDetail /></PrivateRoute>} />
      <Route path="/upload" element={<WriteRoute fallback="/invoices"><UploadInvoice /></WriteRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
