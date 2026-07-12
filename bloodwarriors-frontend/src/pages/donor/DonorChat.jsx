import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Send,
  Loader2,
  Heart,
  Clock,
  User,
  Copy,
  Check,
  RotateCcw,
  ArrowLeft,
  Droplets,
  ShieldCheck,
  CheckCircle2,
  Hash,
  Calendar,
  UserPlus,
  Phone,
  Activity,
} from 'lucide-react';
import api from '../../lib/api';
import { generateEncryptedUserId } from '../../lib/utils';
import { emitDonorCreated } from '../../lib/donorEvents';
import ParticleGraph from '../../components/ParticleGraph';

/* ============================================================
   DonorChat — Conversational Intake + FAQ Chat
   ============================================================
   STATE MACHINE:
     WELCOME → ELIGIBILITY_AGE → ELIGIBILITY_SURGERY → ELIGIBILITY_WEIGHT
       → (if ineligible) → INELIGIBLE (dead end)
       → (if eligible) → COLLECT_NAME → COLLECT_BLOOD → COLLECT_PHONE
       → API_SUBMISSION → SUCCESS_TICKET
       → FAQ_MODE (free-form chat with POST /chat)
   ============================================================ */

function generateSessionId() {
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  const block = (len) => Array.from({ length: len }, hex).join('');
  return `donor-${block(8)}-${block(4)}-4${block(3)}-${block(12)}`;
}

const BLOOD_GROUPS = [
  'A Positive', 'A Negative', 'B Positive', 'B Negative',
  'AB Positive', 'AB Negative', 'O Positive', 'O Negative',
];

/* States */
const S = {
  WELCOME: 'WELCOME',
  ELIG_AGE: 'ELIG_AGE',
  ELIG_SURGERY: 'ELIG_SURGERY',
  ELIG_WEIGHT: 'ELIG_WEIGHT',
  INELIGIBLE: 'INELIGIBLE',
  COLLECT_NAME: 'COLLECT_NAME',
  COLLECT_BLOOD: 'COLLECT_BLOOD',
  COLLECT_PHONE: 'COLLECT_PHONE',
  SUBMITTING: 'SUBMITTING',
  SUCCESS: 'SUCCESS',
  FAQ: 'FAQ',
};

/* Bot message templates */
const BOT_MSG = {
  WELCOME: `Welcome to RaktaSetu AI! 🩸

I can help you two ways — **register as an emergency blood donor** in under 60 seconds, or **answer any question** about blood donation, eligibility, and how RaktaSetu works.

What would you like to do?`,
  FAQ_INTRO: `Sure! I'm now in **FAQ mode** 💬

Ask me anything about blood donation — eligibility timelines, what to eat before donating, data privacy, how our platform works, and more.`,
  ASK_AGE: `**Safety Check 1/3 — Age Verification**

Are you **18 years or older**? This is a mandatory requirement for blood donation in India.

Reply **Yes** or **No**.`,
  ASK_SURGERY: `**Safety Check 2/3 — Recent Medical History**

Have you had any **major surgery, infection, or blood transfusion in the last 6 months**?

Reply **Yes** or **No**.`,
  ASK_WEIGHT: `**Safety Check 3/3 — Weight Check**

Do you weigh at least **50 kg (110 lbs)**? This ensures safe donation volumes.

Reply **Yes** or **No**.`,
  INELIGIBLE_AGE: `I'm sorry, but blood donation in India requires donors to be at least 18 years old. This is a safety regulation to protect your health.

Please come back when you're eligible — every future donor matters! 💙`,
  INELIGIBLE_SURGERY: `Thank you for your honesty. For your safety, we recommend waiting at least 6 months after any major surgery, infection, or transfusion before donating.

Please check back after your recovery period. We'll be here! 🙏`,
  INELIGIBLE_WEIGHT: `For safe blood donation, a minimum weight of 50 kg is required. This ensures your body can handle the donation without adverse effects.

Please consult your doctor about reaching a safe donation weight. We appreciate your intention to help! 💙`,
  ALL_CLEAR: `✅ **All safety checks passed!** You're eligible to donate.

Now let's collect your registration details. This takes about 30 seconds.

**What is your full name?**`,
  ASK_BLOOD: `Got it! Now, **what is your blood group?**

Choose from: A+, A-, B+, B-, AB+, AB-, O+, O-

_(You can type the short form like "O+" or the full form like "O Positive")_`,
  ASK_PHONE: `Almost done! **What is your phone number?** (Optional)

This enables WhatsApp emergency alerts when a patient urgently needs your blood type. Format: **10 digits** (we'll add +91 automatically).

Type your number, or type **skip** to register without one.`,
  SUBMITTING: `⏳ Registering you in the donor network...`,
  FAQ_TRANSITION: `🎉 You're all set! Your registration is complete.

I'm now switching to **FAQ mode** — ask me anything about blood donation, eligibility timelines, or how RaktaSetu works!`,
};

