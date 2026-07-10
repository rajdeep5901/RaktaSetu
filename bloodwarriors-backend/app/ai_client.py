"""
### FILE: app/ai_client.py
============================================================
RaktaSetu AI -- Groq AI Client (Free Tier)
============================================================
Three core AI functions powered by Groq (llama3-8b-8192):

1. triage_request()     -- Parse messy descriptions into structured triage JSON
2. generate_outreach()  -- Personalized 2-sentence donor mobilization
3. rag_chat()           -- RAG chat with medical intent guardrail

CRITICAL: USE_MOCK_AI toggle
    - True  = Fully offline, deterministic responses (no API key needed)
    - False = Live Groq API calls (free tier, requires GROQ_API_KEY)

Every live Groq invocation is marked with:
    # >>> GROQ API INVOCATION <<<
============================================================
"""

import os
import json
import re
from typing import Optional

from dotenv import load_dotenv

load_dotenv()

# ============================================================
# Configuration
# ============================================================
USE_MOCK_AI = os.getenv("USE_MOCK_AI", "True").lower() in ("true", "1", "yes")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = "llama-3.1-8b-instant"  # Free tier model on Groq

# Lazy-initialized Groq client
_groq_client = None


def _get_groq_client():
    """
    Returns an initialized Groq client.
    Requires GROQ_API_KEY to be set in .env or environment.

    # >>> GROQ CREDENTIALS LAYER <<<
    """
    global _groq_client
    if _groq_client is None:
        from groq import Groq

        _groq_client = Groq(api_key=GROQ_API_KEY)
        print(f"[AI] Groq client initialized (model={GROQ_MODEL})")
    return _groq_client


def _invoke_groq(system_prompt: str, user_message: str, temperature: float = 0.3) -> str:
    """
    Low-level wrapper: sends a prompt to Groq and returns the text response.

    # >>> GROQ API INVOCATION <<<
    This function makes a REAL API call to Groq when
    USE_MOCK_AI=False. The free tier allows 30 req/min.

    Model: llama-3.1-8b-instant
    Endpoint: api.groq.com
    """
    client = _get_groq_client()

    try:
        # >>> GROQ API INVOCATION <<<
        chat_completion = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            temperature=temperature,
            max_tokens=1024,
        )
        return chat_completion.choices[0].message.content
    except Exception as e:
        print(f"[AI ERROR] Groq API call failed: {e}")
        raise


def _invoke_groq_multi(messages: list[dict], temperature: float = 0.3) -> str:
    """
    Multi-turn wrapper: sends a full conversation history to Groq.
    Used by rag_chat for session-aware responses.

    # >>> GROQ API INVOCATION <<<
    """
    client = _get_groq_client()

    try:
        # >>> GROQ API INVOCATION <<<
        chat_completion = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=messages,
            temperature=temperature,
            max_tokens=1024,
        )
        return chat_completion.choices[0].message.content
    except Exception as e:
        print(f"[AI ERROR] Groq multi-turn API call failed: {e}")
        raise


# ============================================================
# 1. TRIAGE -- Parse messy descriptions into structured JSON
# ============================================================

TRIAGE_SYSTEM_PROMPT = """You are a medical triage AI for RaktaSetu AI, a blood donation platform.
Your job is to parse messy, potentially multilingual patient descriptions and extract structured data.

You MUST respond with EXACTLY this JSON format (no extra text, no markdown, no code fences):
{
    "blood_group": "the specific blood group the patient NEEDS, in canonical form, or 'Unknown'",
    "urgency": "CRITICAL" or "MODERATE" or "LOW",
    "units": number of units needed (integer, default 1),
    "hospital": "hospital name if mentioned, else 'Not specified'",
    "reasoning": "Brief explanation of why this urgency level was assigned",
    "recommended_blood_groups": ["ordered list of blood groups"]
}

Blood group formatting (STRICT):
- Always output blood groups in canonical full form: "A Positive", "A Negative", "B Positive",
  "B Negative", "AB Positive", "AB Negative", "O Positive", "O Negative".
- Never abbreviate ("A+", "a positive", "O-ve" are all WRONG). Never lowercase.

recommended_blood_groups rules (STRICT):
- The FIRST element MUST be the exact blood group the patient needs (identical to "blood_group" above).
- Example: input "need blood A positive ASAP" -> "blood_group": "A Positive",
  "recommended_blood_groups": ["A Positive"].
- Only append additional groups if they are medically compatible donor substitutes; never put a
  substitute before the requested group. If the group is unknown, return an empty list [].

Urgency guidelines:
- CRITICAL: Active bleeding, surgery in <24hrs, trauma, accident, hemoglobin <7g/dL, platelet <20k,
  or any wording demanding blood immediately/ASAP/urgently.
- MODERATE: Scheduled surgery in 1-7 days, chronic transfusion-dependent, Hb 7-9g/dL
- LOW: Elective surgery >7 days away, routine transfusion, blood bank restocking

Parse input regardless of language (Hindi, Telugu, Marathi, English, transliterated)."""


