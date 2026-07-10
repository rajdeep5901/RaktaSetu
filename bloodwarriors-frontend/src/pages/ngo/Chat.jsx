import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Send,
  Loader2,
  Database,
  Clock,
  Copy,
  Check,
  RotateCcw,
  Cpu,
  Brain,
  Network,
  Shield,
  Activity,
  Gauge,
} from 'lucide-react';
import api from '../../lib/api';
import ParticleGraph from '../../components/ParticleGraph';

/* ============================================================
   RaktaSetu Intelligence — Agentic RAG Chat
   ============================================================
   Scoped to operational intelligence: graph traversal, match
   model architecture, feature weights, pipeline metrics, and
   system diagnostics. (Not the donor-facing chat — DonorChat.jsx.)
   ============================================================ */

function generateSessionId() {
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  const block = (len) => Array.from({ length: len }, hex).join('');
  return `${block(8)}-${block(4)}-4${block(3)}-${block(4)}-${block(12)}`;
}

/* Mock responses scoped to operational intelligence */
const TACTICAL_RESPONSES = [
  `**Match Model Architecture — LightGBM Hybrid Fusion**

The RaktaSetu matching pipeline is a 4-stage weighted ensemble:

| Component | Weight (CRITICAL) | Weight (LOW) | Source |
|---|---|---|---|
| ML Probability | 55% | 45% | LightGBM \`predict_proba\` on donor features |
| Reliability Score | 25% | 25% | \`donations_till_date / max(donations)\` normalized |
| Cycle Readiness | 15% | 10% | Days since last donation vs. 56-day eligibility window |
| Proximity Score | 5% | 20% | Haversine distance (lat/lng), inversely weighted |

Weights shift dynamically based on the \`urgency\` parameter. CRITICAL cases maximize ML probability; LOW urgency cases increase proximity weight for logistical efficiency.`,

  `**Active Feature Weights — RandomForest Classifier**

Feature importances from the trained model (top 8):

\`\`\`
1. donations_till_date      0.2847  ████████████████
2. frequency_in_days         0.1923  ████████████
3. calls_to_donations_ratio  0.1456  █████████
4. cycle_of_donations        0.1203  ████████
5. eligibility_status_enc    0.0891  ██████
6. donor_type_enc            0.0734  █████
7. total_calls               0.0521  ████
8. role_status_enc           0.0425  ███
\`\`\`

The model achieves 87.3% accuracy on the validation split. \`donations_till_date\` dominates because it strongly correlates with donor reliability and response rate.`,

  `**Operational Metrics — Current Pipeline Status**

• **SQLite DB**: Active — WAL mode enabled for concurrent reads
• **KùzuDB Graph**: Traversing — Session memory + donor↔patient relationships
• **Consent Filter**: Enforced — \`/match\` endpoint filters \`consent_given=True\` only
• **DPDP Compliance**: Active — Revocation is irreversible per session, audit-logged
• **WhatsApp Dispatch**: Operational — \`wa.me\` deep links with pre-encoded outreach
• **Triage Classifier**: Gemini 2.0 Flash — 3-tier urgency (CRITICAL/MODERATE/LOW)
• **CSV Ingest**: Defensive — \`phone_number=None\` fallback for legacy records

All systems nominal. Zero infrastructure cost maintained ($0/month stack).`,

  `**Graph Traversal — KùzuDB Memory Architecture**

The conversational RAG uses a 4-node graph schema:

\`\`\`
DonorNode ──DONATED_TO──▶ PatientNode
    │                         ▲
    └──MATCHED_WITH───────────┘

ChatSession ──HAS_MESSAGE──▶ ChatMessage
\`\`\`

Each chat message is stored as a \`ChatMessage\` node connected to its \`ChatSession\` via temporal \`HAS_MESSAGE\` edges with \`message_order\` indexing. This enables:
- **Context retrieval**: Last N messages by session ID
- **Cross-session analysis**: Find all sessions mentioning a blood group
- **Donor-patient mapping**: Traverse MATCHED_WITH edges for coordination history

The graph is embedded (no network calls) and initializes lazily on first connection.`,
];

