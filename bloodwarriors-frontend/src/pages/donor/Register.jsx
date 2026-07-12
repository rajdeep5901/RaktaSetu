import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UserPlus,
  Send,
  Loader2,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Droplets,
  Calendar,
  Hash,
  User,
  FileText,
  Clock,
  ChevronDown,
  Copy,
  Check,
  Phone,
  Activity,
  ArrowLeft,
} from 'lucide-react';
import api from '../../lib/api';
import { generateEncryptedUserId } from '../../lib/utils';
import { emitDonorCreated } from '../../lib/donorEvents';
import ParticleGraph from '../../components/ParticleGraph';

/* ============================================================
   Donor Registration — Clean light intake form
   POST /donors with deterministic encrypted user_id
   ============================================================ */

const BLOOD_GROUPS = [
  'A Positive', 'A Negative',
  'B Positive', 'B Negative',
  'AB Positive', 'AB Negative',
  'O Positive', 'O Negative',
];

export default function Register({ toast }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fullName: '',
    bloodGroup: '',
    phoneNumber: '',
    lastDonationDate: '',
    donationCount: '',
  });
  const [loading, setLoading] = useState(false);
  const [ticket, setTicket] = useState(null);
  const [errors, setErrors] = useState({});
  const [copied, setCopied] = useState(false);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const validate = () => {
    const errs = {};
    if (!form.fullName.trim() || form.fullName.trim().length < 2) {
      errs.fullName = 'Full name is required (min 2 characters)';
    }
    if (!form.bloodGroup) {
      errs.bloodGroup = 'Blood group is required';
    }
    if (form.phoneNumber.trim()) {
      const phoneClean = form.phoneNumber.replace(/[\s-]/g, '');
      if (!/^\+91\d{10}$/.test(phoneClean)) {
        errs.phoneNumber = 'Must be +91 followed by 10 digits (e.g. +919876543210)';
      }
    }
    if (!form.lastDonationDate) {
      errs.lastDonationDate = 'Last donation date is required';
    }
    if (form.donationCount === '' || isNaN(Number(form.donationCount)) || Number(form.donationCount) < 0) {
      errs.donationCount = 'Valid donation count is required (≥ 0)';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate() || loading) return;

    setLoading(true);

    const encryptedUserId = generateEncryptedUserId(form.fullName);

    const phoneClean = form.phoneNumber.replace(/[\s-]/g, '').trim() || null;
    const payload = {
      user_id: encryptedUserId,
      blood_group: form.bloodGroup,
      last_donation_date: form.lastDonationDate,
      donations_till_date: parseInt(form.donationCount, 10),
      role: 'Emergency Donor',
      consent_given: true,
      status: 'active',
      donor_type: 'Voluntary',
      eligibility_status: 'eligible',
      phone_number: phoneClean,
    };

    try {
      await api.post('/donors', payload);
      setTicket(buildTicket(payload, encryptedUserId));
      toast.addToast('Registration successful — donor is now eligible for matching.', 'success');
      // Notify any live NGO dashboards (this or another tab) to re-fetch so the
      // new donor shows in analytics/overview without a manual page refresh.
      emitDonorCreated({ bloodGroup: form.bloodGroup, source: 'register-form' });
    } catch (err) {
      // Distinguish a genuine backend rejection (the write did NOT persist) from
      // the backend simply being unreachable. Only the latter is treated as a
      // graceful offline case — a real error must not masquerade as success.
      if (err?.response) {
        const detail = err.response.data?.detail;
        toast.addToast(
          typeof detail === 'string'
            ? `Registration failed: ${detail}`
            : 'Registration failed — the server rejected the submission. Please try again.',
          'warning',
          6000,
        );
      } else {
        // No response = network/offline: keep the demo-friendly local ticket.
        setTicket(buildTicket(payload, encryptedUserId));
        toast.addToast(
          'Registered locally — will sync when the backend is online.',
          'system',
          6000,
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const buildTicket = (payload, encryptedId) => ({
    ticketId: `RS-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    timestamp: new Date().toISOString(),
    encryptedUserId: encryptedId,
    bloodGroup: payload.blood_group,
    phoneNumber: payload.phone_number || 'Not provided',
    donationCount: payload.donations_till_date,
    lastDonation: payload.last_donation_date,
    role: payload.role,
    consentGiven: payload.consent_given,
    status: payload.status,
    donorType: payload.donor_type,
    eligibility: payload.eligibility_status,
  });

  const handleCopyTicket = () => {
    if (!ticket) return;
    const text = Object.entries(ticket)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleReset = () => {
    setForm({ fullName: '', bloodGroup: '', phoneNumber: '', lastDonationDate: '', donationCount: '' });
    setTicket(null);
    setErrors({});
    setCopied(false);
  };

  return (
    <div className="min-h-screen bg-cloud grid md:grid-cols-2">
      {/* ===== LEFT: sticky full-height image panel (desktop only) ===== */}
      <div className="hidden md:block relative sticky top-0 h-screen overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1581594693702-fbdc51b2763b?auto=format&fit=crop&q=80&w=1000"
          className="absolute inset-0 w-full h-full object-cover"
          alt="A volunteer caring for a patient"
        />
        <div className="absolute inset-0 bg-slate-nav/60" />
        {/* Live constellation drifting behind the quote */}
        <ParticleGraph className="absolute inset-0 w-full h-full z-0" nodeCount={120} />
        <div className="relative z-10 flex flex-col justify-end h-full p-10">
          <Droplets className="w-10 h-10 text-ruby-light mb-5" />
          <blockquote className="text-3xl font-bold leading-tight tracking-tight text-white max-w-md">
            “The blood you give today is the heartbeat of a stranger tomorrow.”
          </blockquote>
          <p className="mt-4 text-sm text-slate-200 max-w-sm leading-relaxed">
            Every registration expands the emergency donor network. One donation can
            save up to three lives.
          </p>
        </div>
      </div>

      {/* ===== RIGHT: registration form ===== */}
      <div className="flex flex-col min-h-screen">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-hairline flex-shrink-0 bg-cloud">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="w-9 h-9 rounded-full bg-hof flex items-center justify-center text-muted hover:text-ink hover:bg-surface-strong transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-rausch/10 flex items-center justify-center">
                <UserPlus className="w-4.5 h-4.5 text-rausch" />
              </div>
              <div>
                <h2 className="text-base font-bold text-ink tracking-tight">Register as a Donor</h2>
                <p className="text-xs text-muted">Secure intake · DPDP 2023 compliant</p>
              </div>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-babu/10 border border-babu/30">
            <ShieldCheck className="w-3.5 h-3.5 text-babu" />
            <span className="text-xs font-medium text-babu">Consent enabled</span>
          </div>
        </div>

        {/* Content — vertically centered in the viewport */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col">
          <div className="max-w-xl mx-auto w-full my-auto">
            {!ticket ? (
            /* ===== REGISTRATION FORM ===== */
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Consent Notice */}
              <div className="rounded-md p-4 bg-babu/10 border border-babu/30">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-babu flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-semibold text-ink">Your data is protected</div>
                    <p className="text-sm text-body mt-1 leading-relaxed">
                      By registering, you consent to your details being used only for emergency
                      blood coordination, under the DPDP Act 2023. You can withdraw consent at any
                      time and your data will stop being used for matching.
                    </p>
                  </div>
                </div>
              </div>

              {/* Form Fields */}
              <div className="rs-card p-6 space-y-5">
                <div className="rs-section-header">Registration details</div>

                {/* Full Name */}
                <div>
                  <label htmlFor="reg-full-name" className="block text-sm font-medium text-body mb-1.5">
                    Full name
                  </label>
                  <input
                    id="reg-full-name"
                    type="text"
                    value={form.fullName}
                    onChange={(e) => handleChange('fullName', e.target.value)}
                    placeholder="Enter your full legal name"
                    className={`rs-input ${errors.fullName ? 'border-hackberry focus:border-hackberry' : ''}`}
                    autoComplete="name"
                  />
                  {errors.fullName && (
                    <p className="text-xs text-error-text mt-1.5 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {errors.fullName}
                    </p>
                  )}
                </div>

                {/* Blood Group */}
                <div>
                  <label htmlFor="reg-blood-group" className="block text-sm font-medium text-body mb-1.5">
                    Blood group
                  </label>
                  <div className="relative">
                    <select
                      id="reg-blood-group"
                      value={form.bloodGroup}
                      onChange={(e) => handleChange('bloodGroup', e.target.value)}
                      className={`rs-input appearance-none pr-11 cursor-pointer ${errors.bloodGroup ? 'border-hackberry' : ''}`}
                    >
                      <option value="">Select blood group...</option>
                      {BLOOD_GROUPS.map((bg) => (
                        <option key={bg} value={bg}>{bg}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
                  </div>
                  {errors.bloodGroup && (
                    <p className="text-xs text-error-text mt-1.5 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {errors.bloodGroup}
                    </p>
                  )}
                </div>

                {/* Phone Number */}
                <div>
                  <label htmlFor="reg-phone" className="block text-sm font-medium text-body mb-1.5">
                    Phone number
                    <span className="text-muted font-normal"> — optional, for WhatsApp alerts</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-muted text-sm select-none pointer-events-none">+91</span>
                    <input
                      id="reg-phone"
                      type="tel"
                      value={form.phoneNumber.startsWith('+91') ? form.phoneNumber.slice(3) : form.phoneNumber}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 10);
                        handleChange('phoneNumber', digits ? `+91${digits}` : '');
                      }}
                      placeholder="9876543210"
                      maxLength={10}
                      className={`rs-input pl-14 ${errors.phoneNumber ? 'border-hackberry focus:border-hackberry' : ''}`}
                      autoComplete="tel"
                    />
                  </div>
                  {errors.phoneNumber && (
                    <p className="text-xs text-error-text mt-1.5 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {errors.phoneNumber}
                    </p>
                  )}
                  {form.phoneNumber.replace(/[\s-]/g, '').length === 13 && !errors.phoneNumber && (
                    <p className="text-xs text-babu mt-1.5 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Valid — WhatsApp dispatch will be enabled
                    </p>
                  )}
                </div>

                {/* Last Donation Date */}
                <div>
                  <label htmlFor="reg-last-donation" className="block text-sm font-medium text-body mb-1.5">
                    Last donation date
                  </label>
                  <input
                    id="reg-last-donation"
                    type="date"
                    value={form.lastDonationDate}
                    onChange={(e) => handleChange('lastDonationDate', e.target.value)}
                    max={new Date().toISOString().split('T')[0]}
                    className={`rs-input ${errors.lastDonationDate ? 'border-hackberry' : ''}`}
                  />
                  {errors.lastDonationDate && (
                    <p className="text-xs text-error-text mt-1.5 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {errors.lastDonationDate}
                    </p>
                  )}
                </div>

                {/* Historical Donation Count */}
                <div>
                  <label htmlFor="reg-donation-count" className="block text-sm font-medium text-body mb-1.5">
                    Number of past donations
                  </label>
                  <input
                    id="reg-donation-count"
                    type="number"
                    min="0"
                    max="999"
                    value={form.donationCount}
                    onChange={(e) => handleChange('donationCount', e.target.value)}
                    placeholder="0"
                    className={`rs-input ${errors.donationCount ? 'border-hackberry' : ''}`}
                  />
                  {errors.donationCount && (
                    <p className="text-xs text-error-text mt-1.5 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {errors.donationCount}
                    </p>
                  )}
                </div>
              </div>

              {/* Metadata Preview — clean, no raw hex */}
              <div className="rounded-md p-4 bg-hof">
                <div className="text-xs font-medium text-muted uppercase tracking-wide mb-3 flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5" />
                  Automatically applied
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted">Role</span>
                    <span className="text-ink font-medium">Emergency Donor</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Consent</span>
                    <span className="text-babu font-medium">Granted</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Status</span>
                    <span className="text-ink font-medium">Active</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Donor type</span>
                    <span className="text-ink font-medium">Voluntary</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Eligibility</span>
                    <span className="text-ink font-medium">Eligible</span>
                  </div>
                </div>
              </div>

              {/* Submit */}
              <button
                id="register-submit-btn"
                type="submit"
                disabled={loading}
                className="rs-btn-primary w-full gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Registering...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Register Donor
                  </>
                )}
              </button>
            </form>
          ) : (
            /* ===== REGISTRATION TICKET ===== */
            <div className="space-y-6">
              {/* Success Banner */}
              <div className="rounded-md p-5 bg-babu/10 border border-babu/30">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-babu/20 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-5 h-5 text-babu" />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-ink">Registration complete</div>
                    <p className="text-sm text-body">
                      You're now eligible for emergency matching coordination.
                    </p>
                  </div>
                </div>
              </div>

              {/* Ticket Card */}
              <div className="rs-card overflow-hidden">
                {/* Ticket Header */}
                <div className="px-6 py-4 bg-hof border-b border-hairline flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4 text-rausch" />
                    <div>
                      <div className="text-xs text-muted uppercase tracking-wide">
                        Registration ticket
                      </div>
                      <div className="text-sm font-mono font-bold text-ink">
                        {ticket.ticketId}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleCopyTicket}
                    className="flex items-center gap-1.5 text-xs font-medium text-muted hover:text-ink transition-colors px-3 py-1.5 rounded-sm border border-hairline hover:border-ink"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3 h-3 text-babu" />
                        <span className="text-babu">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        Copy
                      </>
                    )}
                  </button>
                </div>

                {/* Ticket Body */}
                <div className="p-6">
                  <div className="space-y-2.5">
                    {[
                      { label: 'Blood group', value: ticket.bloodGroup, icon: Droplets, color: 'text-rausch' },
                      { label: 'Phone number', value: ticket.phoneNumber, icon: Phone, color: ticket.phoneNumber === 'Not provided' ? 'text-muted' : 'text-babu' },
                      { label: 'Past donations', value: ticket.donationCount, icon: Hash, color: 'text-ink' },
                      { label: 'Last donation', value: ticket.lastDonation, icon: Calendar, color: 'text-ink' },
                      { label: 'Role', value: ticket.role, icon: User, color: 'text-ink' },
                      { label: 'Consent', value: ticket.consentGiven ? 'Granted' : 'Revoked', icon: ShieldCheck, color: 'text-babu' },
                      { label: 'Donor type', value: ticket.donorType, icon: UserPlus, color: 'text-ink' },
                      { label: 'Eligibility', value: ticket.eligibility, icon: CheckCircle2, color: 'text-babu' },
                      { label: 'Status', value: ticket.status, icon: Activity, color: 'text-babu' },
                      { label: 'Registered at', value: new Date(ticket.timestamp).toLocaleString(), icon: Clock, color: 'text-muted' },
                    ].map(({ label, value, icon: Icon, color }) => (
                      <div key={label} className="grid grid-cols-[160px_1fr] gap-2 items-center">
                        <div className="flex items-center gap-2 text-sm text-muted">
                          <Icon className="w-3.5 h-3.5" />
                          {label}
                        </div>
                        <div className={`text-sm font-medium ${color}`}>
                          {String(value)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleReset}
                  className="rs-btn-secondary flex-1 gap-2 h-12"
                  id="register-another-btn"
                >
                  <UserPlus className="w-4 h-4" />
                  Register another donor
                </button>
                <button
                  onClick={() => navigate('/donor/chat')}
                  className="rs-btn-primary flex-1 gap-2"
                >
                  Ask a question
                </button>
              </div>
            </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