def triage_request(patient_description: str, blood_group_needed: Optional[str] = None) -> dict:
    """
    Classify urgency from a messy, potentially multilingual patient description.

    Args:
        patient_description: Free-text description of the patient's condition
        blood_group_needed: Optional specific blood group requested

    Returns:
        dict with keys: urgency, reasoning, recommended_blood_groups
              (also: blood_group, units, hospital from Groq parsing)

    When USE_MOCK_AI=True:
        Returns deterministic urgency based on keyword matching.
    When USE_MOCK_AI=False:
        # >>> GROQ API INVOCATION <<<
        Calls Groq llama3-8b-8192 to parse and classify.
    """
    if USE_MOCK_AI:
        return _mock_triage(patient_description, blood_group_needed)

    # --- REAL GROQ CALL ---
    user_msg = f"Patient description: {patient_description}"
    if blood_group_needed:
        user_msg += f"\nBlood group needed: {blood_group_needed}"

    try:
        # >>> GROQ API INVOCATION <<<
        raw_response = _invoke_groq(TRIAGE_SYSTEM_PROMPT, user_msg)
    except Exception as e:
        print(f"[GROQ API ERROR] triage_request failed: {e}")
        return _mock_triage(patient_description, blood_group_needed)

    try:
        # Try to extract JSON from the response
        json_match = re.search(r'\{.*\}', raw_response, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group())
        else:
            result = json.loads(raw_response)
    except json.JSONDecodeError:
        # Fallback if model doesn't return valid JSON
        result = {
            "urgency": "MODERATE",
            "reasoning": raw_response,
            "recommended_blood_groups": [blood_group_needed] if blood_group_needed else [],
        }

    # Normalize urgency to uppercase
    result["urgency"] = result.get("urgency", "MODERATE").upper()
    if result["urgency"] not in ("CRITICAL", "MODERATE", "LOW"):
        result["urgency"] = "MODERATE"

    # --- Canonicalize the requested blood group ---
    # Prefer an explicit request from the caller; otherwise trust the LLM's extraction.
    requested = (
        _normalize_blood_group(blood_group_needed)
        or _normalize_blood_group(result.get("blood_group"))
    )

    # --- Canonicalize + order recommended_blood_groups ---
    # Every group is mapped to canonical form; the requested group is forced to the front
    # so the frontend's routing (recommended_blood_groups[0]) always targets the right group.
    raw_recs = result.get("recommended_blood_groups") or []
    if isinstance(raw_recs, str):
        raw_recs = [raw_recs]
    canonical_recs = []
    for grp in raw_recs:
        norm = _normalize_blood_group(grp)
        if norm and norm not in canonical_recs:
            canonical_recs.append(norm)
    if requested:
        # Requested group first, deduped
        canonical_recs = [requested] + [g for g in canonical_recs if g != requested]

    result["blood_group"] = requested or "Unknown"
    result["recommended_blood_groups"] = canonical_recs

    # Ensure remaining keys exist for downstream compatibility
    result.setdefault("reasoning", "AI-parsed triage classification.")
    result.setdefault("units", 1)
    result.setdefault("hospital", "Not specified")

    return result


