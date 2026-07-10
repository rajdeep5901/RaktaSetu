import { useState, useEffect, useMemo } from 'react';
import { Routes, Route, NavLink, useLocation, Outlet, Navigate } from 'react-router-dom';
import {
  Activity,
  Crosshair,
  Grid3X3,
  MessageSquareCode,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Shield,
  Heart,
  LogOut,
} from 'lucide-react';

import { useToast, ToastContainer } from './components/Toast';
import { useAuth } from './lib/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

import Landing from './pages/Landing';
import Overview from './pages/Overview';
import Triage from './pages/ngo/Triage';
import MatchMatrix from './pages/ngo/MatchMatrix';
import Analytics from './pages/ngo/Analytics';
import Chat from './pages/ngo/Chat';
import Register from './pages/donor/Register';
import DonorChat from './pages/donor/DonorChat';

/* ============================================================
   RaktaSetu AI — App Shell
   Split architecture:
     / → Landing (fullscreen, no sidebar)
     /donor/* → Donor pages (minimal header, no sidebar)
     /ngo/* → NGO Command Center (full sidebar + shell)
   ============================================================ */

const NGO_NAV_ITEMS = [
  { path: '/ngo/overview', label: 'Overview', icon: Activity, section: 'COMMAND' },
  { path: '/ngo/triage', label: 'AI Triage', icon: Crosshair, section: 'COMMAND' },
  { path: '/ngo/match', label: 'Match Matrix', icon: Grid3X3, section: 'COMMAND' },
  { path: '/ngo/analytics', label: 'Data Analytics', icon: BarChart3, section: 'COMMAND' },
  { path: '/ngo/chat', label: 'RAG Chat', icon: MessageSquareCode, section: 'COMMAND' },
];

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/* ============================================================
   NgoLayout — Sidebar + shell wrapping all /ngo/* routes
   ============================================================ */
function NgoLayout({ toast }) {
  const location = useLocation();
  const { logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [uptimeSeconds, setUptimeSeconds] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setUptimeSeconds((prev) => prev + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const sections = useMemo(() => {
    const grouped = {};
    NGO_NAV_ITEMS.forEach((item) => {
      if (!grouped[item.section]) grouped[item.section] = [];
      grouped[item.section].push(item);
    });
    return grouped;
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* ========== LEFT SIDEBAR ========== */}
      <aside
        className={`flex flex-col bg-slate-nav text-white transition-all duration-300 ease-in-out flex-shrink-0 ${
          collapsed ? 'w-[72px]' : 'w-[248px]'
        }`}
      >
        {/* Logo / Brand */}
        <div className="flex items-center gap-3 px-4 h-16 flex-shrink-0">
          <div className="w-8 h-8 rounded-md bg-ruby-main flex items-center justify-center flex-shrink-0">
            <Heart className="w-4 h-4 text-white" fill="currentColor" />
          </div>
          {!collapsed && (
            <h1 className="text-lg font-bold text-white tracking-tight leading-none">
              RaktaSetu
            </h1>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-5">
          {Object.entries(sections).map(([section, items]) => (
            <div key={section}>
              {!collapsed && (
                <div className="px-3 mb-1.5 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
                  {section}
                </div>
              )}
              <div className="space-y-0.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      id={`nav-${item.path.replace(/\//g, '-').replace(/^-/, '')}`}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-semibold transition-all duration-150 group relative ${
                        isActive
                          ? 'bg-ruby-main text-white shadow-md'
                          : 'text-slate-300 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <Icon
                        className={`w-[18px] h-[18px] flex-shrink-0 ${
                          isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'
                        }`}
                      />
                      {!collapsed && <span>{item.label}</span>}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom: Uptime + controls */}
        <div className="border-t border-white/10 p-3 flex-shrink-0">
          {/* Uptime */}
          <div className={`flex items-center gap-2 mb-3 ${collapsed ? 'justify-center' : ''}`}>
            <div className="w-2 h-2 rounded-full flex-shrink-0 bg-emerald-400" />
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-slate-400 uppercase tracking-wide">
                  Uptime
                </div>
                <div className="text-xs font-mono text-slate-200">
                  {formatUptime(uptimeSeconds)}
                </div>
              </div>
            )}
          </div>

          {/* Collapse Toggle */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center py-2 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-all duration-150"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            id="sidebar-toggle"
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>

          {/* Sign Out */}
          {!collapsed && (
            <button
              onClick={logout}
              id="ngo-logout-btn"
              className="w-full flex items-center justify-center gap-2 mt-2 py-2 rounded-md text-sm font-semibold text-slate-300 hover:text-white hover:bg-ruby-main transition-all duration-150"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          )}
        </div>

        {/* Compliance Badge */}
        {!collapsed && (
          <div className="px-3 pb-4">
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-white/5">
              <Shield className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
              <span className="text-[11px] font-medium text-slate-300">
                DPDP 2023 Compliant
              </span>
            </div>
          </div>
        )}
      </aside>

      {/* ========== MAIN CONTENT ========== */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden relative bg-gray-50">
        <div className="relative h-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

/* ============================================================
   App — Top-level Router
   ============================================================ */
export default function App() {
  const toast = useToast();

  return (
    <>
      <Routes>
        {/* Fullscreen routes (no sidebar) */}
        <Route path="/" element={<Landing toast={toast} />} />

        {/* Donor routes (no sidebar, minimal chrome) */}
        <Route path="/donor/register" element={<Register toast={toast} />} />
        <Route path="/donor/chat" element={<DonorChat toast={toast} />} />

        {/* NGO routes (protected, with sidebar shell) */}
        <Route
          path="/ngo"
          element={
            <ProtectedRoute>
              <NgoLayout toast={toast} />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/ngo/overview" replace />} />
          <Route path="overview" element={<Overview toast={toast} />} />
          <Route path="triage" element={<Triage toast={toast} />} />
          <Route path="match" element={<MatchMatrix toast={toast} />} />
          <Route path="analytics" element={<Analytics toast={toast} />} />
          <Route path="chat" element={<Chat toast={toast} />} />
        </Route>
      </Routes>

      {/* Toast layer */}
      <ToastContainer toasts={toast.toasts} removeToast={toast.removeToast} />
    </>
  );
}
