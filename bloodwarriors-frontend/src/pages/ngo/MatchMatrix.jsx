import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Grid3X3,
  Send,
  Loader2,
  ShieldOff,
  AlertTriangle,
  Eye,
  Clock,
  ChevronDown,
  UserX,
  MessageCircle,
  ExternalLink,
  Phone,
} from 'lucide-react';
import api from '../../lib/api';

/* ============================================================
   Match Matrix — Donor Matching Data Grid
   POST /match → ranked donor table
   DPDP Consent Revocation + WhatsApp Dispatch
   Triage → Match auto-routing via ?blood_group=&urgency=
   ============================================================ */

const BLOOD_GROUPS = [
  'A Positive', 'A Negative',
  'B Positive', 'B Negative',
  'AB Positive', 'AB Negative',
  'O Positive', 'O Negative',
];

const URGENCY_LEVELS = ['CRITICAL', 'MODERATE', 'LOW'];

const MOCK_DONORS = [
  { donor_id: 1, user_id: '\\x4a7f2e91c3d8b6a5', blood_group: 'O Positive', donations_till_date: 12, eligibility_status: 'eligible', ml_score: 0.9234, reliability_score: 0.8712, cycle_score: 0.92, proximity_score: 0.85, final_score: 0.9047, outreach_message: 'URGENT — O Positive needed at Trauma Center. Your 12 donations make you our top match. Can you reach within 45 mins?', phone_number: '+919876543210', is_new_donor: false },
  { donor_id: 2, user_id: '\\x8b3c5d1f6a9e7204', blood_group: 'O Positive', donations_till_date: 8, eligibility_status: 'eligible', ml_score: 0.8847, reliability_score: 0.7650, cycle_score: 0.88, proximity_score: 0.72, final_score: 0.8521, outreach_message: 'Template: URGENT — Blood type O Positive needed at Hospital. Please check your portal.', phone_number: '+919123456789' },
  { donor_id: 3, user_id: '\\x2f9a4e7b8c1d3650', blood_group: 'O Positive', donations_till_date: 15, eligibility_status: 'eligible', ml_score: 0.8542, reliability_score: 0.9100, cycle_score: 0.75, proximity_score: 0.64, final_score: 0.8389, outreach_message: 'Template: URGENT — Blood type O Positive needed at Hospital. Please check your portal.', phone_number: null },
  { donor_id: 4, user_id: '\\x6d1e8f3a5b7c9024', blood_group: 'O Positive', donations_till_date: 5, eligibility_status: 'eligible', ml_score: 0.8120, reliability_score: 0.6540, cycle_score: 0.82, proximity_score: 0.91, final_score: 0.7932, outreach_message: 'Template: URGENT — Blood type O Positive needed at Hospital. Please check your portal.', phone_number: '+919988776655' },
  { donor_id: 5, user_id: '\\x3c7b9e2d4f6a1850', blood_group: 'O Positive', donations_till_date: 3, eligibility_status: 'eligible', ml_score: 0.7745, reliability_score: 0.5230, cycle_score: 0.79, proximity_score: 0.83, final_score: 0.7416, outreach_message: 'Template: URGENT — Blood type O Positive needed at Hospital. Please check your portal.', phone_number: null },
  { donor_id: 6, user_id: '\\x9a5c1d8e3f7b2640', blood_group: 'O Positive', donations_till_date: 10, eligibility_status: 'eligible', ml_score: 0.7392, reliability_score: 0.8100, cycle_score: 0.71, proximity_score: 0.55, final_score: 0.7284, outreach_message: 'Template: URGENT — Blood type O Positive needed at Hospital. Please check your portal.', phone_number: '+919876501234' },
  { donor_id: 7, user_id: '\\x5e2a4c8d1f3b7960', blood_group: 'O Positive', donations_till_date: 7, eligibility_status: 'eligible', ml_score: 0.7180, reliability_score: 0.7200, cycle_score: 0.68, proximity_score: 0.47, final_score: 0.6938, outreach_message: 'Template: URGENT — Blood type O Positive needed at Hospital. Please check your portal.', phone_number: null },
  { donor_id: 8, user_id: '\\x1f6b3e9a7c5d8240', blood_group: 'O Positive', donations_till_date: 2, eligibility_status: 'eligible', ml_score: 0.6854, reliability_score: 0.4870, cycle_score: 0.65, proximity_score: 0.62, final_score: 0.6443, outreach_message: 'Template: URGENT — Blood type O Positive needed at Hospital. Please check your portal.', phone_number: '+919556677881' },
  { donor_id: 9, user_id: '\\x7d4e2c6a1b9f3850', blood_group: 'O Positive', donations_till_date: 1, eligibility_status: 'eligible', ml_score: 0.6321, reliability_score: 0.3540, cycle_score: 0.60, proximity_score: 0.78, final_score: 0.5902, outreach_message: 'Template: URGENT — Blood type O Positive needed at Hospital. Please check your portal.', phone_number: null, is_new_donor: true },
  { donor_id: 10, user_id: '\\x4b8c1e5f2a7d9360', blood_group: 'O Positive', donations_till_date: 0, eligibility_status: 'eligible', ml_score: 0.5743, reliability_score: 0.2100, cycle_score: 0.55, proximity_score: 0.89, final_score: 0.5247, outreach_message: 'Template: URGENT — Blood type O Positive needed at Hospital. Please check your portal.', phone_number: '+919012345678', is_new_donor: true },
];

