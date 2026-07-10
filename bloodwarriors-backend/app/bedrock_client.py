"""
### FILE: app/bedrock_client.py
============================================================
RaktaSetu AI — Amazon Bedrock AI Client
============================================================
Three core AI functions powered by Amazon Bedrock (Claude):

1. triage_request()     — Classify urgency from patient description
2. generate_outreach()  — Personalized donor outreach messages
3. rag_chat()           — RAG-style chat with KùzuDB memory

CRITICAL: USE_MOCK_BEDROCK toggle
    - True  → Fully offline, deterministic responses (for local testing)
    - False → Real boto3 calls to Amazon Bedrock (us-east-1)

Every real Bedrock invocation is marked with:
    # >>> AWS BEDROCK INVOCATION <<<
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
USE_MOCK_BEDROCK = os.getenv("USE_MOCK_BEDROCK", "True").lower() in ("true", "1", "yes")
BEDROCK_MODEL_ID = os.getenv("BEDROCK_MODEL_ID", "anthropic.claude-3-haiku-20240307-v1:0")
BEDROCK_MAX_TOKENS = int(os.getenv("BEDROCK_MAX_TOKENS", "1024"))
AWS_REGION = os.getenv("AWS_DEFAULT_REGION", "us-east-1")

# Lazy-initialized boto3 client (only created when USE_MOCK_BEDROCK=False)
_bedrock_client = None


def _get_bedrock_client():
    """
    Returns a boto3 Bedrock Runtime client for us-east-1.

    AWS Credentials are resolved in this order:
    1. AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY in .env
    2. ~/.aws/credentials profile
    3. IAM Instance Role (on EC2) — recommended for production

    # >>> AWS CREDENTIALS LAYER <<<
    """
    global _bedrock_client
    if _bedrock_client is None:
        import boto3

        _bedrock_client = boto3.client(
            service_name="bedrock-runtime",
            region_name=AWS_REGION,
            # boto3 auto-discovers credentials from env vars,
            # AWS config files, or IAM instance role.
        )
        print(f"[AI] Bedrock client initialized (region={AWS_REGION}, model={BEDROCK_MODEL_ID})")
    return _bedrock_client


def _invoke_bedrock(system_prompt: str, user_message: str) -> str:
    """
    Low-level wrapper: sends a prompt to Amazon Bedrock Claude and
    returns the text response.

    # >>> AWS BEDROCK INVOCATION <<<
    This function makes a REAL API call to Amazon Bedrock when
    USE_MOCK_BEDROCK=False. It will incur charges against your
    AWS account based on input/output token counts.

    Model ID used: {BEDROCK_MODEL_ID}
    Endpoint: bedrock-runtime.{AWS_REGION}.amazonaws.com
    API: InvokeModel (Messages API format)
    """
    client = _get_bedrock_client()

    # Claude Messages API payload
    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": BEDROCK_MAX_TOKENS,
        "system": system_prompt,
        "messages": [
            {"role": "user", "content": user_message}
        ],
        "temperature": 0.3,  # Lower temperature for more consistent triage
    })

    # >>> AWS BEDROCK INVOCATION <<<
    response = client.invoke_model(
        modelId=BEDROCK_MODEL_ID,
        contentType="application/json",
        accept="application/json",
        body=body,
    )

    response_body = json.loads(response["body"].read())
    return response_body["content"][0]["text"]


# ============================================================
# 1. TRIAGE — Classify urgency from patient description
# ============================================================

TRIAGE_SYSTEM_PROMPT = """You are a medical triage AI assistant for a blood donation platform called RaktaSetu AI.
Your job is to classify the urgency of a blood request based on the patient's description.

You MUST respond with EXACTLY this JSON format (no extra text):
{
    "urgency": "CRITICAL" or "MODERATE" or "LOW",
    "reasoning": "Brief explanation of why this urgency level was assigned",
    "recommended_blood_groups": ["list", "of", "compatible", "groups"]
}

Urgency guidelines:
- CRITICAL: Active bleeding, surgery in <24hrs, trauma, hemoglobin <7g/dL, platelet count <20k
- MODERATE: Scheduled surgery in 1-7 days, chronic transfusion-dependent patient, Hb 7-9g/dL
- LOW: Elective surgery >7 days away, routine transfusion, blood bank restocking

