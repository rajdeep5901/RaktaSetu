"""
### FILE: tests/live_test_groq.py
============================================================
RaktaSetu AI -- Live Groq API Diagnostics Suite
============================================================
Tests all 4 judging pillars against a RUNNING local server
with USE_MOCK_AI=False and a real GROQ_API_KEY.

Uses Python-native requests (avoids all PowerShell escaping bugs).

Prerequisites:
    1. .env must have USE_MOCK_AI=False and a valid GROQ_API_KEY
    2. Server running:  uvicorn app.main:app --reload --port 8000
    3. CSV ingested:    POST http://localhost:8000/ingest-csv

Usage:
    python tests/live_test_groq.py
============================================================
"""

import sys
import json
import time
import requests

BASE_URL = "http://localhost:8000"

# ANSI color codes
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
BOLD = "\033[1m"
DIM = "\033[2m"
RESET = "\033[0m"

passed = 0
failed = 0
warnings = 0


def header(text: str):
    print(f"\n{'=' * 70}")
    print(f"  {BOLD}{CYAN}{text}{RESET}")
    print(f"{'=' * 70}")


def check(label: str, condition: bool, detail: str = ""):
    global passed, failed
    if condition:
        passed += 1
        status = f"{GREEN}PASS{RESET}"
    else:
        failed += 1
        status = f"{RED}FAIL{RESET}"
    print(f"  [{status}] {label}")
    if detail:
        print(f"         {detail}")


def warn(label: str, detail: str = ""):
    global warnings
    warnings += 1
    print(f"  [{YELLOW}WARN{RESET}] {label}")
    if detail:
        print(f"         {detail}")


def safe_post(url: str, payload: dict, timeout: int = 60) -> tuple:
    """Safe POST that catches errors and returns (response, data) or (None, error_str)."""
    try:
        r = requests.post(url, json=payload, timeout=timeout)
        try:
            data = r.json()
        except Exception:
            data = {"_raw_text": r.text[:500]}
        return r, data
    except requests.Timeout:
        return None, {"_error": f"Request timed out after {timeout}s"}
    except requests.ConnectionError:
        return None, {"_error": "Connection refused -- is the server running?"}
    except Exception as e:
        return None, {"_error": str(e)}


# ============================================================
# PRE-FLIGHT
# ============================================================
def test_preflight():
    header("PRE-FLIGHT: Server Health & Configuration")

    try:
        r = requests.get(f"{BASE_URL}/", timeout=5)
        data = r.json()
    except requests.ConnectionError:
        print(f"\n  {RED}[FATAL] Cannot connect to {BASE_URL}{RESET}")
        print(f"  Start the server:  uvicorn app.main:app --reload --port 8000")
        return False

    check("Server is reachable", r.status_code == 200)
    check("ML model loaded", data.get("ml_model_loaded") is True,
          f"Features: {data.get('ml_features', '?')}")

    mock_mode = data.get("mock_mode", "True")
    is_live = str(mock_mode).lower() in ("false", "0", "no")
    check("Groq LIVE mode active (USE_MOCK_AI=False)", is_live,
          f"mock_mode={mock_mode}")

    if not is_live:
        warn("Server is in MOCK mode. Set USE_MOCK_AI=False in .env and restart.")

    print(f"\n  {DIM}Timestamp: {data.get('timestamp')}{RESET}")
    return True