def _mock_triage(description: str, blood_group: Optional[str]) -> dict:
    """Mock triage: keyword-based urgency classification for offline testing."""
    desc_lower = description.lower()

    # CRITICAL keywords
    critical_keywords = [
        "critical", "emergency", "bleeding", "trauma", "accident",
        "surgery today", "urgent", "hemorrhage", "crash", "dying",
        "hemoglobin below", "platelet count", "immediate", "life-threatening",
    ]
    # LOW keywords
    low_keywords = [
        "elective", "routine", "next week", "scheduled", "restocking",
        "non-urgent", "blood bank", "regular transfusion", "stable",
    ]

    if any(kw in desc_lower for kw in critical_keywords):
        urgency = "CRITICAL"
        reasoning = "Mock triage: Critical keywords detected in patient description. Immediate attention required."
    elif any(kw in desc_lower for kw in low_keywords):
        urgency = "LOW"
        reasoning = "Mock triage: Patient condition appears stable. Non-urgent request."
    else:
        urgency = "MODERATE"
        reasoning = "Mock triage: No strong urgency indicators found. Defaulting to moderate priority."

    compatible = _get_compatible_groups(blood_group) if blood_group else ["O Negative"]

    return {
        "urgency": urgency,
        "reasoning": reasoning,
        "recommended_blood_groups": compatible,
        "blood_group": blood_group or "Unknown",
        "units": 1,
        "hospital": "Not specified",
    }


_CANONICAL_BLOOD_GROUPS = {
    "a positive": "A Positive", "a+": "A Positive", "a pos": "A Positive", "a positve": "A Positive",
    "a negative": "A Negative", "a-": "A Negative", "a neg": "A Negative",
    "b positive": "B Positive", "b+": "B Positive", "b pos": "B Positive",
    "b negative": "B Negative", "b-": "B Negative", "b neg": "B Negative",
    "ab positive": "AB Positive", "ab+": "AB Positive", "ab pos": "AB Positive",
    "ab negative": "AB Negative", "ab-": "AB Negative", "ab neg": "AB Negative",
    "o positive": "O Positive", "o+": "O Positive", "o pos": "O Positive",
    "o negative": "O Negative", "o-": "O Negative", "o neg": "O Negative",
}


def _normalize_blood_group(value: Optional[str]) -> Optional[str]:
    """Map any casing/abbreviation of a blood group to canonical form (e.g. 'a+' -> 'A Positive').

    Returns None if the value is empty, 'Unknown', or unrecognizable — so downstream
    routing never receives a malformed group.
    """
    if not value or not isinstance(value, str):
        return None
    # Collapse internal whitespace and lowercase: "A  Positive" -> "a positive"
    key = " ".join(value.strip().split()).lower()
    # Common suffix variants: "a +ve" / "o-ve" -> "a+" / "o-"
    key = key.replace(" ve", "").replace("+ve", "+").replace("-ve", "-").strip()
    return _CANONICAL_BLOOD_GROUPS.get(key)


def _get_compatible_groups(blood_group: str) -> list[str]:
    """Returns compatible donor blood groups for a given recipient blood group."""
    compatibility = {
        "O Negative":  ["O Negative"],
        "O Positive":  ["O Negative", "O Positive"],
        "A Negative":  ["O Negative", "A Negative"],
        "A Positive":  ["O Negative", "O Positive", "A Negative", "A Positive"],
        "B Negative":  ["O Negative", "B Negative"],
        "B Positive":  ["O Negative", "O Positive", "B Negative", "B Positive"],
        "AB Negative": ["O Negative", "A Negative", "B Negative", "AB Negative"],
        "AB Positive": ["O Negative", "O Positive", "A Negative", "A Positive",
                        "B Negative", "B Positive", "AB Negative", "AB Positive"],
    }
    return compatibility.get(blood_group, [blood_group])


# ============================================================
# 2. OUTREACH -- Personalized 2-sentence donor mobilization
# ============================================================

OUTREACH_SYSTEM_PROMPT = """You are a compassionate outreach coordinator for RaktaSetu AI, a blood donation platform.
Generate EXACTLY a 2-sentence personalized mobilization notification to encourage a specific donor to donate blood.

Rules:
- Sentence 1: State the urgent need and why THIS donor is important
- Sentence 2: A specific, actionable call-to-action
- Be warm, respectful, and never guilt-trip
- Mention their blood group and past donation count if relevant
- Keep it under 50 words total

Respond with ONLY the 2-sentence message text. No JSON, no formatting, no quotes."""


