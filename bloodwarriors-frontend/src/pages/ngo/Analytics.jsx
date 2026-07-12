import { useState, useEffect, useMemo } from 'react';
import {
  BarChart3,
  Users,
  UserPlus,
  Droplet,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Clock,
  PieChart as PieChartIcon,
  ShieldCheck,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import api from '../../lib/api';
import { onDonorCreated } from '../../lib/donorEvents';

/* ============================================================
   Analytics — NGO Deep Data Analysis
   GET /analytics → live aggregations over the donor table
     · blood_type_distribution  → BarChart
     · registration_trend (7d)  → AreaChart
   "Red Love" aesthetic: gray-50 body, ruby-main accents,
   slate-nav headers, rs-card wrappers.
   ============================================================ */

const RUBY = '#C41E3A';

// Ruby + Slate categorical palette — assigned in fixed order, never cycled.
// Distinct hues (ruby → dark slate → mid slate → ruby-light) keep the pie
// slices separable for colour-vision-deficient viewers.
const DONOR_TYPE_COLORS = ['#C41E3A', '#1E293B', '#64748B', '#FF4C4C'];

// Normalise long blood-group labels ("O Positive") to compact chart ticks ("O+")
const BG_SHORT = {
  'A Positive': 'A+', 'A Negative': 'A-',
  'B Positive': 'B+', 'B Negative': 'B-',
  'AB Positive': 'AB+', 'AB Negative': 'AB-',
  'O Positive': 'O+', 'O Negative': 'O-',
};

function shortBg(label) {
  return BG_SHORT[label] || label;
}

export default function Analytics({ toast }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [latency, setLatency] = useState(null);

  const loadAnalytics = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await api.get('/analytics');
      setData(res.data);
      setLatency(res.latency ?? null);
    } catch {
      setError(true);
      setData(null);
      toast?.addToast(
        'Analytics service unreachable — start the backend to view live figures.',
        'warning',
        6000,
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
    // Live sync: re-fetch immediately when a donor is registered (this tab or
    // another), and when the operator returns to this tab, so the charts never
    // go stale without a manual refresh.
    const unsubscribe = onDonorCreated(() => loadAnalytics());
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadAnalytics();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Map blood_type_distribution object → array for Recharts
  const distributionData = useMemo(() => {
    if (!data?.blood_type_distribution) return [];
    return Object.entries(data.blood_type_distribution)
      .map(([type, count]) => ({ type: shortBg(type), fullType: type, count }))
      .sort((a, b) => b.count - a.count);
  }, [data]);

  // Map registration_trend → array with friendly day labels
  const trendData = useMemo(() => {
    if (!data?.registration_trend) return [];
    return data.registration_trend.map((row) => {
      const d = new Date(row.date);
      const label = Number.isNaN(d.getTime())
        ? row.date
        : d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
      return { label, count: row.count, date: row.date };
    });
  }, [data]);

  // Map donor_type_split → [{ name, value }] for the PieChart.
  // Accepts either an object ({ Regular: 40, ... }) or a pre-shaped array.
  const donorTypeData = useMemo(() => {
    const src = data?.donor_type_split;
    if (!src) return [];
    if (Array.isArray(src)) {
      return src
        .map((row) => ({
          name: row.name ?? row.type ?? row.label,
          value: Number(row.value ?? row.count ?? 0),
        }))
        .filter((row) => row.name != null);
    }
    return Object.entries(src).map(([name, value]) => ({ name, value: Number(value) }));
  }, [data]);

  // Map reliability_distribution buckets → array for the RadarChart.
  // Preserve a stable bucket order rather than object-key order.
  const reliabilityData = useMemo(() => {
    const src = data?.reliability_distribution;
    if (!src) return [];
    const ORDER = ['>80%', '50-80%', '<50%'];
    const asObj = Array.isArray(src)
      ? Object.fromEntries(
          src.map((row) => [row.bucket ?? row.name ?? row.label, row.value ?? row.count ?? 0]),
        )
      : src;
    const keys = ORDER.filter((k) => k in asObj);
    // Fall back to whatever keys exist if none match the canonical buckets.
    const finalKeys = keys.length ? keys : Object.keys(asObj);
    return finalKeys.map((bucket) => ({ bucket, count: Number(asObj[bucket]) || 0 }));
  }, [data]);

  const stats = [
    {
      label: 'Total Donors',
      value: data?.total_donors,
      icon: Users,
      accent: 'border-l-ruby-main',
      iconColor: 'text-ruby-main',
    },
    {
      label: 'New (last 7 days)',
      value: data?.recent_registrations,
      icon: UserPlus,
      accent: 'border-l-emerald-500',
      iconColor: 'text-emerald-500',
    },
    {
      label: 'Blood Groups Tracked',
      value: distributionData.length || undefined,
      icon: Droplet,
      accent: 'border-l-amber-500',
      iconColor: 'text-amber-500',
    },
  ];

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto animate-fade-in bg-gray-50">
      {/* ===== Header image ===== */}
      <img
        src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=1200"
        className="w-full h-48 object-cover rounded-md shadow-md mb-6"
        alt="Analytics"
      />

      {/* ===== Title row ===== */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-ruby-main flex items-center justify-center shadow-md flex-shrink-0">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-nav tracking-tight">
              Data Analytics
            </h1>
            <p className="text-sm text-muted">
              Live aggregations over the donor registry
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {latency !== null && !error && (
            <span className="flex items-center gap-1.5 text-xs text-muted">
              <Clock className="w-3.5 h-3.5" />
              <span className="tabular-nums">{latency}ms</span>
            </span>
          )}
          <button
            id="analytics-refresh-btn"
            onClick={loadAnalytics}
            disabled={loading}
            className="inline-flex items-center gap-2 text-sm font-semibold text-ruby-main px-3 py-2 rounded-md border border-ruby-main/30 bg-ruby-main/10 hover:bg-ruby-main/20 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* ===== Error banner ===== */}
      {error && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-amber-700">
                Analytics service unreachable
              </div>
              <p className="text-sm text-body mt-1 leading-relaxed">
                Couldn&apos;t reach <code className="font-mono text-amber-700">GET /analytics</code>.
                Start the FastAPI backend with{' '}
                <code className="font-mono text-amber-700">uvicorn app.main:app --reload</code> and
                hit Refresh.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ===== Loading state ===== */}
      {loading && !data && (
        <div className="flex flex-col items-center justify-center py-20 text-muted">
          <Loader2 className="w-8 h-8 animate-spin text-ruby-main mb-3" />
          <p className="text-sm">Loading live analytics…</p>
        </div>
      )}

      {/* ===== Stat cards ===== */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {stats.map((s) => {
            const Icon = s.icon;
            const display =
              s.value === undefined || s.value === null
                ? '---'
                : Number(s.value).toLocaleString();
            return (
              <div key={s.label} className={`rs-card border-l-4 ${s.accent} p-5`}>
                <div className="flex items-center justify-between mb-3">
                  <Icon className={`w-5 h-5 ${s.iconColor}`} />
                </div>
                <div className="text-2xl font-bold text-ink tabular-nums">{display}</div>
                <div className="text-sm text-muted mt-1">{s.label}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===== Blood Type Distribution — BarChart ===== */}
      {data && (
        <div className="rs-card p-5">
          <div className="flex items-center gap-2.5 mb-5">
            <Droplet className="w-5 h-5 text-ruby-main" />
            <h2 className="text-base font-semibold text-ink">
              Blood Type Distribution
            </h2>
          </div>
          {distributionData.length === 0 ? (
            <p className="text-sm text-muted py-12 text-center">
              No donor records yet — register donors to populate this chart.
            </p>
          ) : (
            <div className="w-full h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={distributionData} margin={{ top: 8, right: 8, left: -12, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis
                    dataKey="type"
                    tick={{ fill: '#475569', fontSize: 13, fontWeight: 600 }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: '#64748b', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(196, 30, 58, 0.06)' }}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.fullType || ''}
                    formatter={(value) => [value, 'Donors']}
                    contentStyle={{
                      borderRadius: 8,
                      border: '1px solid #e5e7eb',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      fontSize: 13,
                    }}
                  />
                  <Bar dataKey="count" name="Donors" fill={RUBY} radius={[3, 3, 0, 0]} maxBarSize={44} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ===== Deep Analytics — Donor Type Split + Reliability Distribution ===== */}
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart 1: Donor Type Split — PieChart */}
          <div className="rs-card p-5">
            <div className="flex items-center gap-2.5 mb-5">
              <PieChartIcon className="w-5 h-5 text-ruby-main" />
              <h2 className="text-base font-semibold text-ink">Donor Type Split</h2>
            </div>
            {donorTypeData.length === 0 ? (
              <p className="text-sm text-muted py-12 text-center">
                No donor-type data available yet.
              </p>
            ) : (
              <div className="w-full h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donorTypeData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      stroke="#ffffff"
                      strokeWidth={2}
                    >
                      {donorTypeData.map((entry, i) => (
                        <Cell
                          key={entry.name}
                          fill={DONOR_TYPE_COLORS[i % DONOR_TYPE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name) => [Number(value).toLocaleString(), name]}
                      contentStyle={{
                        borderRadius: 8,
                        border: '1px solid #e5e7eb',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        fontSize: 13,
                      }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      iconType="circle"
                      wrapperStyle={{ fontSize: 13, color: '#475569', paddingTop: 8 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Chart 2: Reliability Distribution — RadarChart */}
          <div className="rs-card p-5">
            <div className="flex items-center gap-2.5 mb-5">
              <ShieldCheck className="w-5 h-5 text-ruby-main" />
              <h2 className="text-base font-semibold text-ink">Reliability Distribution</h2>
            </div>
            {reliabilityData.length === 0 ? (
              <p className="text-sm text-muted py-12 text-center">
                No reliability data available yet.
              </p>
            ) : (
              <div className="w-full h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={reliabilityData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                    <PolarGrid stroke="#e5e7eb" />
                    <PolarAngleAxis
                      dataKey="bucket"
                      tick={{ fill: '#475569', fontSize: 13, fontWeight: 600 }}
                    />
                    <PolarRadiusAxis
                      allowDecimals={false}
                      tick={{ fill: '#64748b', fontSize: 11 }}
                      axisLine={false}
                    />
                    <Radar
                      name="Donors"
                      dataKey="count"
                      stroke={RUBY}
                      fill={RUBY}
                      fillOpacity={0.25}
                      strokeWidth={2}
                      dot={{ r: 4, fill: RUBY, strokeWidth: 0 }}
                    />
                    <Tooltip
                      formatter={(value) => [Number(value).toLocaleString(), 'Donors']}
                      contentStyle={{
                        borderRadius: 8,
                        border: '1px solid #e5e7eb',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        fontSize: 13,
                      }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== Registration Trend — AreaChart ===== */}
      {data && (
        <div className="rs-card p-5">
          <div className="flex items-center gap-2.5 mb-5">
            <BarChart3 className="w-5 h-5 text-ruby-main" />
            <h2 className="text-base font-semibold text-ink">
              Registration Trend — Last 7 Days
            </h2>
          </div>
          <div className="w-full h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 8, right: 8, left: -12, bottom: 4 }}>
                <defs>
                  <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={RUBY} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={RUBY} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#475569', fontSize: 12, fontWeight: 600 }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ stroke: RUBY, strokeWidth: 1, strokeDasharray: '4 4' }}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.date || ''}
                  formatter={(value) => [value, 'Registrations']}
                  contentStyle={{
                    borderRadius: 8,
                    border: '1px solid #e5e7eb',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    fontSize: 13,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  name="Registrations"
                  stroke={RUBY}
                  strokeWidth={2.5}
                  fill="url(#trendFill)"
                  dot={{ r: 3, fill: RUBY, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: RUBY, stroke: '#fff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Footer meta */}
      {data?.generated_at && (
        <p className="text-xs text-muted pb-4">
          Generated at {new Date(data.generated_at).toLocaleString('en-US', { hour12: false })} · RaktaSetu AI
        </p>
      )}
    </div>
  );
}