Always consider blood group compatibility when recommending groups."""


def triage_request(patient_description: str, blood_group_needed: Optional[str] = None) -> dict:
    """
    Classify the urgency of a blood request.

    Args:
        patient_description: Free-text description of the patient's condition
        blood_group_needed: Optional specific blood group requested

    Returns:
        dict with keys: urgency, reasoning, recommended_blood_groups

    When USE_MOCK_BEDROCK=True:
        Returns deterministic urgency based on keyword matching.
    When USE_MOCK_BEDROCK=False:
        # >>> AWS BEDROCK INVOCATION <<<
        Calls Amazon Bedrock Claude to classify urgency.
    """
    if USE_MOCK_BEDROCK:
        return _mock_triage(patient_description, blood_group_needed)

    # --- REAL BEDROCK CALL ---
    user_msg = f"Patient description: {patient_description}"
    if blood_group_needed:
        user_msg += f"\nBlood group needed: {blood_group_needed}"

    # >>> AWS BEDROCK INVOCATION <<<
    raw_response = _invoke_bedrock(TRIAGE_SYSTEM_PROMPT, user_msg)

    try:
        # Try to extract JSON from the response
        json_match = re.search(r'\{.*\}', raw_response, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group())
        else:
            result = json.loads(raw_response)
    except json.JSONDecodeError:
        # Fallback if Claude doesn't return valid JSON
        result = {
            "urgency": "MODERATE",
            "reasoning": raw_response,
            "recommended_blood_groups": [blood_group_needed] if blood_group_needed else [],
        }

    # Normalize urgency to uppercase
    result["urgency"] = result.get("urgency", "MODERATE").upper()
    if result["urgency"] not in ("CRITICAL", "MODERATE", "LOW"):
        result["urgency"] = "MODERATE"

    return result


def _mock_triage(description: str, blood_group: Optional[str]) -> dict:
    """
    Mock triage: keyword-based urgency classification for offline testing.
    Deterministic and requires no API calls.
    """
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

    # Simple blood group compatibility
    compatible = _get_compatible_groups(blood_group) if blood_group else ["O Negative"]

    return {
        "urgency": urgency,
        "reasoning": reasoning,
        "recommended_blood_groups": compatible,
    }


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
        "AB Positive": ["O Negative", "O Positive", "A Negative", "A Positive", "B Negative", "B Positive", "AB Negative", "AB Positive"],
    }
    return compatibility.get(blood_group, [blood_group])


# ============================================================
# 2. OUTREACH — Generate personalized donor messages
# ============================================================

OUTREACH_SYSTEM_PROMPT = """You are a compassionate outreach coordinator for RaktaSetu AI, a blood donation platform.
Generate a short, personalized message (2-3 sentences) to encourage a donor to donate blood.

Consider:
- The donor's past donation history
- The urgency of the current need
- The patient's situation
- Be warm, respectful, and never guilt-trip

Respond with ONLY the message text, no JSON or formatting."""


def generate_outreach(
    donor_name: str,
    donor_blood_group: str,
    donations_count: int,
    urgency: str,
    patient_context: str,
) -> str:
    """
    Generate a personalized outreach message for a donor.

    When USE_MOCK_BEDROCK=True:
        Returns a template-based message.
    When USE_MOCK_BEDROCK=False:
        # >>> AWS BEDROCK INVOCATION <<<
        Calls Amazon Bedrock Claude to generate personalized text.
    """
    if USE_MOCK_BEDROCK:
        return _mock_outreach(donor_name, donor_blood_group, donations_count, urgency)

    # --- REAL BEDROCK CALL ---
    user_msg = (
        f"Donor profile:\n"
        f"- Name: {donor_name}\n"
        f"- Blood Group: {donor_blood_group}\n"
        f"- Past Donations: {donations_count}\n"
        f"- Current Urgency: {urgency}\n"
        f"- Patient Context: {patient_context}\n\n"
        f"Generate a personalized outreach message for this donor."
    )

    # >>> AWS BEDROCK INVOCATION <<<
    return _invoke_bedrock(OUTREACH_SYSTEM_PROMPT, user_msg)


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
# 3. RAG CHAT — Conversational AI with KùzuDB context
# ============================================================

RAG_SYSTEM_PROMPT = """You are RaktaSetu AI, a helpful assistant for a blood donation platform.
You help donors and patients with questions about blood donation, eligibility, scheduling, and the platform.

