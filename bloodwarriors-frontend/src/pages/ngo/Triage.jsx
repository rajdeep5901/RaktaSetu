import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Crosshair,
  Send,
  AlertTriangle,
  Loader2,
  Droplets,
  MapPin,
  Brain,
  ArrowRight,
} from 'lucide-react';
import api from '../../lib/api';

/* ============================================================
   AI Triage — Emergency Alert Intake (light enterprise tool)
   Left: alert intake · Right: classification results
   ============================================================ */

const MOCK_TRIAGE_RESPONSE = {
  triage_id: 9001,
  urgency: 'CRITICAL',
  reasoning:
    'Patient presents with acute hemorrhagic shock indicators — car accident with heavy bleeding reported. Immediate O Negative transfusion required. Multi-unit mobilization recommended. Hospital trauma bay should be prepped for massive transfusion protocol (MTP). Cross-match delay risk is unacceptable at this urgency level.',
  recommended_blood_groups: ['O Negative', 'O Positive'],
};

const SAMPLE_ALERTS = [
  `🚨 URGENT: Car accident victim at City Hospital ICU. Severe blood loss, BP dropping. Need 4 units O Negative ASAP. Contact Dr. Mehta ward 3B. Family is here, consent available.`,
  `Patient admitted to Lifeline Trauma Center. Post-surgery complications, internal bleeding suspected. AB Positive needed. 2 units minimum. Hemoglobin at 5.2.`,
];

export default function Triage({ toast }) {
  const navigate = useNavigate();
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [showMock, setShowMock] = useState(false);
  const textareaRef = useRef(null);

  const handleTriage = async () => {
    if (!inputText.trim() || loading) return;

    setLoading(true);
    setResult(null);
    setShowMock(false);

    try {
      const res = await api.post('/triage', {
        patient_description: inputText.trim(),
        blood_group_needed: null,
      });
      setResult(res.data);
      toast.addToast(
        `Triage complete — Urgency: ${res.data.urgency}`,
        res.data.urgency === 'CRITICAL' ? 'error' : 'success',
      );
    } catch {
      setShowMock(true);
      setResult(MOCK_TRIAGE_RESPONSE);
      toast.addToast(
        'Backend unreachable — showing demo triage data for evaluation.',
        'system',
        6000,
      );
    } finally {
      setLoading(false);
    }
  };

  const loadSample = (index) => {
    setInputText(SAMPLE_ALERTS[index]);
    textareaRef.current?.focus();
  };

  const urgencyBadge = (urgency) => {
    const map = {
      CRITICAL: 'rs-badge-critical',
      MODERATE: 'rs-badge-moderate',
      LOW: 'rs-badge-low',
    };
    return map[urgency] || 'rs-badge-moderate';
  };

  const goToMatch = () => {
    const bg = result?.recommended_blood_groups?.[0] || '';
    const params = new URLSearchParams({
      blood_group: bg,
      urgency: result?.urgency || '',
    });
    navigate(`/ngo/match?${params.toString()}`);
  };

  const destClinic =
    inputText.match(
      /(?:at|to|from|@)\s+([A-Z][A-Za-z\s]+(?:Hospital|Clinic|Center|Centre|ICU|Ward|Medical))/,
    )?.[1] || 'Extracted from alert context';

  return (
    <div className="h-full flex overflow-hidden">
      {/* ===== LEFT PANEL: Intake ===== */}
      <div className="w-1/2 flex flex-col border-r border-hairline bg-cloud overflow-y-auto">
        <div className="p-6 flex flex-col flex-1">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-md bg-rausch/10 flex items-center justify-center flex-shrink-0">
              <Crosshair className="w-4.5 h-4.5 text-rausch" />
            </div>
            <h2 className="text-lg font-semibold text-ink tracking-tight">Emergency Alert Intake</h2>
          </div>
          <p className="text-sm text-muted mb-4 ml-12">
            Paste an incoming emergency alert to classify its urgency.
          </p>

          <textarea
            ref={textareaRef}
            id="triage-intake-input"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Paste the emergency alert here… e.g. “Car accident victim at City Hospital ICU. Severe blood loss, need 4 units O Negative ASAP.”"
            className="w-full min-h-[200px] flex-1 rounded-md border border-hairline bg-cloud p-4 text-sm text-ink placeholder-muted leading-relaxed resize-none transition-colors duration-150 focus:border-rausch focus:outline-none"
            spellCheck={false}
          />

          {/* Sample alerts */}
          <div className="mt-4">
            <div className="text-xs text-muted mb-2">Sample alerts</div>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_ALERTS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => loadSample(i)}
                  className="rounded-full border border-hairline bg-cloud px-4 py-1.5 text-sm font-medium text-body transition-colors duration-150 hover:border-ink"
                >
                  Sample {i + 1}
                </button>
              ))}
            </div>
          </div>

          {/* Execute */}
          <button
            id="triage-execute-btn"
            onClick={handleTriage}
            disabled={!inputText.trim() || loading}
            className="rs-btn-primary mt-6 w-full gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Classifying urgency…
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Classify Urgency
              </>
            )}
          </button>
        </div>
      </div>

      {/* ===== RIGHT PANEL: Results ===== */}
      <div className="w-1/2 flex flex-col bg-cloud overflow-y-auto">
        <div className="p-6 flex-1">
          {/* Empty state */}
          {!result && (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-full bg-surface-strong flex items-center justify-center mb-4">
                <Crosshair className="w-7 h-7 text-muted" />
              </div>
              <p className="text-base font-medium text-ink">Waiting for triage submission</p>
              <p className="text-sm text-muted mt-1 max-w-xs">
                Submit an emergency alert on the left to classify its urgency and recommended blood groups.
              </p>
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted">
                  Triage ID · #{String(result.triage_id).padStart(6, '0')}
                </span>
                {showMock && <span className="text-sm text-muted">Demo data</span>}
              </div>

              <div className="rs-card p-5 space-y-5">
                {/* Urgency */}
                <div>
                  <div className="text-xs text-muted uppercase tracking-wide mb-2">Urgency</div>
                  <span className={urgencyBadge(result.urgency)}>{result.urgency}</span>
                </div>

                {/* Blood groups */}
                <div>
                  <div className="flex items-center gap-1.5 text-xs text-muted uppercase tracking-wide mb-2">
                    <Droplets className="w-3.5 h-3.5" />
                    Recommended blood groups
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(result.recommended_blood_groups || []).map((bg) => (
                      <span
                        key={bg}
                        className="rounded-full bg-rausch/10 border border-rausch/20 px-3 py-1 text-sm font-medium text-rausch"
                      >
                        {bg}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Destination clinic */}
                <div>
                  <div className="flex items-center gap-1.5 text-xs text-muted uppercase tracking-wide mb-2">
                    <MapPin className="w-3.5 h-3.5" />
                    Destination clinic
                  </div>
                  <p className="text-sm text-body">{destClinic}</p>
                </div>

                {/* AI reasoning */}
                <div>
                  <div className="flex items-center gap-1.5 text-xs text-muted uppercase tracking-wide mb-2">
                    <Brain className="w-3.5 h-3.5" />
                    AI reasoning
                  </div>
                  <blockquote className="rounded-md bg-surface-strong border-l-4 border-rausch px-4 py-3 text-sm text-body leading-relaxed">
                    {result.reasoning}
                  </blockquote>
                </div>
              </div>

              {/* Triage → Match bridge */}
              <button
                id="triage-to-match-btn"
                onClick={goToMatch}
                className="rs-btn-primary w-full gap-2"
              >
                Find Matching Donors
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