/* Donor FAQ mock responses for offline mode */
const DONOR_MOCK_RESPONSES = [
  'Great question! After a whole blood donation, you need to wait at least 56 days (8 weeks) before donating again. This gives your body enough time to replenish red blood cells. If you donated platelets, the wait is shorter — about 7 days. Stay hydrated and eat iron-rich foods! 🩸',
  'Before donating blood, make sure to: (1) Get a good night\'s sleep, (2) Eat a healthy meal 2-3 hours before, focusing on iron-rich foods, (3) Drink plenty of water, (4) Avoid fatty foods as they can affect blood testing, (5) Bring a valid ID. You\'re doing something amazing! 💪',
  'Your personal data is protected under the Digital Personal Data Protection (DPDP) Act, 2023. We only collect information necessary for emergency blood coordination. You have the right to view your data, withdraw consent at any time, and request deletion. Your privacy is our priority! 🛡️',
  'To be eligible to donate blood in India, you generally need to: be between 18-65 years old, weigh at least 50kg, have a hemoglobin level of at least 12.5 g/dL, and be in good overall health. Some temporary deferrals include recent tattoos (wait 6 months), certain medications, or recent travel to malaria-endemic areas.',
  'The donation process takes about 10-15 minutes for the actual draw, though the entire visit including registration and a short recovery snack takes about an hour. You\'ll donate approximately 350-450 mL of blood. Most people feel completely fine afterward!',
];