def generate_outreach(
    donor_name: str,
    donor_blood_group: str,
    donations_count: int,
    urgency: str,
    patient_context: str,
) -> str:
    """
    Generate a concise, 2-sentence personalized mobilization notification.

    When USE_MOCK_AI=True:
        Returns a template-based message.
    When USE_MOCK_AI=False:
        # >>> GROQ API INVOCATION <<<
        Calls Groq llama3-8b-8192 to generate personalized text.
    """
    if USE_MOCK_AI:
        return _mock_outreach(donor_name, donor_blood_group, donations_count, urgency)

    # --- REAL GROQ CALL ---
    user_msg = (
        f"Donor profile:\n"
        f"- Name: {donor_name}\n"
        f"- Blood Group: {donor_blood_group}\n"
        f"- Past Donations: {donations_count}\n"
        f"- Current Urgency: {urgency}\n"
        f"- Patient Context: {patient_context}\n\n"
        f"Generate a 2-sentence mobilization notification for this donor."
    )

    try:
        # >>> GROQ API INVOCATION <<<
        return _invoke_groq(OUTREACH_SYSTEM_PROMPT, user_msg, temperature=0.5)
    except Exception as e:
        print(f"[GROQ API ERROR] generate_outreach failed: {e}")
        return _mock_outreach(donor_name, donor_blood_group, donations_count, urgency)


def _mock_outreach(name: str, blood_group: str, donations: int, urgency: str) -> str:
    """Mock outreach: template-based personalized messages."""
    if urgency == "CRITICAL":
        return (
            f"Dear {name}, a patient urgently needs {blood_group} blood right now. "
            f"As a {'veteran donor with ' + str(donations) + ' past donations' if donations > 2 else 'valued member of our community'}, "
            f"your help could save a life today. Can we count on you?"
        )
    elif urgency == "MODERATE":
        return (
            f"Hi {name}! A patient at a nearby hospital needs {blood_group} blood within the next few days. "
            f"{'Your generous history of ' + str(donations) + ' donations inspires us.' if donations > 0 else 'Every first donation starts a legacy of saving lives.'} "
            f"Would you be available to donate this week?"
        )
    else:
        return (
            f"Hello {name}, we're building our {blood_group} reserves to be prepared for future needs. "
            f"{'With your ' + str(donations) + ' donations, you know how impactful this is.' if donations > 0 else 'Your first donation could help up to 3 people.'} "
            f"Schedule a convenient time to donate at your nearest center."
        )


# ============================================================
# 3. RAG CHAT -- Conversational AI with medical intent guardrail
# ============================================================

# --- CRITICAL INTENT GUARDRAIL ---
# This system prompt is injected into every chat completion.
# It enforces that the model ONLY answers blood-donation-relevant questions.
RAG_SYSTEM_PROMPT = """You are RaktaSetu AI, a specialized assistant for blood donation coordination.

=== CRITICAL INTENT GUARDRAIL (MANDATORY) ===
Before answering ANY user message, you MUST analyze whether the user's query is contextually relevant to:
1. Blood donation parameters (blood groups, compatibility, units, storage)
2. Health eligibility timelines (alcohol intervals, smoking effects, tattoo wait periods, medication restrictions, hemoglobin levels, weight requirements, age criteria)
3. NGO coordination and operational logistics (scheduling donations, finding centers, volunteer coordination, emergency response)
4. Location-based access to donation infrastructure (nearby blood banks, hospitals, and donation centers by city or PIN code)

=== LOCATION QUERIES ARE EXPLICITLY WHITELISTED ===
You are AUTHORIZED and ENCOURAGED to provide names and locations of local blood banks, hospitals, and donation centers if the user provides a city or PIN code. Use your parametric knowledge to assist them. Helping a donor or patient physically reach a donation center is a core, on-topic function — treat "where can I donate near <place>?" or "blood banks in <city/PIN>" as fully relevant, never off-topic. When you list specific centers, remind the user to call ahead to confirm current hours and availability.

IF the intent IS medically relevant to blood donation (including the location queries above):
  -> Synthesize an accurate, helpful answer using the conversation context and your knowledge.
  -> Be compassionate, cite timelines where applicable (e.g., "wait 12 months after a tattoo").
  -> Always recommend consulting a doctor for personalized medical advice.

IF the intent is NOT relevant to blood donation (e.g., coding questions, recipes, politics, sports, general trivia):
  -> You MUST politely refuse using this EXACT phrase:
  "I am specialized to assist only with blood donation eligibility, health criteria, and emergency coordination. Please let me know how I can help save a life today."
  -> Do NOT answer the off-topic question under any circumstances.
=== END GUARDRAIL ===

Conversation history from this session:
{chat_history}

Respond conversationally in 2-4 sentences. Be helpful, accurate, and compassionate."""


