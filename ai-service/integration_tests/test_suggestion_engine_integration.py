from model import get_suggestion


def test_unfair_clause_gets_targeted_suggestion():
    clause = "Client may terminate this Agreement immediately without notice."
    suggestion = get_suggestion(clause, "unfair", 0.86)
    assert "notice" in suggestion.lower()
    assert "termination" in suggestion.lower()


def test_low_confidence_unfair_mentions_manual_review():
    clause = "Freelancer shall indemnify and hold harmless Client for all claims."
    suggestion = get_suggestion(clause, "unfair", 0.54)
    assert "confidence is low" in suggestion.lower()
    assert "indemnity" in suggestion.lower() or "claims" in suggestion.lower()


def test_low_confidence_fair_requests_review():
    clause = "Payment shall be made according to agreed milestones."
    suggestion = get_suggestion(clause, "fair", 0.55)
    assert "borderline" in suggestion.lower()
    assert "human reviewer" in suggestion.lower()


def test_moderate_confidence_fair_with_risk_words_gets_caution():
    clause = "Client has sole discretion over acceptance criteria."
    suggestion = get_suggestion(clause, "fair", 0.67)
    assert "mostly balanced" in suggestion.lower()
    assert "objective criteria" in suggestion.lower()
