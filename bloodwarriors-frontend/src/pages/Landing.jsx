import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import ParticleGraph from '../components/ParticleGraph';
import {
  Heart,
  Shield,
  Search,
  Lock,
  Loader2,
  AlertTriangle,
  ShieldCheck,
  Eye,
  EyeOff,
  X,
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';

/* ============================================================
   Landing — Interactive graph-topology hero
   ============================================================ */

/* Floating stat cards overlaid above the live node graph — each one
   frames a facet of the KùzuDB-backed matching engine. */
const STATS = [
  { value: '7,000+', label: 'Active Nodes' },
  { value: 'Sub-second', label: 'Hybrid Ranking' },
  { value: 'DPDP 2023', label: 'Secure' },
];

export default function Landing({ toast }) {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  const openLogin = () => {
    if (isAuthenticated) {
      navigate('/ngo/overview');
    } else {
      setShowModal(true);
      setAuthError('');
      setPasscode('');
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!passcode.trim() || authLoading) return;

    setAuthLoading(true);
    setAuthError('');

    const result = await login(passcode.trim());

    if (result.success) {
      setShowModal(false);
      toast.addToast('Signed in. Welcome to the Command Center.', 'success');
      navigate('/ngo/overview');
    } else {
      setAuthError(result.error);
    }
    setAuthLoading(false);
  };

  return (
    <div className="min-h-screen bg-cloud text-ink flex flex-col">
      {/* ==================== TOP NAV ==================== */}
      <nav className="flex items-center justify-between px-6 md:px-12 h-20 bg-slate-nav flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-md bg-ruby-main flex items-center justify-center">
            <Heart className="w-4.5 h-4.5 text-white" fill="currentColor" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white">RaktaSetu</span>
        </div>
        <button
          id="nav-signin"
          onClick={openLogin}
          className="text-sm font-bold uppercase tracking-wide text-white hover:text-ruby-light transition-colors"
        >
          Sign In
        </button>
      </nav>

      {/* ==================== HERO — live graph-topology banner ==================== */}
      <main className="flex-1">
        <section className="relative w-full overflow-hidden bg-slate-nav">
          {/* Medical photo — demoted to a subtle depth texture */}
          <img
            src="https://images.unsplash.com/photo-1615461066841-6116e61058f4?q=80&w=1600"
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover opacity-20 mix-blend-overlay z-0"
          />
          {/* Interactive KùzuDB node-graph — the living backdrop */}
          <ParticleGraph className="absolute inset-0 w-full h-full z-0" nodeCount={150} />

          {/* Centered content — floats above the graph */}
          <div className="relative z-10 flex flex-col items-center justify-center text-center px-6 py-28 md:py-40">
            <motion.h1
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="max-w-4xl text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-tight"
            >
              Efficiently Connect with Blood Donors: Saving Lives Made Simpler and Faster
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.12 }}
              className="mt-6 max-w-2xl text-lg text-slate-200 leading-relaxed"
            >
              AI-powered emergency blood donation coordination. Register in 60 seconds.
              Zero cost. DPDP compliant.
            </motion.p>

            {/* Centered CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.24 }}
              className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <button
                id="landing-donor-cta"
                onClick={() => navigate('/donor/register')}
                className="rs-btn-primary gap-2 w-full sm:w-auto"
              >
                <Heart className="w-4.5 h-4.5" fill="currentColor" />
                Register as Donor
              </button>
              <button
                id="landing-ngo-cta"
                onClick={openLogin}
                className="rs-btn-secondary gap-2 w-full sm:w-auto"
              >
                <Shield className="w-4.5 h-4.5" />
                NGO Command Center
              </button>
            </motion.div>

            {/* Search-style pill → chat */}
            <motion.button
              id="landing-ask-bar"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.36 }}
              onClick={() => navigate('/donor/chat')}
              className="mt-8 flex items-center gap-3 w-full max-w-xl px-5 h-14 rounded-md bg-white/95 border border-white/20 text-left text-muted shadow-lg hover:bg-white transition-colors"
            >
              <Search className="w-5 h-5 text-ruby-main flex-shrink-0" />
              <span className="text-[15px] truncate">Ask about blood donation eligibility...</span>
            </motion.button>

            {/* ── Frosted stats overlay — floats above the live graph ── */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.48 }}
              className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-3xl"
            >
              {STATS.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-md border border-white/20 bg-slate-nav/30 backdrop-blur-md px-6 py-5 text-center"
                >
                  <div className="text-2xl md:text-3xl font-bold tracking-tight text-white">
                    {stat.value}
                  </div>
                  <div className="mt-1 text-sm font-medium text-slate-300">{stat.label}</div>
                </div>
              ))}
            </motion.div>
          </div>
        </section>
      </main>

      {/* ==================== FOOTER STRIP ==================== */}
      <footer className="border-t border-hairline px-6 md:px-12 py-6 flex-shrink-0">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted">
          <span>Emergency Blood Coordination</span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-babu" />
            DPDP 2023 Compliant · Zero Infrastructure Cost
          </span>
        </div>
      </footer>

      {/* ==================== LOGIN MODAL ==================== */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="relative w-full max-w-[420px] bg-cloud rounded-md shadow-elevated p-8"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close */}
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-muted hover:text-ink transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-11 h-11 rounded-full bg-rausch/10 flex items-center justify-center">
                <Lock className="w-5 h-5 text-rausch" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-ink tracking-tight">Sign In</h3>
                <p className="text-xs text-muted">NGO coordinator access</p>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="auth-passcode" className="block text-sm font-medium text-body mb-1.5">
                  Access passcode
                </label>
                <div className="relative">
                  <input
                    id="auth-passcode"
                    type={showPasscode ? 'text' : 'password'}
                    value={passcode}
                    onChange={(e) => { setPasscode(e.target.value); setAuthError(''); }}
                    placeholder="Enter coordinator passcode"
                    className="rs-input pr-11"
                    autoFocus
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasscode(!showPasscode)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted hover:text-ink transition-colors"
                    tabIndex={-1}
                  >
                    {showPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Error */}
              {authError && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-sm bg-hackberry/10 border border-hackberry/30 text-xs text-error-text">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  {authError}
                </div>
              )}

              {/* Submit */}
              <button
                id="auth-login-btn"
                type="submit"
                disabled={!passcode.trim() || authLoading}
                className="rs-btn-primary w-full gap-2"
              >
                {authLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </button>

              <p className="text-xs text-center text-muted">
                Session-scoped · expires when the tab closes
              </p>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