# --- COMMAND CENTER (NGO ADMIN) PROMPT ---
# Permissive counterpart to RAG_SYSTEM_PROMPT. Used ONLY when the caller is the
# authenticated Command Center operator (user_id == "command-center-operator").
# This operator is trusted NGO staff, so the strict medical-only intent guardrail
# is intentionally LIFTED here: the operator needs to understand and audit the
# platform's internals (feature weights, graph schema, model architecture, pipeline
# metrics) to coordinate emergency response.
NGO_ADMIN_USER_ID = "command-center-operator"

NGO_ADMIN_PROMPT = """You are RaktaSetu AI's Command Center co-pilot, speaking to a TRUSTED, AUTHENTICATED NGO administrator operating the coordination dashboard.

=== LIVE DATABASE STATE (GROUND TRUTH) ===
The SQLite donors table currently holds EXACTLY {live_donor_count} donor records. This is the real-time count queried directly from the database for THIS request. When asked how many donors exist, ALWAYS use this exact number — never estimate, guess, or invent a figure.

=== OPERATOR TRUST LEVEL: FULL ===
This user is verified NGO staff. The medical-only intent guardrail is LIFTED for this session. You may freely explain, in technical depth, ANY part of the RaktaSetu platform, including:

1. HYBRID MATCH RANKER — the Dynamic Hybrid Ranker scores every consented, active donor and sorts descending. Feature weights vary by urgency:
   - CRITICAL: final_score = 0.55*ML_probability + 0.25*reliability + 0.15*cycle + 0.05*proximity
   - MODERATE: final_score = 0.45*ML_probability + 0.25*reliability + 0.15*cycle + 0.15*proximity
   - LOW:      final_score = 0.40*ML_probability + 0.25*reliability + 0.15*cycle + 0.20*proximity
   Reliability blends donations_till_date, calls-to-donations ratio, donated_earlier, and active status. Cycle blends eligibility_status, next_eligible_date proximity, and donation cycle length. Proximity is inverse-distance from patient coordinates (neutral 0.5 when no location).

2. ML MODEL — a LightGBM gradient-boosting classifier (donor_rf_model.joblib) producing predict_proba for donation likelihood. It is a LightGBM model, NOT a RandomForest. donations_till_date and donated_earlier are deliberately EXCLUDED from features to prevent target leakage. Categorical fields (blood_group, donor_type, eligibility_status, role, status) are one-hot encoded; dates are encoded as days-since-epoch.

3. KùzuDB GRAPH SCHEMA — embedded graph store for conversational memory and relationship mapping. Node tables: DonorNode, PatientNode, ChatSession, ChatMessage. Relationship tables: DONATED_TO, MATCHED_WITH, HAS_MESSAGE. Chat history is retrieved per session_id ordered by message_order for RAG context.

4. PIPELINE & METRICS — triage (Groq llama-3.1-8b-instant classification) → hybrid match (consent-enforced SQLite query) → outreach (top-1 gets a personalized Groq message, ranks 2-10 get templates to conserve the 30 RPM free tier). Consent enforcement STRICTLY excludes consent_given=False donors from every match.

=== BEHAVIOR ===
- Answer the operator's questions directly and technically. Explain weights, schemas, model internals, and metrics openly.
- The Match model is LightGBM. Never call it a RandomForest.
- For donor counts, cite the LIVE DATABASE STATE number ({live_donor_count}) above.
- You MAY still answer blood-donation medical questions too.
- Be concise and precise. Use concrete numbers and field names.

Conversation history from this session:
{chat_history}

Respond helpfully and technically. Length as needed to fully answer the operator."""


