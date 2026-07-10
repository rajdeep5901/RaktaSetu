"""
### FILE: tests/verify_pillars.py
============================================================
RaktaSetu AI -- Automated Verification Suite
============================================================
Tests all four judging pillars against a RUNNING local server.

Prerequisites:
    1. Server must be running:  uvicorn app.main:app --host 0.0.0.0 --port 8000
    2. CSV data must be ingested: POST http://localhost:8000/ingest-csv

Usage:
    python tests/verify_pillars.py

Pillars Tested:
    Pillar 1: AI Triage parsing (POST /triage)
    Pillar 2: Predictive ML matching (POST /match)
    Pillar 3: Hybrid ranking with top-10 ceiling (POST /match)
    Pillar 4: Session-tracked RAG chat (POST /chat, 2 turns)
============================================================
"""

import sys
import json
import requests

BASE_URL = "http://localhost:8000"

# ANSI color codes for terminal output
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"

passed = 0
failed = 0


def header(text: str):
    print(f"\n{'=' * 64}")
    print(f"  {BOLD}{CYAN}{text}{RESET}")
    print(f"{'=' * 64}")


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


def test_health():
    """Quick pre-flight check that the server is alive."""
    header("PRE-FLIGHT: Health Check")
    try:
        r = requests.get(f"{BASE_URL}/", timeout=5)
        data = r.json()
        check("Server is reachable", r.status_code == 200)
        check("ML model is loaded", data.get("ml_model_loaded") is True,
              f"Features: {data.get('ml_features', '?')}")
        check("Mock mode status reported", "mock_mode" in data,
              f"USE_MOCK_BEDROCK={data.get('mock_mode')}")
        return True
    except requests.ConnectionError:
        print(f"\n  {RED}[FATAL] Cannot connect to {BASE_URL}{RESET}")
        print(f"  Start the server first:  uvicorn app.main:app --host 0.0.0.0 --port 8000")
        return False


def test_pillar_1_triage():
    """
    Pillar 1: AI Triage Parsing
    Send a chaotic mock emergency string and verify the AI parses
    it into a structured urgency classification.
    """
    header("PILLAR 1: AI Triage Parsing (POST /triage)")

    chaotic_payload = {
        "patient_description": (
            "URGENT!!! 8yr old child -- massive hemorrhage post MVA (motor vehicle accident) "
            "on NH-48 near Pune. BP dropping 70/40, Hb came back at 4.2 g/dL, "
            "multiple fractures, internal bleeding suspected, NEEDS O-NEG STAT!! "
            "family is frantic, hospital blood bank completely dry, "
            "transferring to Ruby Hall ICU NOW. Please help ASAP!!!!"
        ),
        "blood_group_needed": "O Negative"
    }

    print(f"\n  {YELLOW}Payload:{RESET}")
    print(f"  Description: \"{chaotic_payload['patient_description'][:80]}...\"")
    print(f"  Blood group: {chaotic_payload['blood_group_needed']}")

    r = requests.post(f"{BASE_URL}/triage", json=chaotic_payload, timeout=15)
    data = r.json()

    print(f"\n  {YELLOW}Response:{RESET}")
    print(json.dumps(data, indent=4))

    check("HTTP 200 returned", r.status_code == 200)
    check("triage_id assigned", "triage_id" in data and isinstance(data["triage_id"], int),
          f"triage_id={data.get('triage_id')}")
    check("Urgency field present", "urgency" in data,
          f"urgency=\"{data.get('urgency')}\"")
    check("Urgency is valid enum", data.get("urgency") in ("CRITICAL", "MODERATE", "LOW"),
          f"Got: \"{data.get('urgency')}\"")
    check("Reasoning provided", bool(data.get("reasoning")),
          f"\"{str(data.get('reasoning', ''))[:60]}...\"")
    check("Recommended blood groups is a list",
          isinstance(data.get("recommended_blood_groups"), list),
          f"Groups: {data.get('recommended_blood_groups')}")