Context from previous messages in this session:
{chat_history}

Guidelines:
- Be helpful, accurate, and compassionate
- For medical questions, always recommend consulting a doctor
- You can help with: donation eligibility, blood group compatibility, scheduling, platform features
- You cannot: diagnose conditions, replace medical advice, access personal medical records

Respond conversationally in 2-4 sentences."""


# FAQ database for mock mode
_MOCK_FAQ = {
    "eligibility": "Generally, you can donate blood if you're 18-65 years old, weigh at least 50kg, and are in good health. You should wait at least 90 days (3 months) between whole blood donations. Certain medications and recent travel may affect eligibility — always check with the donation center.",
    "blood group": "There are 8 main blood groups: A+, A-, B+, B-, AB+, AB-, O+, O-. O Negative is the universal donor (can give to anyone), while AB Positive is the universal recipient (can receive from anyone).",
    "donate": "You can schedule a donation through our platform! After registering, check your eligibility status and find nearby donation centers. The actual donation takes about 10-15 minutes, though the entire process including registration and recovery takes about an hour.",
    "when": "After a whole blood donation, you should wait at least 90 days before donating again. For platelet donations, the wait time is typically 7-14 days. Your next eligible date is tracked in your donor profile.",
    "help": "I can help you with: checking donation eligibility, understanding blood group compatibility, scheduling donations, and answering general questions about the RaktaSetu AI platform. What would you like to know?",
}


def rag_chat(session_id: str, user_message: str, user_id: str = "anonymous") -> str:
    """
    RAG-style chat with KùzuDB conversational memory.

    Args:
        session_id: Unique session identifier for conversation continuity
        user_message: The user's chat message
        user_id: Optional user identifier

    Returns:
        AI response string

    When USE_MOCK_BEDROCK=True:
        Returns FAQ-based responses matched by keywords.
    When USE_MOCK_BEDROCK=False:
        # >>> AWS BEDROCK INVOCATION <<<
        Calls Amazon Bedrock Claude with KùzuDB chat history as context.
    """
    # Store the user's message in KùzuDB (works in both mock and real mode)
    from app.database import store_chat_message, get_chat_history

    store_chat_message(session_id, user_id, "user", user_message)

    if USE_MOCK_BEDROCK:
        response = _mock_rag_chat(user_message)
    else:
        # Retrieve conversation history from KùzuDB for RAG context
        history = get_chat_history(session_id, limit=10)
        history_text = "\n".join(
            [f"{msg['role'].upper()}: {msg['content']}" for msg in history]
        ) or "No previous messages in this session."

        # Build the system prompt with RAG context
        system = RAG_SYSTEM_PROMPT.format(chat_history=history_text)

        # >>> AWS BEDROCK INVOCATION <<<
        response = _invoke_bedrock(system, user_message)

    # Store the AI response in KùzuDB
    store_chat_message(session_id, user_id, "assistant", response)

    return response


def _mock_rag_chat(user_message: str) -> str:
    """Mock RAG chat: keyword-matched FAQ responses."""
    msg_lower = user_message.lower()

    for keyword, answer in _MOCK_FAQ.items():
        if keyword in msg_lower:
            return answer

    # Default response
    return (
        "Thanks for your question! I'm RaktaSetu AI, here to help with blood donation queries. "
        "You can ask me about donation eligibility, blood group compatibility, scheduling, "
        "or how our platform works. How can I assist you today?"
    )


# ============================================================
# Module Info
# ============================================================
if USE_MOCK_BEDROCK:
    print("[MOCK] Bedrock client running in MOCK mode (USE_MOCK_BEDROCK=True)")
    print("   All AI responses are deterministic and require no AWS credentials.")
else:
    print(f"[LIVE] Bedrock client configured for LIVE mode (model={BEDROCK_MODEL_ID})")
    print(f"   Region: {AWS_REGION}")
    print(f"   Ensure AWS credentials are configured (env vars, ~/.aws/credentials, or IAM role).")