export default function Chat({ toast }) {
  const sessionId = useMemo(() => generateSessionId(), []);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const mockIndexRef = useRef(0);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMsg = {
      id: Date.now(),
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await api.post('/chat', {
        session_id: sessionId,
        message: trimmed,
        user_id: 'command-center-operator',
      });

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'assistant',
          content: res.data.response,
          timestamp: new Date(),
          latency: res.latency,
          sessionConfirm: res.data.session_id,
        },
      ]);
    } catch {
      // Graceful fallback with mock intelligence response
      const mockResp = TACTICAL_RESPONSES[mockIndexRef.current % TACTICAL_RESPONSES.length];
      mockIndexRef.current += 1;

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'assistant',
          content: mockResp,
          timestamp: new Date(),
          latency: 42,
          isMock: true,
          sessionConfirm: sessionId,
        },
      ]);

      toast.addToast('Backend offline — sample intelligence response generated.', 'system', 4000);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
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
    toast.addToast('Conversation cleared. New session context initialized.', 'info');
  };

  const formatTime = (date) =>
    date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  /* Suggested intelligence queries */
  const SUGGESTED_QUERIES = [
    { text: 'Show match model architecture', icon: Cpu },
    { text: 'List active feature weights', icon: Network },
    { text: 'Report operational metrics', icon: Gauge },
    { text: 'Explain graph traversal schema', icon: Database },
    { text: 'What is the consent filter logic?', icon: Shield },
    { text: 'How does urgency affect scoring?', icon: Activity },
  ];

  return (
    <div className="h-full flex flex-col bg-cloud">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-hairline flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-rausch flex items-center justify-center">
            <Brain className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-ink tracking-tight">RaktaSetu Intelligence</h2>
            <p className="text-xs text-muted">
              Ask about matching, feature weights, graph schema, and pipeline health
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Session pill */}
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-strong text-xs text-muted font-mono">
            <Database className="w-3 h-3 text-rausch" />
            {sessionId.slice(0, 8)}
          </span>

          {/* Messages count */}
          <span className="text-xs text-muted">
            Messages: <span className="text-ink font-semibold tabular-nums">{messages.length}</span>
          </span>

          {/* Reset */}
          <button
            onClick={handleReset}
            className="p-2 rounded-full text-muted hover:text-ink hover:bg-surface-strong transition-colors"
            title="Reset conversation"
            id="chat-reset-btn"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages Area — faint node-graph texture for depth (text stays fully readable) */}
      <div className="flex-1 relative overflow-hidden">
        <div
          className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1000')] bg-cover bg-center bg-no-repeat opacity-[0.05] pointer-events-none"
          aria-hidden="true"
        />
        {/* Live constellation backdrop — kept at low opacity so message text stays readable */}
        <ParticleGraph
          className="absolute inset-0 w-full h-full z-0 opacity-40 pointer-events-none"
          nodeCount={100}
        />
        <div ref={scrollRef} className="relative z-10 h-full overflow-y-auto p-6 space-y-4">
        {/* Welcome / empty state */}
        {messages.length === 0 && !loading && (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full bg-rausch/10 flex items-center justify-center mb-5">
              <Brain className="w-8 h-8 text-rausch" />
            </div>
            <p className="text-base font-semibold text-ink">How can I help?</p>
            <p className="text-sm text-muted mt-2 max-w-md leading-relaxed">
              Ask about the match model, feature weights, graph traversal schema, consent
              logic, pipeline metrics, or system diagnostics.
            </p>
            <div className="grid grid-cols-2 gap-3 mt-8 max-w-xl w-full">
              {SUGGESTED_QUERIES.map(({ text, icon: Icon }) => (
                <button
                  key={text}
                  onClick={() => { setInput(text); inputRef.current?.focus(); }}
                  className="rs-card flex items-center gap-3 px-4 py-3 text-left hover:border-rausch/40"
                >
                  <span className="w-8 h-8 rounded-full bg-surface-strong flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-rausch" />
                  </span>
                  <span className="text-sm text-ink truncate">{text}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message Bubbles */}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-rausch flex items-center justify-center flex-shrink-0 mt-1">
                <Cpu className="w-4 h-4 text-white" />
              </div>
            )}

            <div
              className={`max-w-[72%] rounded-md px-4 py-3 text-ink ${
                msg.role === 'user'
                  ? 'bg-rausch/10 border border-hairline'
                  : 'bg-surface-strong'
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted">
                    {msg.role === 'user' ? 'You' : 'RaktaSetu AI'}
                  </span>
                  {msg.isMock && (
                    <span className="text-[10px] font-medium text-amber-700 px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-200">
                      Sample
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-muted-soft">{formatTime(msg.timestamp)}</span>
              </div>

              {/* Content — render markdown-like formatting for assistant */}
              {msg.role === 'assistant' ? (
                <div className="text-sm leading-relaxed whitespace-pre-wrap space-y-1">
                  {msg.content.split('\n').map((line, i) => {
                    // Bold headers
                    if (line.startsWith('**') && line.endsWith('**')) {
                      return <div key={i} className="font-bold text-ink text-[13px] mt-2 mb-1">{line.replace(/\*\*/g, '')}</div>;
                    }
                    // Code fences
                    if (line.startsWith('```')) return null;
                    // Table header dividers
                    if (/^\|[-|]+\|$/.test(line.trim())) return null;
                    // Table rows
                    if (line.startsWith('|')) {
                      const cells = line.split('|').filter(Boolean).map(c => c.trim());
                      return (
                        <div key={i} className="font-mono text-xs grid grid-cols-4 gap-1 py-1 px-2 rounded-xs odd:bg-surface-strong">
                          {cells.map((cell, j) => (
                            <span key={j} className={j === 0 ? 'text-ink font-medium' : 'text-body'}>{cell}</span>
                          ))}
                        </div>
                      );
                    }
                    // Monospace lines (feature weight bars)
                    if (/^\d+\./.test(line.trim()) && line.includes('█')) {
                      return <div key={i} className="font-mono text-[11px] text-babu bg-cloud rounded-xs px-2 py-0.5 border border-hairline-soft">{line}</div>;
                    }
                    // Bullet points
                    if (line.trim().startsWith('•')) {
                      return <div key={i} className="text-body pl-1">{line}</div>;
                    }
                    // Regular text
                    return <div key={i} className="text-body">{line}</div>;
                  })}
                </div>
              ) : (
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-ink">{msg.content}</p>
              )}

              {/* Footer for assistant messages */}
              {msg.role === 'assistant' && (
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-hairline">
                  <div className="flex items-center gap-3 text-[10px] text-muted">
                    {msg.latency && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        {msg.latency}ms
                      </span>
                    )}
                    {msg.sessionConfirm && (
                      <span className="flex items-center gap-1 font-mono">
                        <Database className="w-2.5 h-2.5" />
                        {msg.sessionConfirm.slice(0, 8)}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleCopy(msg.id, msg.content)}
                    className="text-muted hover:text-ink transition-colors"
                    title="Copy response"
                  >
                    {copiedId === msg.id ? (
                      <Check className="w-3.5 h-3.5 text-babu" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              )}
            </div>

            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-full bg-surface-strong flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-xs font-semibold text-ink">You</span>
              </div>
            )}
          </div>
        ))}

        {/* Loading indicator */}
        {loading && (
          <div className="flex gap-3 justify-start">
            <div className="w-8 h-8 rounded-full bg-rausch flex items-center justify-center flex-shrink-0 mt-1">
              <Cpu className="w-4 h-4 text-white" />
            </div>
            <div className="bg-surface-strong rounded-md px-4 py-3">
              <div className="text-xs font-semibold text-muted mb-2">RaktaSetu AI</div>
              <div className="flex items-center gap-2 text-sm text-body">
                <Loader2 className="w-4 h-4 animate-spin text-rausch" />
                <span>Thinking…</span>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t border-hairline px-6 py-4 flex-shrink-0">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <textarea
              ref={inputRef}
              id="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about model weights, graph schema, or pipeline metrics…"
              rows={1}
              className="w-full rounded-full border border-hairline bg-cloud px-5 py-3 text-sm text-ink placeholder-muted resize-none min-h-[48px] max-h-[120px] transition-colors focus:border-rausch focus:outline-none"
              style={{ height: 'auto', overflow: input.includes('\n') ? 'auto' : 'hidden' }}
              onInput={(e) => {
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
              }}
            />
          </div>
          <button
            id="chat-send-btn"
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="w-12 h-12 rounded-full bg-rausch text-white flex items-center justify-center flex-shrink-0 transition-all duration-150 hover:bg-rausch-dark active:scale-95 disabled:cursor-not-allowed disabled:bg-primary-disabled"
            title="Send"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
