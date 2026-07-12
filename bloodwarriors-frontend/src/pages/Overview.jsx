import { useState, useEffect } from 'react';
import {
  Activity,
  Heart,
  Users,
  Zap,
  Database,
  ShieldCheck,
  AlertTriangle,
  TrendingUp,
  BarChart3,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from 'recharts';
import api from '../lib/api';

/* ============================================================
   Overview — NGO Command Center Dashboard (light enterprise)
   ============================================================ */

const DIAGNOSTICS = [
  { key: 'backend', label: 'Backend API' },
  { key: 'ml', label: 'ML Model' },
  { key: 'dpdp', label: 'DPDP Guard' },
  { key: 'version', label: 'API Version' },
];

// dot color intent → babu (ok) · hackberry (error) · amber-500 (warn)
const STAT_CARDS = [
  { label: 'Registered Donors', key: 'donors', icon: Users, accent: 'border-l-ruby-main', iconColor: 'text-ruby-main' },
  { label: 'Active Endpoints', value: '8', icon: Zap, accent: 'border-l-emerald-500', iconColor: 'text-emerald-500' },
  { label: 'AI Triage Engine', value: 'Groq LLaMA3', icon: Activity, accent: 'border-l-ruby-main', iconColor: 'text-ruby-main' },
  { label: 'Matching Model', value: 'LightGBM', icon: TrendingUp, accent: 'border-l-amber-500', iconColor: 'text-amber-500' },
  { label: 'Memory Graph', value: 'KùzuDB', icon: Database, accent: 'border-l-emerald-500', iconColor: 'text-emerald-500' },
  { label: 'Consent Protocol', value: 'DPDP 2023', icon: ShieldCheck, accent: 'border-l-emerald-500', iconColor: 'text-emerald-500' },
];

// Mock "Blood Type Supply vs Demand" dataset for the analytics chart
const SUPPLY_DEMAND = [
  { type: 'O+', supply: 120, demand: 80 },
  { type: 'O-', supply: 45, demand: 70 },
  { type: 'A+', supply: 95, demand: 60 },
  { type: 'A-', supply: 40, demand: 50 },
  { type: 'B+', supply: 70, demand: 55 },
  { type: 'B-', supply: 25, demand: 35 },
  { type: 'AB+', supply: 30, demand: 20 },
  { type: 'AB-', supply: 15, demand: 22 },
];

const PIPELINE = [
  'WhatsApp Intake',
  'Groq LLaMA3 Triage',
  'LightGBM Match',
  'KùzuDB Graph Memory',
  'DPDP Consent Gate',
  'Outreach Dispatch',
];

export default function Overview({ toast }) {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [donorCount, setDonorCount] = useState(null);
  const [lastCheck, setLastCheck] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Clock
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Health check + donor count
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await api.get('/');
        if (!cancelled) {
          setHealth(res.data);
          setLastCheck(new Date());
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setHealth(null);
          setLastCheck(new Date());
          setLoading(false);
          toast.addToast(
            'Backend unreachable — showing the last known status. All panels remain available.',
            'warning',
            6000,
          );
        }
      }
    };
    const loadDonors = async () => {
      try {
        const res = await api.get('/donors');
        if (!cancelled) setDonorCount(res.data.total ?? 0);
      } catch {
        if (!cancelled) setDonorCount(null);
      }
    };
    check();
    loadDonors();
    return () => { cancelled = true; };
  }, []);

  const isOnline = health?.status === 'healthy';

  const diagnosticValue = (key) => {
    if (loading) return { value: '…', dot: 'bg-muted-soft' };
    if (key === 'backend')
      return isOnline
        ? { value: 'Online', dot: 'bg-babu' }
        : { value: 'Offline', dot: 'bg-hackberry' };
    if (key === 'ml')
      return isOnline && health.ml_model_loaded
        ? { value: 'Loaded', dot: 'bg-babu' }
        : { value: 'Not loaded', dot: 'bg-amber-500' };
    if (key === 'dpdp') return { value: 'Active', dot: 'bg-babu' };
    if (key === 'version')
      return { value: isOnline ? `v${health.version}` : 'v1.0.0', dot: isOnline ? 'bg-babu' : 'bg-muted-soft' };
    return { value: '—', dot: 'bg-muted-soft' };
  };

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto animate-fade-in">
      {/* ===== Banner Header — image + dark overlay ===== */}
      <div className="relative overflow-hidden rounded-md shadow-lg">
        <img
          src="https://images.unsplash.com/photo-1516549655169-df83a0774514?q=80&w=1200"
          alt="Medical command center"
          className="absolute inset-0 w-full h-full object-cover z-0"
        />
        <div className="absolute inset-0 bg-slate-nav/80 z-10" />
        <div className="relative z-20 flex items-center justify-between px-8 py-10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-md bg-ruby-main flex items-center justify-center flex-shrink-0 shadow-md">
              <Heart className="w-6 h-6 text-white" fill="currentColor" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white tracking-tight">
                NGO Command &amp; Analytics
              </h1>
              <p className="text-sm text-slate-200 mt-1">
                Emergency blood coordination — live operations dashboard
              </p>
            </div>
          </div>
          <div className="text-right hidden sm:block">
            <div className="text-xs text-slate-300 uppercase tracking-wide">System Clock</div>
            <div className="text-2xl font-bold text-white tabular-nums">
              {currentTime.toLocaleTimeString('en-US', { hour12: false })}
            </div>
            <div className="text-xs text-slate-300">
              {currentTime.toLocaleDateString('en-US', {
                weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
              })}
            </div>
          </div>
        </div>
      </div>

      {/* System Diagnostics */}
      <div className="rs-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-ink">System Diagnostics</h2>
          <span className="flex items-center gap-2 text-sm font-medium">
            <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-babu' : loading ? 'bg-muted-soft' : 'bg-hackberry'}`} />
            <span className={isOnline ? 'text-babu' : loading ? 'text-muted' : 'text-hackberry'}>
              System Status: {loading ? 'Checking…' : isOnline ? 'Online' : 'Offline'}
            </span>
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {DIAGNOSTICS.map((m) => {
            const { value, dot } = diagnosticValue(m.key);
            return (
              <div key={m.key} className="flex items-center gap-3 p-3 rounded-md bg-hof">
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dot}`} />
                <div className="min-w-0">
                  <div className="text-xs text-muted truncate">{m.label}</div>
                  <div className="text-sm font-semibold text-ink truncate">{value}</div>
                </div>
              </div>
            );
          })}
        </div>
        {lastCheck && (
          <p className="text-xs text-muted mt-4">
            Last health check: {lastCheck.toLocaleTimeString('en-US', { hour12: false })}
          </p>
        )}
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {STAT_CARDS.map((card) => {
          const Icon = card.icon;
          const value =
            card.key === 'donors'
              ? (donorCount === null ? '---' : donorCount.toLocaleString())
              : card.value;
          return (
            <div key={card.label} className={`rs-card border-l-4 ${card.accent} p-5`}>
              <div className="flex items-center justify-between mb-3">
                <Icon className={`w-5 h-5 ${card.iconColor}`} />
              </div>
              <div className="text-xl font-bold text-ink">{value}</div>
              <div className="text-sm text-muted mt-1">{card.label}</div>
            </div>
          );
        })}
      </div>

      {/* ===== Data Analytics — Supply vs Demand ===== */}
      <div className="rs-card p-5">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <BarChart3 className="w-5 h-5 text-ruby-main" />
            <h2 className="text-base font-semibold text-ink">
              Blood Type Supply vs Demand
            </h2>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-emerald-500" /> Supply (units)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-ruby-main" /> Demand (units)
            </span>
          </div>
        </div>
        <div className="w-full h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={SUPPLY_DEMAND} margin={{ top: 8, right: 8, left: -12, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis
                dataKey="type"
                tick={{ fill: '#475569', fontSize: 13, fontWeight: 600 }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#64748b', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: 'rgba(196, 30, 58, 0.06)' }}
                contentStyle={{
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  fontSize: 13,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 13, fontWeight: 600, paddingTop: 8 }} />
              <Bar dataKey="supply" name="Supply" fill="#10B981" radius={[3, 3, 0, 0]} maxBarSize={38} />
              <Bar dataKey="demand" name="Demand" fill="#C41E3A" radius={[3, 3, 0, 0]} maxBarSize={38} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Architecture Pipeline */}
      <div className="rs-card p-5">
        <h2 className="text-base font-semibold text-ink mb-4">Architecture Pipeline</h2>
        <div className="flex flex-wrap items-center gap-2">
          {PIPELINE.map((stage, i) => (
            <div key={stage} className="flex items-center gap-2">
              <span className="px-3 py-1.5 rounded-full bg-hof border border-hairline text-sm font-medium text-body">
                {stage}
              </span>
              {i < PIPELINE.length - 1 && (
                <span className="text-muted-soft" aria-hidden="true">→</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Offline Warning */}
      {!isOnline && !loading && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-amber-700">Backend offline</div>
              <p className="text-sm text-body mt-1 leading-relaxed">
                The RaktaSetu backend API isn&apos;t reachable right now. Panels stay available with the last known
                data. Start the backend with{' '}
                <code className="font-mono text-amber-700">uvicorn app.main:app --reload</code> to restore live
                connectivity.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-xs text-muted pb-4">
        RaktaSetu AI · Emergency blood coordination framework
      </div>
    </div>
  );
}