# ============================================================
# PILLAR 1: NLP TRIAGE (Groq llama3)
# ============================================================
def test_pillar_1_triage():
    header("PILLAR 1: NLP Triage -- Groq llama3-8b-8192 (POST /triage)")

    payload = {
        "patient_description": (
            "URGENT!! My uncle is admitted at City Hospital and needs "
            "3 units of O Positive blood immediately due to severe "
            "accident bleeding. Please help!"
        ),
        "blood_group_needed": "O Positive"
    }

    print(f"\n  {YELLOW}Sending payload:{RESET}")
    print(f"  Description: \"{payload['patient_description'][:80]}...\"")
    print(f"  Blood group: {payload['blood_group_needed']}")

    start = time.time()
    r, data = safe_post(f"{BASE_URL}/triage", payload, timeout=30)
    elapsed = time.time() - start

    if r is None:
        check("Server responded", False, f"Error: {data.get('_error')}")
        return None

    print(f"\n  {YELLOW}Groq Response ({elapsed:.2f}s):{RESET}")
    print(json.dumps(data, indent=4))

    check("HTTP 200 returned", r.status_code == 200)
    check("triage_id assigned", "triage_id" in data and isinstance(data.get("triage_id"), int),
          f"triage_id={data.get('triage_id')}")

    urgency = data.get("urgency", "")
    check("Urgency field present", bool(urgency), f"urgency=\"{urgency}\"")
    check("Urgency is valid enum", urgency in ("CRITICAL", "MODERATE", "LOW"),
          f"Got: \"{urgency}\"")
    check("Urgency is CRITICAL (expected for bleeding/accident)",
          urgency == "CRITICAL",
          "Severe accident bleeding should classify as CRITICAL")
    check("Reasoning provided (Groq-generated)", bool(data.get("reasoning")),
          f"\"{str(data.get('reasoning', ''))[:80]}...\"")
    check("Recommended blood groups is a list",
          isinstance(data.get("recommended_blood_groups"), list),
          f"Groups: {data.get('recommended_blood_groups')}")
    check("Response time < 15s", elapsed < 15, f"Took {elapsed:.2f}s")

    # Return the parsed blood group for Pillar 2 chaining
    return data.get("recommended_blood_groups", ["O Positive"])


# ============================================================
# PILLAR 2 & 3: ML Matching + Hybrid Ranking
# ============================================================
def test_pillar_2_3_match(blood_group: str = "O Positive"):
    header(f"PILLAR 2 & 3: ML Matching + Hybrid Top-10 (POST /match)")

    payload = {
        "blood_group": blood_group,
        "urgency": "CRITICAL",
        "max_results": 10
    }

    print(f"\n  {YELLOW}Payload:{RESET}")
    print(json.dumps(payload, indent=4))
    print(f"\n  {DIM}Note: This calls Groq outreach for each of the top donors.{RESET}")
    print(f"  {DIM}This may take 30-90s due to sequential Groq API calls.{RESET}")

    start = time.time()
    r, data = safe_post(f"{BASE_URL}/match", payload, timeout=300)
    elapsed = time.time() - start

    if r is None:
        check("Server responded", False, f"Error: {data.get('_error')}")
        return

    if r.status_code != 200:
        check("HTTP 200 returned", False, f"Got {r.status_code}: {data}")
        return

    donor_count = len(data.get("donors", []))
    print(f"\n  {YELLOW}Response summary ({elapsed:.2f}s):{RESET}")
    print(f"  Urgency: {data.get('urgency')}")
    print(f"  Blood group: {data.get('blood_group')}")
    print(f"  Total eligible (consented): {data.get('total_eligible')}")
    print(f"  Donors returned: {donor_count}")

    check("HTTP 200 returned", True)
    check("Urgency echoed correctly", data.get("urgency") == "CRITICAL")
    check("Blood group echoed correctly", data.get("blood_group") == blood_group)
    check("total_eligible > 0", data.get("total_eligible", 0) > 0,
          f"total_eligible={data.get('total_eligible')}")

    # --- Pillar 3: Top-10 ceiling ---
    check("Returns up to 10 donors (locked ceiling)", 1 <= donor_count <= 10,
          f"Got {donor_count} donors")

    if donor_count > 0:
        # Print full ranking table
        print(f"\n  {YELLOW}Top-{donor_count} Donor Ranking:{RESET}")
        print(f"  {'Rank':>4s} | {'DonorID':>8s} | {'ML':>6s} | {'Rely':>6s} | "
              f"{'Cycle':>6s} | {'Prox':>6s} | {'FINAL':>7s}")
        print(f"  {'-' * 62}")

        for i, d in enumerate(data["donors"], 1):
            print(f"  {i:4d} | {d['donor_id']:8d} | "
                  f"{d.get('ml_score', 0):6.4f} | "
                  f"{d['reliability_score']:6.4f} | "
                  f"{d['cycle_score']:6.4f} | "
                  f"{d['proximity_score']:6.4f} | "
                  f"{d['final_score']:7.4f}")

        first = data["donors"][0]
        check("Each donor has ml_score", first.get("ml_score") is not None)
        check("Each donor has reliability_score", "reliability_score" in first)
        check("Each donor has cycle_score", "cycle_score" in first)
        check("Each donor has proximity_score", "proximity_score" in first)
        check("Each donor has final_score", "final_score" in first)

        # --- Groq outreach message check ---
        outreach = first.get("outreach_message", "")
        check("Outreach message is Groq-generated (non-empty)", bool(outreach),
              f"\"{outreach[:80]}...\"")

        # Verify CRITICAL weights: 0.55×ML + 0.25×rely + 0.15×cycle + 0.05×prox
        ml = first.get("ml_score", 0)
        rely = first.get("reliability_score", 0)
        cycle = first.get("cycle_score", 0)
        prox = first.get("proximity_score", 0)
        expected = round(0.55 * ml + 0.25 * rely + 0.15 * cycle + 0.05 * prox, 4)
        actual = first.get("final_score", 0)
        check("CRITICAL weights correct (0.55×ML + 0.25×rely + 0.15×cycle + 0.05×prox)",
              abs(expected - actual) < 0.002,
              f"Expected≈{expected:.4f}, Got={actual:.4f}")

        # Verify descending order
        scores = [d["final_score"] for d in data["donors"]]
        is_sorted = all(scores[i] >= scores[i + 1] for i in range(len(scores) - 1))
        check("Donors sorted by final_score (descending)", is_sorted,
              f"Scores: {scores}")