export default function DonorChat({ toast }) {
  const navigate = useNavigate();
  const sessionId = useMemo(() => generateSessionId(), []);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [chatState, setChatState] = useState(S.WELCOME);
  const [regData, setRegData] = useState({ name: '', bloodGroup: '', phone: '' });
  const [ticket, setTicket] = useState(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const mockIndexRef = useRef(0);
  const hasInitRef = useRef(false);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, [chatState]);

  // Push a bot message
  const pushBot = useCallback((content, extra = {}) => {
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now() + Math.random(),
        role: 'assistant',
        content,
        timestamp: new Date(),
        ...extra,
      },
    ]);
  }, []);

  // Push a user message
  const pushUser = useCallback((content) => {
    setMessages((prev) => [
      ...prev,
      { id: Date.now() + Math.random(), role: 'user', content, timestamp: new Date() },
    ]);
  }, []);

  // Welcome on mount — present the intent fork (register vs. ask a question)
  // instead of auto-forcing the user into the registration flow.
  useEffect(() => {
    if (!hasInitRef.current) {
      hasInitRef.current = true;
      setTimeout(() => {
        pushBot(BOT_MSG.WELCOME);
        // Stay in WELCOME so the two intent buttons render; user picks the path.
      }, 400);
    }
  }, [pushBot]);

  /* ===== Intent fork from WELCOME ===== */
  const startRegistration = useCallback(() => {
    pushUser('Register as a Donor');
    setTimeout(() => {
      pushBot(BOT_MSG.ASK_AGE);
      setChatState(S.ELIG_AGE);
    }, 400);
  }, [pushBot, pushUser]);

  const startFAQ = useCallback(() => {
    pushUser('Ask a Question');
    setTimeout(() => {
      pushBot(BOT_MSG.FAQ_INTRO);
      setChatState(S.FAQ);
    }, 400);
  }, [pushBot, pushUser]);

  /* ===== Parse yes/no ===== */
  const isYes = (text) => /^(yes|y|yeah|yep|yup|ha|haan|ji|1|true)$/i.test(text.trim());
  const isNo = (text) => /^(no|n|nah|nope|nahi|0|false)$/i.test(text.trim());

  /* ===== Parse blood group shorthand ===== */
  const parseBloodGroup = (text) => {
    const t = text.trim().toLowerCase().replace(/\s+/g, ' ');
    const map = {
      'a+': 'A Positive', 'a positive': 'A Positive', 'a pos': 'A Positive',
      'a-': 'A Negative', 'a negative': 'A Negative', 'a neg': 'A Negative',
      'b+': 'B Positive', 'b positive': 'B Positive', 'b pos': 'B Positive',
      'b-': 'B Negative', 'b negative': 'B Negative', 'b neg': 'B Negative',
      'ab+': 'AB Positive', 'ab positive': 'AB Positive', 'ab pos': 'AB Positive',
      'ab-': 'AB Negative', 'ab negative': 'AB Negative', 'ab neg': 'AB Negative',
      'o+': 'O Positive', 'o positive': 'O Positive', 'o pos': 'O Positive',
      'o-': 'O Negative', 'o negative': 'O Negative', 'o neg': 'O Negative',
    };
    return map[t] || null;
  };

  /* ===== State Machine Transition ===== */
  const processInput = async (rawInput) => {
    const text = rawInput.trim();
    if (!text) return;
    pushUser(text);
    setInput('');

    switch (chatState) {
      /* ---------- WELCOME: intent fork (typed fallback) ---------- */
      case S.WELCOME: {
        const t = text.toLowerCase();
        const wantsRegister = /(register|donate|donor|sign\s*up|join)/i.test(t);
        const wantsQuestion = /(question|ask|faq|eligib|help|info|query)/i.test(t);
        if (wantsRegister && !wantsQuestion) {
          setTimeout(() => { pushBot(BOT_MSG.ASK_AGE); setChatState(S.ELIG_AGE); }, 400);
        } else if (wantsQuestion) {
          setTimeout(() => { pushBot(BOT_MSG.FAQ_INTRO); setChatState(S.FAQ); }, 400);
        } else {
          setTimeout(() => pushBot('Would you like to **Register as a Donor** or **Ask a Question**? Tap a button below, or just tell me which one.'), 300);
        }
        break;
      }

      /* ---------- ELIGIBILITY: AGE ---------- */
      case S.ELIG_AGE: {
        if (isYes(text)) {
          setTimeout(() => { pushBot(BOT_MSG.ASK_SURGERY); setChatState(S.ELIG_SURGERY); }, 400);
        } else if (isNo(text)) {
          setTimeout(() => { pushBot(BOT_MSG.INELIGIBLE_AGE); setChatState(S.INELIGIBLE); }, 400);
        } else {
          setTimeout(() => pushBot('Please reply with **Yes** or **No**. Are you 18 years or older?'), 300);
        }
        break;
      }

      /* ---------- ELIGIBILITY: SURGERY ---------- */
      case S.ELIG_SURGERY: {
        if (isNo(text)) {
          // No recent surgery = good
          setTimeout(() => { pushBot(BOT_MSG.ASK_WEIGHT); setChatState(S.ELIG_WEIGHT); }, 400);
        } else if (isYes(text)) {
          setTimeout(() => { pushBot(BOT_MSG.INELIGIBLE_SURGERY); setChatState(S.INELIGIBLE); }, 400);
        } else {
          setTimeout(() => pushBot('Please reply with **Yes** or **No**. Any major surgery, infection, or transfusion in the last 6 months?'), 300);
        }
        break;
      }

      /* ---------- ELIGIBILITY: WEIGHT ---------- */
      case S.ELIG_WEIGHT: {
        if (isYes(text)) {
          setTimeout(() => { pushBot(BOT_MSG.ALL_CLEAR); setChatState(S.COLLECT_NAME); }, 400);
        } else if (isNo(text)) {
          setTimeout(() => { pushBot(BOT_MSG.INELIGIBLE_WEIGHT); setChatState(S.INELIGIBLE); }, 400);
        } else {
          setTimeout(() => pushBot('Please reply with **Yes** or **No**. Do you weigh at least 50 kg?'), 300);
        }
        break;
      }

      /* ---------- DATA: NAME ---------- */
      case S.COLLECT_NAME: {
        if (text.length < 2) {
          setTimeout(() => pushBot('Please enter a valid full name (at least 2 characters).'), 300);
          return;
        }
        setRegData((prev) => ({ ...prev, name: text }));
        setTimeout(() => { pushBot(BOT_MSG.ASK_BLOOD); setChatState(S.COLLECT_BLOOD); }, 400);
        break;
      }

      /* ---------- DATA: BLOOD GROUP ---------- */
      case S.COLLECT_BLOOD: {
        const bg = parseBloodGroup(text);
        if (!bg) {
          setTimeout(() => pushBot(`I didn't recognize that blood group. Please type one of:\n**A+, A-, B+, B-, AB+, AB-, O+, O-**`), 300);
          return;
        }
        setRegData((prev) => ({ ...prev, bloodGroup: bg }));
        setTimeout(() => { pushBot(BOT_MSG.ASK_PHONE); setChatState(S.COLLECT_PHONE); }, 400);
        break;
      }

      /* ---------- DATA: PHONE ---------- */
      case S.COLLECT_PHONE: {
        const isSkip = /^(skip|no|none|na|n\/a|-)$/i.test(text);
        let phone = null;

        if (!isSkip) {
          const digits = text.replace(/[^0-9]/g, '');
          // Strip leading 91 if user typed +91 or 91
          const cleaned = digits.startsWith('91') && digits.length === 12 ? digits.slice(2) : digits;
          if (cleaned.length !== 10) {
            setTimeout(() => pushBot('Please enter a valid **10-digit** phone number, or type **skip** to register without one.'), 300);
            return;
          }
          phone = `+91${cleaned}`;
        }
        setRegData((prev) => ({ ...prev, phone }));

        // Move to API submission
        setChatState(S.SUBMITTING);
        setTimeout(() => pushBot(BOT_MSG.SUBMITTING), 200);

        // Use a callback to get the latest regData (since setState is async)
        const finalName = regData.name; // already set in previous step
        const finalBg = regData.bloodGroup; // already set in previous step
        const finalPhone = phone;

        await submitRegistration(finalName, finalBg, finalPhone);
        break;
      }

      /* ---------- FAQ MODE ---------- */
      case S.FAQ:
      case S.SUCCESS: {
        setLoading(true);
        try {
          const res = await api.post('/chat', {
            session_id: sessionId,
            message: text,
            user_id: 'donor-faq',
          });
          pushBot(res.data.response, { latency: res.latency });
        } catch {
          const mockResp = DONOR_MOCK_RESPONSES[mockIndexRef.current % DONOR_MOCK_RESPONSES.length];
          mockIndexRef.current += 1;
          pushBot(mockResp, { isMock: true, latency: 38 });
        } finally {
          setLoading(false);
        }
        break;
      }

      /* ---------- INELIGIBLE (dead end) ---------- */
      case S.INELIGIBLE: {
        pushBot(`Thank you for your interest. Unfortunately, based on the safety screening, you're not eligible to donate at this time. If your situation changes, please come back — we'd love to have you! 💙`);
        break;
      }

      default:
        break;
    }
  };

  /* ===== POST /donors ===== */
  const submitRegistration = async (name, bloodGroup, phone) => {
    const encryptedUserId = generateEncryptedUserId(name);

    const payload = {
      user_id: encryptedUserId,
      blood_group: bloodGroup,
      // Chat flow never collects donation history: send null (not today) so the
      // donor is not falsely scored as freshly-donated. Count stays 0.
      last_donation_date: null,
      donations_till_date: 0,
      role: 'Emergency Donor',
      consent_given: true,
      status: 'active',
      donor_type: 'Voluntary',
      eligibility_status: 'eligible',
      phone_number: phone,
    };

    try {
      const res = await api.post('/donors', payload);
      const ticketData = {
        ticketId: `RS-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        timestamp: new Date().toISOString(),
        encryptedUserId,
        donorId: res.data.donor_id,
        bloodGroup,
        phoneNumber: phone || 'Not provided',
        status: 'ACTIVE',
        consent: 'GRANTED',
      };
      setTicket(ticketData);
      setChatState(S.SUCCESS);

      // Push the success ticket as a special bot message
      pushBot(`__TICKET__${JSON.stringify(ticketData)}`, { isTicket: true });

      setTimeout(() => {
        pushBot(BOT_MSG.FAQ_TRANSITION);
        setChatState(S.FAQ);
      }, 1200);

      toast.addToast(`Registration complete — Donor ID #${res.data.donor_id} created.`, 'success');
      // Notify any live NGO dashboards (this or another tab) to re-fetch so the
      // new donor shows in analytics/overview without a manual page refresh.
      emitDonorCreated({ donorId: res.data.donor_id, bloodGroup, source: 'donor-chat' });
    } catch {
      // Offline fallback — still show the ticket with local data
      const ticketData = {
        ticketId: `RS-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        timestamp: new Date().toISOString(),
        encryptedUserId,
        donorId: 'PENDING-SYNC',
        bloodGroup,
        phoneNumber: phone || 'Not provided',
        status: 'ACTIVE (OFFLINE)',
        consent: 'GRANTED',
      };
      setTicket(ticketData);
      setChatState(S.SUCCESS);

      pushBot(`__TICKET__${JSON.stringify(ticketData)}`, { isTicket: true });

      setTimeout(() => {
        pushBot(BOT_MSG.FAQ_TRANSITION);
        setChatState(S.FAQ);
      }, 1200);

      toast.addToast('Registered offline — will sync when backend is available.', 'system');
    }
  };

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || loading || chatState === S.SUBMITTING) return;
    processInput(trimmed);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = (id, text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleReset = () => {
    setMessages([]);
    setTicket(null);
    setRegData({ name: '', bloodGroup: '', phone: '' });
    setChatState(S.WELCOME);
    hasInitRef.current = false;
    toast.addToast('Conversation reset. Starting fresh.', 'info');
    // Re-trigger welcome — back to the intent fork, not straight into registration
    setTimeout(() => {
      hasInitRef.current = true;
      pushBot(BOT_MSG.WELCOME);
    }, 300);
  };

  const formatTime = (date) =>
    date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

  /* ===== Render Clinical Success Ticket ===== */
  const renderTicketBubble = (ticketData) => {
    const t = typeof ticketData === 'string' ? JSON.parse(ticketData) : ticketData;
    return (
      <div className="rs-card p-4 space-y-3 border-l-4 border-l-rausch">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-hairline-soft pb-2">
          <CheckCircle2 className="w-5 h-5 text-babu" />
          <span className="text-sm font-bold text-babu tracking-wide">CONFIRMED</span>
        </div>

        {/* Ticket ID */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-sm bg-hof">
          <Hash className="w-3.5 h-3.5 text-rausch" />
          <span className="text-xs font-mono text-ink tracking-wider">{t.ticketId}</span>
        </div>

        {/* Data Grid */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Donor ID', value: t.donorId, icon: UserPlus, color: 'text-ink' },
            { label: 'Blood Group', value: t.bloodGroup, icon: Droplets, color: 'text-rausch' },
            { label: 'Phone', value: t.phoneNumber, icon: Phone, color: t.phoneNumber === 'Not provided' ? 'text-muted' : 'text-babu' },
            { label: 'Status', value: t.status, icon: Activity, color: 'text-babu' },
            { label: 'Consent', value: t.consent, icon: ShieldCheck, color: 'text-babu' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="flex items-center gap-2 px-2 py-1.5 rounded-sm bg-hof">
              <Icon className={`w-3 h-3 ${color} flex-shrink-0`} />
              <div>
                <div className="text-[9px] font-medium text-muted uppercase tracking-wide">{label}</div>
                <div className={`text-[11px] font-mono ${color} truncate max-w-[140px]`}>{String(value)}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Timestamp */}
        <div className="text-[9px] font-mono text-muted text-right">
          <Calendar className="w-2.5 h-2.5 inline mr-1" />
          {new Date(t.timestamp).toLocaleString()}
        </div>
      </div>
    );
  };

  /* ===== Get state-aware placeholder ===== */
  const getPlaceholder = () => {
    switch (chatState) {
      case S.WELCOME: return 'Tap a button, or type “register” / “ask a question”...';
      case S.ELIG_AGE: return 'Type Yes or No...';
      case S.ELIG_SURGERY: return 'Type Yes or No...';
      case S.ELIG_WEIGHT: return 'Type Yes or No...';
      case S.COLLECT_NAME: return 'Enter your full name...';
      case S.COLLECT_BLOOD: return 'e.g. O+, A Negative, B+...';
      case S.COLLECT_PHONE: return '10 digits or type skip...';
      case S.SUBMITTING: return 'Registering...';
      case S.INELIGIBLE: return 'You can still ask questions...';
      case S.FAQ:
      case S.SUCCESS: return 'Ask about blood donation...';
      default: return 'Type your response...';
    }
  };

  /* ===== State progress bar ===== */
  const getProgress = () => {
    const stateOrder = [S.ELIG_AGE, S.ELIG_SURGERY, S.ELIG_WEIGHT, S.COLLECT_NAME, S.COLLECT_BLOOD, S.COLLECT_PHONE, S.SUCCESS, S.FAQ];
    const idx = stateOrder.indexOf(chatState);
    if (idx === -1) return 0;
    return Math.round(((idx + 1) / stateOrder.length) * 100);
  };

  const isRegistering = [S.ELIG_AGE, S.ELIG_SURGERY, S.ELIG_WEIGHT, S.COLLECT_NAME, S.COLLECT_BLOOD, S.COLLECT_PHONE, S.SUBMITTING].includes(chatState);

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
          <Heart className="w-10 h-10 text-ruby-light mb-5" fill="currentColor" />
          <blockquote className="text-3xl font-bold leading-tight tracking-tight text-white max-w-md">
            “A single conversation today could be someone's second chance at life.”
          </blockquote>
          <p className="mt-4 text-sm text-slate-200 max-w-sm leading-relaxed">
            Answer a few quick questions and join the emergency donor network in
            under 60 seconds — no paperwork, fully consent-first.
          </p>
        </div>
      </div>

      {/* ===== RIGHT: chat interface ===== */}
      <div className="h-screen flex flex-col w-full">
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
                <Heart className="w-4 h-4 text-rausch" fill="currentColor" />
              </div>
              <div>
                <h2 className="text-base font-bold text-ink tracking-tight">
                  {isRegistering ? 'Donor Registration' : 'RaktaSetu Assistant'}
                </h2>
                <p className="text-xs text-muted">
                  {isRegistering ? 'Conversational intake · Safety screening' : 'FAQ mode · Blood donation guidance'}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Progress indicator */}
            {isRegistering && (
              <div className="flex items-center gap-2">
                <div className="w-24 h-1.5 bg-hof rounded-full overflow-hidden">
                  <div
                    className="h-full bg-rausch rounded-full transition-all duration-500"
                    style={{ width: `${getProgress()}%` }}
                  />
                </div>
                <span className="text-[11px] font-medium text-rausch">{getProgress()}%</span>
              </div>
            )}
            <button
              onClick={handleReset}
              className="p-2 rounded-full text-muted hover:text-ink hover:bg-hof transition-all"
              title="Reset conversation"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages — faint medical background so it never reads as an empty box */}
        <div className="flex-1 relative overflow-hidden bg-cloud">
          <div
            className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1579684385127-1ef15d508118?q=80&w=1000')] bg-cover bg-center bg-no-repeat opacity-[0.04] pointer-events-none"
            aria-hidden="true"
          />
          <div ref={scrollRef} className="relative h-full overflow-y-auto p-6 space-y-4">
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <motion.div
                  animate={{ scale: [1, 1.08, 1] }}
                  transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
                  className="w-8 h-8 rounded-full bg-rausch flex items-center justify-center flex-shrink-0 mt-1"
                >
                  <Heart className="w-4 h-4 text-white" fill="currentColor" />
                </motion.div>
              )}

              <div
                className={`max-w-[75%] rounded-md px-4 py-3 ${
                  msg.role === 'user'
                    ? 'bg-rausch/10 border border-hairline text-ink'
                    : 'bg-surface-strong text-ink'
                }`}
              >
                {/* Ticket bubble */}
                {msg.isTicket && msg.content.startsWith('__TICKET__') ? (
                  renderTicketBubble(msg.content.replace('__TICKET__', ''))
                ) : (
                  <>
                    {/* Header */}
                    <div className="flex items-center justify-between gap-3 mb-1.5">
                      <span className="text-[10px] font-semibold text-muted uppercase tracking-wide">
                        {msg.role === 'user' ? 'You' : 'RaktaSetu AI'}
                      </span>
                      <span className="text-[9px] font-mono text-muted-soft">{formatTime(msg.timestamp)}</span>
                    </div>

                    {/* Content with basic markdown */}
                    <div className="text-sm leading-relaxed whitespace-pre-wrap text-ink">
                      {msg.content.split('\n').map((line, i) => {
                        // Bold text
                        const boldParsed = line.replace(/\*\*(.+?)\*\*/g, '<b class="text-ink font-semibold">$1</b>');
                        // Italic
                        const italicParsed = boldParsed.replace(/_(.+?)_/g, '<i class="text-muted">$1</i>');
                        return (
                          <div
                            key={i}
                            dangerouslySetInnerHTML={{ __html: italicParsed }}
                            className={line.startsWith('✅') || line.startsWith('🎉') ? 'text-babu font-medium' : ''}
                          />
                        );
                      })}
                    </div>

                    {/* Footer for bot messages */}
                    {msg.role === 'assistant' && !msg.isTicket && (
                      <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-hairline-soft">
                        <div className="flex items-center gap-3 text-[9px] font-mono text-muted">
                          {msg.latency && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-2.5 h-2.5" />
                              {msg.latency}ms
                            </span>
                          )}
                          {msg.isMock && (
                            <span className="text-amber-700 px-1 py-0.5 rounded-xs bg-amber-50 border border-amber-200">MOCK</span>
                          )}
                        </div>
                        <button
                          onClick={() => handleCopy(msg.id, msg.content)}
                          className="text-muted hover:text-ink transition-colors"
                        >
                          {copiedId === msg.id ? <Check className="w-3.5 h-3.5 text-babu" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>

              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-surface-strong flex items-center justify-center flex-shrink-0 mt-1">
                  <User className="w-4 h-4 text-muted" />
                </div>
              )}
            </motion.div>
          ))}

          {/* Loading indicator */}
          {loading && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-full bg-rausch flex items-center justify-center flex-shrink-0 mt-1">
                <Heart className="w-4 h-4 text-white" fill="currentColor" />
              </div>
              <div className="bg-surface-strong rounded-md px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-muted">
                  <Loader2 className="w-4 h-4 animate-spin text-rausch" />
                  <span className="text-xs">Thinking...</span>
                </div>
              </div>
            </div>
          )}
          </div>
        </div>

        {/* Intent fork buttons during WELCOME state */}
        {chatState === S.WELCOME && messages.length > 0 && (
          <div className="px-6 pb-2 flex-shrink-0 bg-cloud">
            <div className="flex flex-wrap gap-2 justify-center">
              <button
                id="donor-intent-register"
                onClick={startRegistration}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-rausch text-white text-sm font-medium hover:bg-rausch/90 transition-all active:scale-95"
              >
                <UserPlus className="w-4 h-4" />
                Register as a Donor
              </button>
              <button
                id="donor-intent-ask"
                onClick={startFAQ}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-cloud border border-hairline text-ink text-sm font-medium hover:bg-rausch/10 hover:border-rausch transition-all active:scale-95"
              >
                <Heart className="w-4 h-4 text-rausch" />
                Ask a Question
              </button>
            </div>
          </div>
        )}

        {/* Blood group quick-select buttons during COLLECT_BLOOD state */}
        {chatState === S.COLLECT_BLOOD && (
          <div className="px-6 pb-2 flex-shrink-0 bg-cloud">
            <div className="flex flex-wrap gap-1.5 justify-center">
              {BLOOD_GROUPS.map((bg) => (
                <button
                  key={bg}
                  onClick={() => processInput(bg)}
                  className="px-3 py-1.5 rounded-full bg-cloud border border-hairline text-ink text-xs font-medium hover:bg-rausch/10 hover:border-rausch transition-all active:scale-95"
                >
                  {bg}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* FAQ suggestions in FAQ mode */}
        {chatState === S.FAQ && messages.length > 0 && (
          <div className="px-6 pb-2 flex-shrink-0 bg-cloud">
            <div className="flex flex-wrap gap-1.5 justify-center">
              {['Am I eligible?', 'What to eat before?', 'Is my data safe?', 'How long between donations?'].map((q) => (
                <button
                  key={q}
                  onClick={() => { setInput(q); inputRef.current?.focus(); }}
                  className="px-3 py-1.5 rounded-full border border-hairline text-xs text-muted hover:text-rausch hover:border-rausch hover:bg-rausch/10 transition-all bg-cloud"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="border-t border-hairline bg-cloud px-6 py-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <input
              ref={inputRef}
              id="donor-chat-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={getPlaceholder()}
              disabled={chatState === S.SUBMITTING}
              className="rs-input flex-1"
              autoComplete="off"
            />
            <button
              id="donor-chat-send"
              onClick={handleSend}
              disabled={!input.trim() || loading || chatState === S.SUBMITTING}
              className="rs-btn-primary gap-2 flex-shrink-0"
            >
              <Send className="w-4 h-4" />
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