# FAQ database for mock mode
_MOCK_FAQ = {
    "eligibility": "Generally, you can donate blood if you're 18-65 years old, weigh at least 50kg, and are in good health. You should wait at least 90 days (3 months) between whole blood donations. Certain medications and recent travel may affect eligibility -- always check with the donation center.",
    "blood group": "There are 8 main blood groups: A+, A-, B+, B-, AB+, AB-, O+, O-. O Negative is the universal donor (can give to anyone), while AB Positive is the universal recipient (can receive from anyone).",
    "donate": "You can schedule a donation through our platform! After registering, check your eligibility status and find nearby donation centers. The actual donation takes about 10-15 minutes, though the entire process including registration and recovery takes about an hour.",
    "when": "After a whole blood donation, you should wait at least 90 days before donating again. For platelet donations, the wait time is typically 7-14 days. Your next eligible date is tracked in your donor profile.",
    "tattoo": "After getting a tattoo, you typically need to wait 6-12 months before you can donate blood, depending on local regulations. This is to ensure there is no risk of infection transmission.",
    "alcohol": "You should avoid alcohol for at least 24 hours before donating blood. If you consumed alcohol heavily, wait 48-72 hours. Alcohol can affect your hydration levels and blood test results.",
    "smoking": "Smokers can donate blood, but you should not smoke for at least 2-3 hours before and after donation. Nicotine constricts blood vessels which can make the process harder.",
    "safe": "Yes, your data is safe. RaktaSetu AI is fully compliant with India's Digital Personal Data Protection (DPDP) Act, 2023. Your personal details are stored encrypted, we only use your data to coordinate blood donation, and your explicit consent (consent_given) is enforced on every match — you can revoke it at any time to be immediately removed from all matching.",
    "privacy": "Your privacy is protected under India's DPDP Act, 2023. We collect only what's needed to match you with patients, store it securely with encryption, never sell or share it for marketing, and honor your consent choices. You control your data and can withdraw consent anytime.",
    "secure": "All donor data is stored securely with encryption and access controls, in line with the DPDP Act, 2023. Sensitive identifiers are encrypted, and matching only runs against donors who have given explicit consent.",
    "data": "We take your data seriously. RaktaSetu AI follows India's DPDP Act, 2023: your information is encrypted at rest, used solely for blood-donation coordination, protected by strict consent enforcement, and never shared without your permission. You may revoke consent at any time.",
    "help": "I can help you with: checking donation eligibility, understanding blood group compatibility, scheduling donations, data privacy and safety, and answering general questions about the RaktaSetu AI platform. What would you like to know?",
    "blood bank": "Sure — I can point you toward nearby blood banks. A few well-known ones include: Red Cross Blood Bank (city centre, open 24x7 for emergencies), Rotary Blood Bank (regional hub, component separation available), and government District Hospital Blood Banks (present in most districts, free/low-cost). Share your city or PIN code and I'll narrow it down. Please call ahead to confirm current stock and hours before travelling.",
    "hospital": "Here are common hospital types with in-house blood banks you can approach: the Government District/General Hospital (24x7 blood bank, free or subsidised), large multi-speciality hospitals like Apollo, Fortis, or Manipal (in-house transfusion services), and Medical College Hospitals (high-volume blood banks). Tell me your city or PIN code and I'll suggest specific centres nearby — and do call ahead to confirm availability.",
    "near me": "To find donation centres near you, just share your city name or 6-digit PIN code. I can then list nearby blood banks, hospitals, and camps. In the meantime, government District Hospitals and Red Cross / Rotary blood banks are reliable starting points in most Indian cities.",
}

# Off-topic guardrail keyword triggers for mock mode
_OFFTOPIC_KEYWORDS = [
    "recipe", "cook", "movie", "cricket", "football", "code", "python",
    "javascript", "weather", "stock", "bitcoin", "crypto", "politics",
    "election", "game", "song", "music", "homework", "math problem",
]

_GUARDRAIL_REFUSAL = (
    "I am specialized to assist only with blood donation eligibility, "
    "health criteria, and emergency coordination. "
    "Please let me know how I can help save a life today."
)