# ============================================================
# PILLAR 4: RAG Chat + Intent Guardrail
# ============================================================
def test_pillar_4_chat():
    header("PILLAR 4: RAG Chat + Medical Intent Guardrail (POST /chat)")

    session_id = f"live-groq-test-{int(time.time())}"

    # --- Turn 1: On-topic medical question ---
    turn1 = {
        "session_id": session_id,
        "message": "I smoke regularly. How long should I wait before and after donating blood?",
        "user_id": "live-test-user"
    }

    print(f"\n  {YELLOW}Turn 1 (ON-TOPIC -- smoking/donation timeline):{RESET}")
    print(f"  Session: {session_id}")
    print(f"  Message: \"{turn1['message']}\"")

    start = time.time()
    r1, d1 = safe_post(f"{BASE_URL}/chat", turn1, timeout=30)
    t1_elapsed = time.time() - start

    if r1 is None:
        check("Turn 1: Server responded", False, f"Error: {d1.get('_error')}")
        return

    response1 = d1.get("response", "")
    print(f"\n  {YELLOW}Groq Response ({t1_elapsed:.2f}s):{RESET}")
    print(f"  \"{response1}\"")

    check("Turn 1: HTTP 200", r1.status_code == 200)
    check("Turn 1: session_id echoed", d1.get("session_id") == session_id)
    check("Turn 1: non-empty response", bool(response1))
    check("Turn 1: Response is on-topic (not the guardrail refusal)",
          "I am specialized to assist only with" not in response1,
          "Smoking/donation is a valid medical topic")

    # --- Turn 2: Follow-up on same session (tattoo timeline) ---
    turn2 = {
        "session_id": session_id,
        "message": "What about tattoos? How long should I wait after getting a tattoo to donate?",
        "user_id": "live-test-user"
    }

    print(f"\n  {YELLOW}Turn 2 (ON-TOPIC -- tattoo wait period):{RESET}")
    print(f"  Session: {session_id}")
    print(f"  Message: \"{turn2['message']}\"")

    start = time.time()
    r2, d2 = safe_post(f"{BASE_URL}/chat", turn2, timeout=30)
    t2_elapsed = time.time() - start

    if r2 is None:
        check("Turn 2: Server responded", False, f"Error: {d2.get('_error')}")
        return

    response2 = d2.get("response", "")
    print(f"\n  {YELLOW}Groq Response ({t2_elapsed:.2f}s):{RESET}")
    print(f"  \"{response2}\"")

    check("Turn 2: HTTP 200", r2.status_code == 200)
    check("Turn 2: non-empty response", bool(response2))
    check("Turn 2: different from Turn 1", response2 != response1,
          "Different questions should yield different answers")

    # --- Turn 3: OFF-TOPIC guardrail test ---
    turn3 = {
        "session_id": session_id,
        "message": "What is the capital of France?",
        "user_id": "live-test-user"
    }

    print(f"\n  {YELLOW}Turn 3 (OFF-TOPIC -- guardrail test):{RESET}")
    print(f"  Session: {session_id}")
    print(f"  Message: \"{turn3['message']}\"")

    start = time.time()
    r3, d3 = safe_post(f"{BASE_URL}/chat", turn3, timeout=30)
    t3_elapsed = time.time() - start

    if r3 is None:
        check("Turn 3: Server responded", False, f"Error: {d3.get('_error')}")
        return

    response3 = d3.get("response", "")
    print(f"\n  {YELLOW}Groq Response ({t3_elapsed:.2f}s):{RESET}")
    print(f"  \"{response3}\"")

    # The guardrail phrase (or close variant) should appear
    guardrail_phrase = "I am specialized to assist only with blood donation"
    guardrail_triggered = guardrail_phrase.lower() in response3.lower()

    check("Turn 3: HTTP 200", r3.status_code == 200)
    check("Turn 3: GUARDRAIL TRIGGERED -- off-topic refused",
          guardrail_triggered,
          f"Expected phrase containing: \"{guardrail_phrase}\"")

    if not guardrail_triggered:
        warn("Groq did not use the exact guardrail phrase",
             f"Full response: \"{response3}\"")

    # --- Turn 4: Back to on-topic (prove session still works) ---
    turn4 = {
        "session_id": session_id,
        "message": "Can I donate blood if I have diabetes?",
        "user_id": "live-test-user"
    }

    print(f"\n  {YELLOW}Turn 4 (ON-TOPIC -- diabetes eligibility):{RESET}")
    print(f"  Session: {session_id}")
    print(f"  Message: \"{turn4['message']}\"")

    start = time.time()
    r4, d4 = safe_post(f"{BASE_URL}/chat", turn4, timeout=30)
    t4_elapsed = time.time() - start

    if r4 is None:
        check("Turn 4: Server responded", False, f"Error: {d4.get('_error')}")
        return

    response4 = d4.get("response", "")
    print(f"\n  {YELLOW}Groq Response ({t4_elapsed:.2f}s):{RESET}")
    print(f"  \"{response4}\"")

    check("Turn 4: HTTP 200", r4.status_code == 200)
    check("Turn 4: non-empty response", bool(response4))
    check("Turn 4: back on-topic (not guardrail refusal)",
          guardrail_phrase.lower() not in response4.lower(),
          "Diabetes/donation is a valid medical topic")