def test_pillar_2_3_match():
    """
    Pillar 2 & 3: Predictive Matching + Hybrid Ranking
    Verify the /match endpoint returns up to 10 ranked donors
    with ML scores, reliability, cycle, proximity, and final scores.
    """
    header("PILLAR 2 & 3: Predictive Matching + Top-10 Ranking (POST /match)")

    payload = {
        "blood_group": "O Positive",
        "urgency": "CRITICAL",
        "max_results": 10
    }

    print(f"\n  {YELLOW}Payload:{RESET}")
    print(json.dumps(payload, indent=4))

    r = requests.post(f"{BASE_URL}/match", json=payload, timeout=120)
    data = r.json()

    donor_count = len(data.get("donors", []))
    print(f"\n  {YELLOW}Response summary:{RESET}")
    print(f"  Urgency: {data.get('urgency')}")
    print(f"  Blood group: {data.get('blood_group')}")
    print(f"  Total eligible (consented): {data.get('total_eligible')}")
    print(f"  Donors returned: {donor_count}")

    check("HTTP 200 returned", r.status_code == 200)
    check("Urgency echoed correctly", data.get("urgency") == "CRITICAL")
    check("Blood group echoed correctly", data.get("blood_group") == "O Positive")
    check("total_eligible > 0", data.get("total_eligible", 0) > 0,
          f"total_eligible={data.get('total_eligible')}")

    # --- Pillar 3: Top-10 ceiling ---
    check("Returns up to 10 donors", 1 <= donor_count <= 10,
          f"Got {donor_count} donors")

    if donor_count > 0:
        print(f"\n  {YELLOW}Top-10 Donor Ranking:{RESET}")
        print(f"  {'Rank':>4s} | {'DonorID':>8s} | {'ML':>6s} | {'Rely':>6s} | {'Cycle':>6s} | {'Prox':>6s} | {'FINAL':>7s}")
        print(f"  {'-' * 60}")

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
        check("Each donor has outreach_message", bool(first.get("outreach_message")),
              f"\"{str(first.get('outreach_message', ''))[:50]}...\"")

        # Verify descending order
        scores = [d["final_score"] for d in data["donors"]]
        is_sorted = all(scores[i] >= scores[i + 1] for i in range(len(scores) - 1))
        check("Donors sorted by final_score (descending)", is_sorted,
              f"Scores: {scores}")


def test_pillar_4_chat():
    """
    Pillar 4: Session-Tracked RAG Chat
    Send two turns on the same session_id to verify KuzuDB
    conversational memory binding.
    """
    header("PILLAR 4: Session-Tracked RAG Chat (POST /chat, 2 turns)")

    session_id = "verify-pillars-session-001"

    # --- Turn 1 ---
    turn1_payload = {
        "session_id": session_id,
        "message": "What are the eligibility criteria for blood donation?",
        "user_id": "test-donor-verify"
    }

    print(f"\n  {YELLOW}Turn 1:{RESET}")
    print(f"  Session: {session_id}")
    print(f"  Message: \"{turn1_payload['message']}\"")

    r1 = requests.post(f"{BASE_URL}/chat", json=turn1_payload, timeout=15)
    d1 = r1.json()

    print(f"  Response: \"{d1.get('response', '')[:100]}...\"")

    check("Turn 1: HTTP 200", r1.status_code == 200)
    check("Turn 1: session_id echoed", d1.get("session_id") == session_id)
    check("Turn 1: non-empty response", bool(d1.get("response")))

    # --- Turn 2 (same session — should carry context) ---
    turn2_payload = {
        "session_id": session_id,
        "message": "And what about the minimum age requirement?",
        "user_id": "test-donor-verify"
    }

    print(f"\n  {YELLOW}Turn 2 (same session):{RESET}")
    print(f"  Session: {session_id}")
    print(f"  Message: \"{turn2_payload['message']}\"")

    r2 = requests.post(f"{BASE_URL}/chat", json=turn2_payload, timeout=15)
    d2 = r2.json()

    print(f"  Response: \"{d2.get('response', '')[:100]}...\"")

    check("Turn 2: HTTP 200", r2.status_code == 200)
    check("Turn 2: session_id echoed", d2.get("session_id") == session_id)
    check("Turn 2: non-empty response", bool(d2.get("response")))
    check("Turn 2: different from Turn 1",
          d2.get("response") != d1.get("response"),
          "Responses should differ for different questions")


def main():
    global passed, failed

    print(f"\n{BOLD}{'=' * 64}")
    print(f"  RaktaSetu AI -- Automated Pillar Verification Suite")
    print(f"{'=' * 64}{RESET}")
    print(f"  Target: {BASE_URL}")

    # Pre-flight
    if not test_health():
        print(f"\n{RED}[ABORTED] Server not reachable. Start it first.{RESET}")
        sys.exit(1)

    # Run all pillar tests
    test_pillar_1_triage()
    test_pillar_2_3_match()
    test_pillar_4_chat()

    # --- Summary ---
    total = passed + failed
    header("VERIFICATION SUMMARY")
    print(f"  Total checks: {total}")
    print(f"  {GREEN}Passed: {passed}{RESET}")
    if failed > 0:
        print(f"  {RED}Failed: {failed}{RESET}")
    else:
        print(f"  Failed: 0")
    print(f"\n  Result: {GREEN + BOLD}ALL PILLARS VERIFIED{RESET}" if failed == 0
          else f"\n  Result: {RED + BOLD}{failed} CHECK(S) FAILED{RESET}")
    print()

    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