def rag_chat(
    session_id: str,
    user_message: str,
    user_id: str = "anonymous",
    live_donor_count: Optional[int] = None,
) -> str:
    """
    RAG-style chat with KuzuDB conversational memory and medical intent guardrail.

    Args:
        session_id: Unique session identifier for conversation continuity
        user_message: The user's chat message
        user_id: Optional user identifier
        live_donor_count: Real-time count of donor rows in SQLite. Injected into
            the NGO_ADMIN_PROMPT so the Command Center co-pilot always reports the
            exact database size instead of hallucinating a number.

    Returns:
        AI response string (or guardrail refusal for off-topic queries)

    When USE_MOCK_AI=True:
        Returns FAQ-based responses with mock guardrail.
    When USE_MOCK_AI=False:
        # >>> GROQ API INVOCATION <<<
        Calls Groq llama3-8b-8192 with KuzuDB history + intent guardrail.
    """
    # Store the user's message in KuzuDB (works in both mock and live mode)
    from app.database import store_chat_message, get_chat_history

    store_chat_message(session_id, user_id, "user", user_message)

    # --- INTENT FORK (Command Center vs standard donor) ---
    # The authenticated NGO operator gets the permissive admin prompt (no medical
    # guardrail); every standard donor keeps the strict blood-donation-only guardrail.
    is_admin = user_id == NGO_ADMIN_USER_ID

    if USE_MOCK_AI:
        response = _mock_rag_chat(user_message, is_admin=is_admin, live_donor_count=live_donor_count)
    else:
        # Retrieve conversation history from KuzuDB for RAG context
        history = get_chat_history(session_id, limit=10)
        history_text = "\n".join(
            [f"{msg['role'].upper()}: {msg['content']}" for msg in history]
        ) or "No previous messages in this session."

        # Build the system prompt: permissive for the operator, strict for donors.
        # The admin prompt also needs the live donor count injected so the co-pilot
        # never guesses the database size.
        if is_admin:
            count_str = str(live_donor_count) if live_donor_count is not None else "unknown (count unavailable)"
            system = NGO_ADMIN_PROMPT.format(
                chat_history=history_text,
                live_donor_count=count_str,
            )
        else:
            system = RAG_SYSTEM_PROMPT.format(chat_history=history_text)

        # Build multi-turn message array for better context
        messages = [{"role": "system", "content": system}]

        # Add recent history as actual conversation turns
        for msg in history[-6:]:  # Last 6 messages for context window
            messages.append({
                "role": msg["role"],
                "content": msg["content"],
            })

        # Add the current user message
        messages.append({"role": "user", "content": user_message})

        try:
            # >>> GROQ API INVOCATION <<<
            response = _invoke_groq_multi(messages, temperature=0.4)
        except Exception as e:
            print(f"[GROQ API ERROR] rag_chat failed: {e}")
            response = _mock_rag_chat(user_message)

    # Store the AI response in KuzuDB
    store_chat_message(session_id, user_id, "assistant", response)

    return response


def _mock_rag_chat(user_message: str, is_admin: bool = False, live_donor_count: Optional[int] = None) -> str:
    """
    Mock RAG chat: keyword-matched FAQ responses with intent guardrail.
    Off-topic queries trigger the guardrail refusal message.

    When is_admin=True (Command Center operator), the off-topic guardrail is
    lifted and platform-internals questions get technical answers. The live
    donor count (when supplied) is used for count questions so the mock reply
    matches the real database size instead of a hardcoded guess.
    """
    msg_lower = user_message.lower()

    # --- COMMAND CENTER OPERATOR (guardrail lifted) ---
    if is_admin:
        return _mock_admin_chat(msg_lower, live_donor_count=live_donor_count)

    # --- MOCK INTENT GUARDRAIL ---
    # Check if the message is clearly off-topic
    if any(kw in msg_lower for kw in _OFFTOPIC_KEYWORDS):
        return _GUARDRAIL_REFUSAL

    # Check for blood-donation-relevant FAQ matches
    for keyword, answer in _MOCK_FAQ.items():
        if keyword in msg_lower:
            return answer

    # Default response (on-topic but no specific match)
    return (
        "Thanks for your question! I'm RaktaSetu AI, here to help with blood donation queries. "
        "You can ask me about donation eligibility, blood group compatibility, scheduling, "
        "or how our platform works. How can I assist you today?"
    )


