import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from './store/authStore';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import TravelerDetailPage from './pages/TravelerDetailPage';
import TravelerManagementPage from './pages/TravelerManagementPage';
import AssignPickupPage from './pages/AssignPickupPage';
import DriversPage from './pages/DriversPage';
import OperatorProfilePage from './pages/OperatorProfilePage';
import DriverDetailPage from './pages/DriverDetailPage';
import LiveOperationsPage from './pages/LiveOperationsPage';
import LiveMapPage from './pages/LiveMapPage';
import RideRequestsPage from './pages/RideRequestsPage';
function AppContent() {
  const { checkAuth, initialized, user, operator } = useAuthStore();
  useEffect(() => { checkAuth(); }, []);
  if (!initialized) {
    return (
      <div className="min-h-screen bg-navy-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Initializing...</p>
        </div>
      </div>
    );
  }
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={user && operator ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/dashboard" element={<ProtectedRoute><Layout><DashboardPage /></Layout></ProtectedRoute>} />
        <Route path="/travelers/:id" element={<ProtectedRoute><Layout><TravelerDetailPage /></Layout></ProtectedRoute>} />
        <Route path="/assignments/new/:tripId" element={<ProtectedRoute><Layout><AssignPickupPage /></Layout></ProtectedRoute>} />
        <Route path="/drivers" element={<ProtectedRoute><Layout><DriversPage /></Layout></ProtectedRoute>} />
        <Route path="/drivers/:id" element={<ProtectedRoute><Layout><DriverDetailPage /></Layout></ProtectedRoute>} />
        <Route path="/travelers" element={<ProtectedRoute><Layout><TravelerManagementPage /></Layout></ProtectedRoute>} />
        <Route path="/live-map" element={<ProtectedRoute><Layout><LiveMapPage /></Layout></ProtectedRoute>} />
        <Route path="/ride-requests" element={<ProtectedRoute><Layout><RideRequestsPage /></Layout></ProtectedRoute>} />
        <Route path="/live" element={<ProtectedRoute><Layout><LiveOperationsPage /></Layout></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Layout><OperatorProfilePage /></Layout></ProtectedRoute>} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
export default function App() { return <AppContent />; }