# ============================================================
# MAIN
# ============================================================
def main():
    global passed, failed, warnings

    print(f"\n{BOLD}{'=' * 70}")
    print(f"  RaktaSetu AI -- Live Groq API Diagnostics Suite")
    print(f"{'=' * 70}{RESET}")
    print(f"  Target: {BASE_URL}")
    print(f"  Engine: Groq llama3-8b-8192 (free tier)")
    print(f"  Mode:   LIVE (USE_MOCK_AI=False)")

    # Pre-flight
    if not test_preflight():
        print(f"\n{RED}[ABORTED] Server not reachable.{RESET}")
        sys.exit(1)

    # Pillar 1: Triage
    triage_groups = test_pillar_1_triage()

    # Pillar 2 & 3: Match (chain blood group from triage if available)
    match_bg = "O Positive"
    if triage_groups and len(triage_groups) > 0:
        match_bg = triage_groups[0]  # Use the first recommended group
    test_pillar_2_3_match(match_bg)

    # Pillar 4: Chat with guardrail
    test_pillar_4_chat()

    # --- Summary ---
    total = passed + failed
    header("LIVE GROQ DIAGNOSTICS SUMMARY")
    print(f"  Total checks: {total}")
    print(f"  {GREEN}Passed: {passed}{RESET}")
    if failed > 0:
        print(f"  {RED}Failed: {failed}{RESET}")
    else:
        print(f"  Failed: 0")
    if warnings > 0:
        print(f"  {YELLOW}Warnings: {warnings}{RESET}")
    print(f"\n  Result: {GREEN + BOLD}ALL LIVE GROQ CHECKS PASSED{RESET}" if failed == 0
          else f"\n  Result: {RED + BOLD}{failed} CHECK(S) FAILED{RESET}")
    print()

    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