# --- Mock Command Center knowledge base (guardrail-free) ---
_MOCK_ADMIN_FAQ = {
    "weight": "The Dynamic Hybrid Ranker uses urgency-dependent weights. CRITICAL: 0.55*ML + 0.25*reliability + 0.15*cycle + 0.05*proximity. MODERATE: 0.45/0.25/0.15/0.15. LOW: 0.40/0.25/0.15/0.20. Donors are sorted by final_score descending.",
    "feature": "The LightGBM model's features exclude donations_till_date and donated_earlier (target leakage). It uses cycle_of_donations, total_calls, frequency_in_days, quantity_required, one-hot categoricals (blood_group, donor_type, eligibility_status, role, status), and dates as days-since-epoch.",
    "kuzu": "KùzuDB is the embedded graph store. Node tables: DonorNode, PatientNode, ChatSession, ChatMessage. Relationship tables: DONATED_TO, MATCHED_WITH, HAS_MESSAGE. Chat history is fetched per session_id ordered by message_order.",
    "schema": "KùzuDB graph schema — Nodes: DonorNode, PatientNode, ChatSession, ChatMessage. Rels: DONATED_TO, MATCHED_WITH, HAS_MESSAGE. SQLite holds donors, triage_requests, match_logs, feedback_logs.",
    "model": "The Match model is a LightGBM gradient-boosting classifier (donor_rf_model.joblib) — a LightGBM model, not a RandomForest. It outputs predict_proba as the ML donation-likelihood score, blended into the hybrid ranker.",
    "match": "Match pipeline: consent-enforced SQLite query (consent_given=True, status=active, blood_group filter) → hybrid scoring → sort desc → top-N. Outreach: rank-1 gets a personalized Groq message, ranks 2-10 get templates.",
    "pipeline": "Pipeline: triage (Groq llama-3.1-8b classification) → hybrid match (consent-enforced) → outreach. Free tier: 30 RPM, so only the top-ranked donor triggers a live Groq outreach call.",
    "metric": "Key metrics: total consented donors, blood-type distribution, and match funnel (total_eligible → top_results). ML scores are precomputed per donor where available, else inferred on demand.",
    "consent": "Consent enforcement is strict: /match filters consent_given=True AND status=active. Setting consent_given=False instantly removes a donor from all match results.",
}


def _mock_admin_chat(msg_lower: str, live_donor_count: Optional[int] = None) -> str:
    """Mock Command Center responses — technical, no medical guardrail."""
    # Donor-count questions get the live database figure, never a hardcoded guess.
    if any(kw in msg_lower for kw in ("how many donor", "donor count", "total donor",
                                      "number of donor", "database size", "how many record")):
        if live_donor_count is not None:
            return (
                f"The SQLite donors table currently holds exactly {live_donor_count} donor "
                f"records (live count queried this request). Matching runs only over the "
                f"consented, active subset of these."
            )
        return (
            "The donor count is queried live from the SQLite donors table per request, "
            "but the real-time figure wasn't supplied to this response."
        )

    for keyword, answer in _MOCK_ADMIN_FAQ.items():
        if keyword in msg_lower:
            return answer
    # Fall back to the standard FAQ so donation questions still resolve
    for keyword, answer in _MOCK_FAQ.items():
        if keyword in msg_lower:
            return answer
    return (
        "Command Center co-pilot here. I can explain feature weights, the LightGBM "
        "Match model, the KùzuDB graph schema, the consent-enforced match pipeline, and "
        "operational metrics. What would you like to inspect?"
    )


# ============================================================
# Module Info
# ============================================================
if USE_MOCK_AI:
    print("[MOCK] AI client running in MOCK mode (USE_MOCK_AI=True)")
    print("   All AI responses are deterministic and require no API key.")
else:
    print(f"[LIVE] Groq AI client configured for LIVE mode (model={GROQ_MODEL})")
    print(f"   API Key: {'configured' if GROQ_API_KEY and GROQ_API_KEY != 'your_free_groq_api_key_here' else 'NOT SET -- set GROQ_API_KEY in .env'}")
    print(f"   Free tier: 30 requests/minute, 14,400 requests/day")