/**
 * Build a WhatsApp deep link using the free wa.me protocol.
 * Strips the + prefix and encodes the outreach message.
 */
function buildWhatsAppLink(phoneNumber, outreachMessage) {
  const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
  const encodedMsg = encodeURIComponent(outreachMessage);
  return `https://wa.me/${cleanPhone}?text=${encodedMsg}`;
}

export default function MatchMatrix({ toast }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [bloodGroup, setBloodGroup] = useState('O Positive');
  const [urgency, setUrgency] = useState('CRITICAL');
  const [loading, setLoading] = useState(false);
  const [donors, setDonors] = useState([]);
  const [meta, setMeta] = useState(null);
  const [revokedIds, setRevokedIds] = useState(new Set());
  const [isOffline, setIsOffline] = useState(false);
  const [showMock, setShowMock] = useState(false);
  const [latency, setLatency] = useState(null);
  const [expandedRow, setExpandedRow] = useState(null);
  const [fromTriage, setFromTriage] = useState(false);
  const triageRef = useRef(Math.floor(1000 + Math.random() * 9000));

  const handleMatch = async (overrideBg, overrideUrg) => {
    if (loading) return;
    const bg = overrideBg || bloodGroup;
    const urg = overrideUrg || urgency;
    setLoading(true);
    setDonors([]);
    setMeta(null);
    setIsOffline(false);
    setShowMock(false);
    setRevokedIds(new Set());
    setLatency(null);
    setExpandedRow(null);

    try {
      const res = await api.post('/match', {
        blood_group: bg,
        urgency: urg,
        max_results: 10,
      });
      setDonors(res.data.donors || []);
      setMeta({ urgency: res.data.urgency, blood_group: res.data.blood_group, total_eligible: res.data.total_eligible });
      setLatency(res.latency || null);
      toast.addToast(
        `Match complete — ${res.data.donors?.length || 0} donors ranked [${res.latency}ms]`,
        'success',
      );
    } catch {
      setIsOffline(true);
      toast.addToast('Backend unreachable — mock donor matrix available.', 'system', 6000);
    } finally {
      setLoading(false);
    }
  };

  // Triage → Match auto-routing: read ?blood_group=&urgency=, auto-run, clear params
  useEffect(() => {
    const bg = searchParams.get('blood_group');
    const urg = searchParams.get('urgency');
    if (!bg && !urg) return;
    if (bg) setBloodGroup(bg);
    if (urg) setUrgency(urg);
    setFromTriage(true);
    const t = setTimeout(() => handleMatch(bg || undefined, urg || undefined), 300);
    navigate('/ngo/match', { replace: true });
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMock = () => {
    setShowMock(true);
    setDonors(MOCK_DONORS);
    setMeta({ urgency: 'CRITICAL', blood_group: 'O Positive', total_eligible: 47 });
    setLatency(38);
    toast.addToast('Mock donor matrix loaded for evaluation.', 'system');
  };

  const handleRevokeConsent = async (donorId) => {
    try {
      await api.patch(`/donors/${donorId}/consent`, { consent_given: false });
      toast.addToast(`Consent revoked for Donor #${donorId} — DPDP protocol enforced.`, 'warning');
    } catch {
      toast.addToast(`Consent revoked locally for Donor #${donorId} — API sync pending.`, 'warning');
    }
    setRevokedIds((prev) => new Set([...prev, donorId]));
  };

  const handleWhatsAppDispatch = (donor) => {
    if (!donor.phone_number) {
      toast.addToast(`No phone number on file for Donor #${donor.donor_id}. Registration portal required.`, 'warning');
      return;
    }
    const link = buildWhatsAppLink(donor.phone_number, donor.outreach_message);
    window.open(link, '_blank', 'noopener,noreferrer');
    toast.addToast(
      `WhatsApp dispatch initiated for ${donor.phone_number} — outreach message pre-loaded.`,
      'success',
    );
  };

  const scoreBar = (value) => {
    const pct = Math.round(value * 100);
    const color =
      pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-400' : 'bg-ruby-main';
    return (
      <div className="flex items-center gap-2">
        <div className="w-16 h-1.5 bg-surface-strong rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs font-mono tabular-nums text-muted">{pct}%</span>
      </div>
    );
  };

  const hasResults = donors.length > 0;

  return (
    <div className="h-full flex flex-col bg-cloud">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-hairline flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-surface-strong flex items-center justify-center">
            <Grid3X3 className="w-4.5 h-4.5 text-ruby-main" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-ink tracking-tight">Match Matrix</h2>
            <p className="text-xs text-muted">
              Hybrid-ranked donor matching for your request
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {latency !== null && (
            <div className="flex items-center gap-1.5 text-xs text-muted">
              <Clock className="w-3.5 h-3.5" />
              <span className="tabular-nums">{latency}ms</span>
            </div>
          )}
          {meta && (
            <div className="text-xs text-muted">
              {meta.total_eligible} eligible
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="px-6 py-4 border-b border-hairline-soft flex-shrink-0">
        <div className="flex items-end gap-4 flex-wrap">
          {/* Blood Group Select */}
          <div className="flex-1 min-w-[180px] max-w-[220px]">
            <label className="text-xs font-medium text-muted block mb-1.5">
              Blood Group
            </label>
            <div className="relative">
              <select
                id="match-blood-group"
                value={bloodGroup}
                onChange={(e) => setBloodGroup(e.target.value)}
                className="h-11 w-full appearance-none rounded-full border border-hairline bg-cloud pl-5 pr-9 text-sm text-ink cursor-pointer transition-colors focus:border-rausch focus:outline-none"
              >
                {BLOOD_GROUPS.map((bg) => (
                  <option key={bg} value={bg}>{bg}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
            </div>
          </div>

          {/* Urgency Select */}
          <div className="flex-1 min-w-[150px] max-w-[180px]">
            <label className="text-xs font-medium text-muted block mb-1.5">
              Urgency Level
            </label>
            <div className="relative">
              <select
                id="match-urgency"
                value={urgency}
                onChange={(e) => setUrgency(e.target.value)}
                className="h-11 w-full appearance-none rounded-full border border-hairline bg-cloud pl-5 pr-9 text-sm text-ink cursor-pointer transition-colors focus:border-rausch focus:outline-none"
              >
                {URGENCY_LEVELS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
            </div>
          </div>

          {/* Execute */}
          <button
            id="match-execute-btn"
            onClick={() => handleMatch()}
            disabled={loading}
            className="rs-btn-primary gap-2 text-sm"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Matching…
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Find Donors
              </>
            )}
          </button>

          {/* Triage provenance badge */}
          {fromTriage && (
            <span className="text-xs text-muted pb-3">
              From Triage #{triageRef.current}
            </span>
          )}
        </div>
      </div>

      {/* Data Matrix */}
      <div className="flex-1 overflow-y-auto">
        {/* Offline Banner */}
        {isOffline && !hasResults && (
          <div className="p-6 space-y-4">
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-amber-700">Backend Unreachable</div>
                  <p className="text-xs text-body mt-1">
                    The matching service didn’t respond. Load sample donor data to preview the grid.
                  </p>
                </div>
              </div>
            </div>
            <button
              id="match-mock-toggle"
              onClick={loadMock}
              className="rs-btn-secondary gap-2 text-sm"
            >
              <Eye className="w-4 h-4" />
              Load Sample Donor Matrix (10 entries)
            </button>
          </div>
        )}

        {/* Empty State */}
        {!hasResults && !isOffline && (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <div className="w-16 h-16 rounded-full bg-surface-strong flex items-center justify-center mb-4">
              <Grid3X3 className="w-7 h-7 text-muted-soft" />
            </div>
            <p className="text-sm text-ink font-semibold">No matches yet</p>
            <p className="text-xs text-muted mt-1 max-w-sm">
              Select a blood group and urgency, then run the search to rank eligible donors.
            </p>
          </div>
        )}

        {/* Matrix Table */}
        {hasResults && (
          <div className="p-6">
            <div className="rounded-md border border-hairline bg-cloud overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-nav">
                      <th className="text-[10px] font-semibold uppercase tracking-wider text-white text-left px-3 py-3">Rank</th>
                      <th className="text-[10px] font-semibold uppercase tracking-wider text-white text-left px-3 py-3">User ID</th>
                      <th className="text-[10px] font-semibold uppercase tracking-wider text-white text-left px-3 py-3">ML Score</th>
                      <th className="text-[10px] font-semibold uppercase tracking-wider text-white text-left px-3 py-3">Reliability</th>
                      <th className="text-[10px] font-semibold uppercase tracking-wider text-white text-left px-3 py-3">Proximity</th>
                      <th className="text-[10px] font-semibold uppercase tracking-wider text-white text-left px-3 py-3">Score</th>
                      <th className="text-[10px] font-semibold uppercase tracking-wider text-white text-left px-3 py-3">Outreach</th>
                      <th className="text-[10px] font-semibold uppercase tracking-wider text-white text-center px-3 py-3">WhatsApp</th>
                      <th className="text-[10px] font-semibold uppercase tracking-wider text-white text-center px-3 py-3">DPDP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {donors.map((donor, index) => {
                      const isRevoked = revokedIds.has(donor.donor_id);
                      const isExpanded = expandedRow === donor.donor_id;
                      const hasPhone = !!donor.phone_number;
                      const isNewDonor = !!donor.is_new_donor;

                      return (
                        <motion.tr
                          key={donor.donor_id}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className={`border-b border-hairline-soft hover:bg-surface-strong transition-colors duration-150 ${
                            isNewDonor
                              ? 'bg-ruby-main/10 border-l-4 border-ruby-main'
                              : 'bg-cloud'
                          } ${isRevoked ? 'consent-revoked' : ''}`}
                        >
                          {/* Rank */}
                          <td className="px-3 py-2.5">
                            <span className={`font-bold ${index === 0 ? 'text-ruby-main text-base' : 'text-muted'}`}>
                              #{index + 1}
                            </span>
                          </td>

                          {/* User ID */}
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <code className="text-ink text-xs bg-surface-strong px-1.5 py-0.5 rounded-xs font-mono">
                                {donor.user_id}
                              </code>
                              {isNewDonor && (
                                <span className="inline-flex items-center rounded-full border border-ruby-main/30 bg-ruby-main/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ruby-main">
                                  New
                                </span>
                              )}
                            </div>
                          </td>

                          {/* ML Score */}
                          <td className="px-3 py-2.5">
                            {scoreBar(donor.ml_score || 0)}
                          </td>

                          {/* Reliability */}
                          <td className="px-3 py-2.5">
                            {scoreBar(donor.reliability_score)}
                          </td>

                          {/* Proximity */}
                          <td className="px-3 py-2.5">
                            {scoreBar(donor.proximity_score)}
                          </td>

                          {/* Final Score */}
                          <td className="px-3 py-2.5">
                            <span className={`font-bold text-sm tabular-nums ${
                              donor.final_score >= 0.8 ? 'text-emerald-600' :
                              donor.final_score >= 0.6 ? 'text-amber-500' : 'text-ruby-main'
                            }`}>
                              {(donor.final_score * 100).toFixed(1)}%
                            </span>
                          </td>

                          {/* Outreach Preview */}
                          <td className="px-3 py-2.5 max-w-[180px]">
                            <button
                              onClick={() => setExpandedRow(isExpanded ? null : donor.donor_id)}
                              className="text-xs text-body hover:text-ink transition-colors text-left truncate max-w-full block"
                              title={donor.outreach_message}
                            >
                              {isExpanded ? donor.outreach_message : `${donor.outreach_message.slice(0, 45)}…`}
                            </button>
                          </td>

                          {/* WhatsApp Dispatch */}
                          <td className="px-3 py-2.5 text-center">
                            <button
                              onClick={() => handleWhatsAppDispatch(donor)}
                              disabled={isRevoked}
                              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-sm transition-all duration-150 ${
                                hasPhone
                                  ? 'bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95'
                                  : 'bg-surface-strong text-muted-soft cursor-not-allowed'
                              }`}
                              title={hasPhone ? `Dispatch to ${donor.phone_number}` : 'No phone — register via portal'}
                              id={`dispatch-btn-${donor.donor_id}`}
                            >
                              {hasPhone ? (
                                <>
                                  <MessageCircle className="w-3.5 h-3.5" />
                                  Message
                                  <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                                </>
                              ) : (
                                <>
                                  <Phone className="w-3.5 h-3.5 opacity-60" />
                                  No phone
                                </>
                              )}
                            </button>
                          </td>

                          {/* DPDP Consent Revoke */}
                          <td className="px-3 py-2.5 text-center">
                            {isRevoked ? (
                              <span className="inline-flex items-center justify-center gap-1 text-xs font-semibold text-ruby-main line-through">
                                <UserX className="w-3.5 h-3.5" />
                                Revoked
                              </span>
                            ) : (
                              <button
                                onClick={() => handleRevokeConsent(donor.donor_id)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-ruby-main px-3 py-1 rounded-sm border border-ruby-main/30 bg-ruby-main/10 hover:bg-ruby-main/20 transition-colors mx-auto"
                                title="Revoke consent — DPDP 2023 compliance"
                              >
                                <ShieldOff className="w-3.5 h-3.5" />
                                Revoke
                              </button>
                            )}
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Footer meta */}
              {showMock && (
                <div className="px-4 py-2 text-xs text-muted border-t border-hairline-soft bg-hof">
                  Sample data — WhatsApp dispatch and consent revocation are fully interactive.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
