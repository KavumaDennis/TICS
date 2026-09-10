import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Car,
  Radio,
  LogOut,
  Menu,
  X,
  Shield,
  UserCog,
} from 'lucide-react';
import { useState } from 'react';
import { useAuthStore } from '../store/authStore';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/travelers', label: 'Travelers', icon: Users },
  { path: '/live-map', label: 'Live Map', icon: Radio },
  { path: '/live', label: 'Operations', icon: Radio },
  { path: '/drivers', label: 'Drivers', icon: Car },
  { path: '/profile', label: 'My Profile', icon: UserCog },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { operator, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-navy-900 flex p-2">
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex lg:flex-col w-64 h-fit glass-sidebar rounded-2xl">
        <div className="p-5 border-b border-navy-700/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal-600 flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">TICS</h1>
              <p className="text-xs text-gray-400">Operator Dashboard</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-full text-sm font-medium transition-all duration-200 ${
                  active
                    ? 'bg-teal-600/10 text-teal-400 border border-teal-500/20'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-navy-700/50'
                }`}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t mt-20 border-navy-700">
          <div className="flex items-center gap-3 mb-3 px-2">
            <div className="w-8 h-8 rounded-full bg-teal-600/20 flex items-center justify-center">
              <span className="text-sm font-semibold text-teal-400">
                {operator?.name?.charAt(0) || 'O'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-200 truncate">
                {operator?.name || 'Operator'}
              </p>
              <p className="text-xs text-gray-500 truncate">{operator?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-400 hover:text-red-400 hover:bg-red-500/5 rounded-lg transition-all duration-200"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 glass-sidebar">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-lg font-bold text-white">TICS</h1>
          </div>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-2 text-gray-400 hover:text-white rounded-lg"
          >
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileOpen && (
          <div className="px-4 pb-4 space-y-1 glass-panel m-2 rounded-xl">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium ${
                    active
                      ? 'bg-teal-600/10 text-teal-400'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {item.label}
                </Link>
              );
            })}
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-4 py-3 text-sm text-gray-400 hover:text-red-400 rounded-lg"
            >
              <LogOut className="w-5 h-5" />
              Sign Out
            </button>
          </div>
        )}
      </div>

      {/* Main Content */}
      <main className="flex-1 lg:ml-0 pt-16 lg:pt-0">
        <div className="p-4 lg:pl-6 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}