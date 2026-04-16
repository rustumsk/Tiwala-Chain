import re
import os
import math
from typing import Any

from transformers import pipeline
try:
    from llm_suggestions import (
        generate_llm_clause_reviews_batch,
        generate_llm_suggestions_batch,
        is_llm_suggestions_enabled,
    )
except Exception:  # pragma: no cover - optional module fallback
    generate_llm_clause_reviews_batch = None
    generate_llm_suggestions_batch = None
    is_llm_suggestions_enabled = lambda: False

MODEL_PATH = "./fine_tuned_model"

LABELS = {
    "LABEL_0": "fair",
    "LABEL_1": "unfair",
}

LOW_CONFIDENCE_THRESHOLD = 0.60
MODERATE_CONFIDENCE_THRESHOLD = 0.75
SUSPICIOUS_FAIR_LLM_THRESHOLD = 0.9

# ---------------------------------------------------------------------------
# Risk patterns — (regex, one-sentence reason, fix suggestion)
# ---------------------------------------------------------------------------
# The `reason` is a short plain-English sentence explaining *why* the clause
# is flagged. The `suggestion` tells the party what to do about it.

RISK_PATTERNS: list[tuple[re.Pattern, str, str]] = [
    (
        re.compile(
            r"\b(without notice|immediate(?:ly)?(?:\s+for convenience)?|terminate(?:d|s)?\s+at\s+any\s+time)\b",
            re.IGNORECASE,
        ),
        "Allows unilateral termination without advance notice or a cure period.",
        "Consider requiring advance written notice and a cure period before termination.",
    ),
    (
        re.compile(r"\b(sole discretion|at its discretion|unilateral(?:ly)?)\b", re.IGNORECASE),
        "Grants one-sided discretion to one party without objective criteria.",
        "Consider replacing unilateral discretion with objective criteria and mutual agreement mechanisms.",
    ),
    (
        re.compile(r"\b(waive|waiver|irrevocably waives)\b", re.IGNORECASE),
        "Contains broad waiver language that may strip core rights or remedies from one party.",
        "Consider narrowing waiver language so core rights and remedies are preserved for both parties.",
    ),
    (
        re.compile(
            r"\b(uncapped|unlimited liability|all damages|regardless of contributory fault)\b",
            re.IGNORECASE,
        ),
        "Imposes uncapped or unlimited liability that may be disproportionate to the agreed scope.",
        "Consider setting reasonable liability caps and excluding disproportionate consequential exposure.",
    ),
    (
        re.compile(
            r"\b(indemnify,?\s+defend,?\s+and\s+hold harmless|hold harmless)\b",
            re.IGNORECASE,
        ),
        "Contains broad indemnification language that may extend beyond the indemnifying party's own fault.",
        "Consider scoping indemnity to specific third-party claims and carve-outs tied to each party's fault.",
    ),
    (
        re.compile(
            r"\b(exclusive(?:ly)?|waives objections to venue|selected by client)\b",
            re.IGNORECASE,
        ),
        "Specifies a one-sided or non-neutral dispute venue or jurisdiction.",
        "Consider using a neutral venue or mutually agreed dispute forum.",
    ),
    (
        re.compile(r"\b(non-?compete|not provide .* competitor|exclusivity)\b", re.IGNORECASE),
        "Imposes non-compete or exclusivity restrictions that may be overly broad in scope or duration.",
        "Consider reducing non-compete duration/scope and allowing reasonable carve-outs for unrelated clients.",
    ),
    (
        re.compile(
            r"\b(non-?refundable|withhold payment|suspend(?:ed)? invoice|deemed accepted)\b",
            re.IGNORECASE,
        ),
        "Contains payment terms that allow withholding or deferral without balanced safeguards.",
        "Consider adding balanced acceptance criteria, payment timelines, and dispute-resolution safeguards.",
    ),
    (
        re.compile(
            r"\b(assign(?:ed|ment)? exclusively|retains ownership .* until all invoices)\b",
            re.IGNORECASE,
        ),
        "Creates IP ownership or assignment terms that may be unbalanced or contingent on disputed invoices.",
        "Consider clarifying IP ownership boundaries and ensuring license rights are fair to both parties.",
    ),
]

DEFAULT_UNFAIR_SUGGESTION = (
    "Consider revising this clause to ensure fair and balanced obligations for both parties."
)
DEFAULT_UNFAIR_REASON = "Contains potentially unbalanced obligations or one-sided terms."

# Extra patterns that warrant LLM review even when the classifier is confident.
LLM_REVIEW_PATTERNS = [
    re.compile(r"\b(outside (?:the )?project scope|scope creep|unlimited revisions?|revise anything)\b", re.IGNORECASE),
    re.compile(r"\b(no paid leave|no vacation|no sick leave|vacation and sick leaves?|paid[- ]leaves?)\b", re.IGNORECASE),
    re.compile(r"\b(cannot use the internet|may not use the internet|no internet access)\b", re.IGNORECASE),
]


def load_model():
    print(f"Loading model from {MODEL_PATH}...")
    classifier = pipeline(
        "text-classification",
        model=MODEL_PATH,
        tokenizer=MODEL_PATH,
    )
    return classifier


# ---------------------------------------------------------------------------
# Risk pattern helpers
# ---------------------------------------------------------------------------

def _match_risk_pattern(clause: str) -> tuple[str, str] | tuple[None, None]:
    """Return (reason, suggestion) from the first matching risk pattern."""
    for pattern, reason, suggestion in RISK_PATTERNS:
        if pattern.search(clause):
            return reason, suggestion
    return None, None


def _matches_llm_review_pattern(clause: str) -> bool:
    return any(p.search(clause) for p in LLM_REVIEW_PATTERNS)


# ---------------------------------------------------------------------------
# Suggestion and reason generation
# ---------------------------------------------------------------------------

def get_reason(clause: str, label: str, confidence: float) -> str | None:
    """
    Return a short one-sentence explanation of *why* a clause is flagged.
    Always None for fair clauses.
    """
    if label == "fair":
        return None

    reason, _ = _match_risk_pattern(clause.strip())
    if reason:
        return reason

    if confidence < LOW_CONFIDENCE_THRESHOLD:
        return "Confidence is below threshold — may contain subtle one-sided obligations."

    return DEFAULT_UNFAIR_REASON


def get_suggestion(clause: str, label: str, confidence: float) -> str:
    """Return a confidence-aware fix suggestion."""
    clause_text = clause.strip()
    _, targeted_suggestion = _match_risk_pattern(clause_text)

    if label == "fair":
        if confidence < LOW_CONFIDENCE_THRESHOLD:
            return "Borderline confidence — have a human reviewer check this clause before finalising."
        if targeted_suggestion and confidence < MODERATE_CONFIDENCE_THRESHOLD:
            return (
                "This clause appears mostly balanced, but one-sided wording is present. "
                f"{targeted_suggestion}"
            )
        return "This clause appears balanced and fair."

    if confidence < LOW_CONFIDENCE_THRESHOLD:
        if targeted_suggestion:
            return f"Confidence is low but a risk pattern was detected. {targeted_suggestion}"
        return "Confidence is low; review manually and rebalance obligations if needed."

    if targeted_suggestion:
        return targeted_suggestion

    return DEFAULT_UNFAIR_SUGGESTION


# ---------------------------------------------------------------------------
# Environment helpers
# ---------------------------------------------------------------------------

def _env_flag(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return max(1, int(raw.strip()))
    except Exception:
        return default


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return float(raw.strip())
    except Exception:
        return default


def _truncate_for_llm(text: str) -> str:
    max_chars = _env_int("LLM_SUGGESTIONS_MAX_CLAUSE_CHARS", 1200)
    cleaned = text.strip()
    if len(cleaned) <= max_chars:
        return cleaned
    return f"{cleaned[:max_chars].rstrip()} ... [truncated for LLM suggestion]"


def _calibrate_confidence(probability: float) -> float:
    """
    Apply temperature scaling so that UI confidence reflects trustworthiness
    realistically rather than collapsing to ~100% after fine-tuning saturation.
    """
    temperature = max(1.0, _env_float("CLASSIFIER_CONFIDENCE_TEMPERATURE", 2.5))
    epsilon = 1e-6
    p = min(max(probability, epsilon), 1 - epsilon)
    logit = math.log(p / (1 - p))
    calibrated = 1 / (1 + math.exp(-(logit / temperature)))
    return round(calibrated, 4)


# ---------------------------------------------------------------------------
# Inference
# ---------------------------------------------------------------------------

def _extract_prediction_scores(prediction: Any) -> tuple[str, float]:
    entries: list[dict[str, Any]]

    if isinstance(prediction, list) and prediction and isinstance(prediction[0], list):
        entries = prediction[0]
    elif isinstance(prediction, list):
        entries = prediction
    else:
        entries = [prediction]

    normalized: list[tuple[str, float]] = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        raw_label = entry.get("label")
        raw_score = entry.get("score")
        if isinstance(raw_label, str) and isinstance(raw_score, (int, float)):
            normalized.append((raw_label, float(raw_score)))

    if not normalized:
        return "LABEL_0", 0.5

    normalized.sort(key=lambda item: item[1], reverse=True)
    raw_label, top_score = normalized[0]
    return raw_label, _calibrate_confidence(top_score)


def _predict_clause(classifier, clause: str) -> tuple[str, float]:
    """Run a single inference, using max_length=512 (full LegalBERT capacity)."""
    try:
        prediction = classifier(clause, truncation=True, max_length=512, top_k=None)
    except TypeError:
        prediction = classifier(clause, truncation=True, max_length=512)
    return _extract_prediction_scores(prediction)


def _predict_clause_windowed(classifier, clause: str) -> tuple[str, float]:
    """
    Sliding-window inference for clauses that exceed the model's token budget.

    Strategy: split the clause into overlapping token windows of 480 tokens
    (with 100-token overlap), classify each window, then aggregate with
    'max-confidence-unfair-wins' — if any window is flagged unfair we report
    unfair at the highest unfair-window confidence.  This is intentionally
    conservative: a single problematic sentence inside a long paragraph
    should surface rather than be averaged away.
    """
    tokenizer = classifier.tokenizer
    token_ids = tokenizer.encode(clause, add_special_tokens=False)

    window_size = 480
    stride = 380  # 100-token overlap

    if len(token_ids) <= window_size:
        return _predict_clause(classifier, clause)

    windows: list[str] = []
    start = 0
    while start < len(token_ids):
        end = min(start + window_size, len(token_ids))
        window_text = tokenizer.decode(token_ids[start:end], skip_special_tokens=True)
        windows.append(window_text)
        if end >= len(token_ids):
            break
        start += stride

    best_unfair_conf = 0.0
    best_fair_conf = 0.0
    found_unfair = False

    for window in windows:
        raw_label, conf = _predict_clause(classifier, window)
        label = LABELS.get(raw_label, raw_label)
        if label == "unfair":
            found_unfair = True
            if conf > best_unfair_conf:
                best_unfair_conf = conf
        else:
            if conf > best_fair_conf:
                best_fair_conf = conf

    if found_unfair:
        return "LABEL_1", best_unfair_conf
    return "LABEL_0", best_fair_conf


# ---------------------------------------------------------------------------
# LLM integration helpers
# ---------------------------------------------------------------------------

def _needs_llm_verdict(result: dict) -> bool:
    if _env_flag("LLM_SUGGESTIONS_FORCE_ALL", default=False):
        return True

    confidence = result["confidence"]
    clause = result["clause"]

    # Always send low-confidence results for LLM arbitration.
    if confidence < LOW_CONFIDENCE_THRESHOLD:
        return True

    # Send borderline unfair results (below moderate confidence).
    if result["label"] == "unfair" and confidence < MODERATE_CONFIDENCE_THRESHOLD:
        return True

    # Send suspicious "fair" verdicts where known risk patterns are present.
    return (
        result["label"] == "fair"
        and confidence < SUSPICIOUS_FAIR_LLM_THRESHOLD
        and (
            _matches_llm_review_pattern(clause)
            or _match_risk_pattern(clause)[0] is not None
        )
    )


def _needs_llm_suggestion(result: dict) -> bool:
    if _env_flag("LLM_SUGGESTIONS_FORCE_ALL", default=False):
        return True

    if result.get("suggestion_source") == "llm":
        return False

    return (
        result["label"] == "unfair"
        and result["confidence"] < MODERATE_CONFIDENCE_THRESHOLD
    )


def _apply_llm_verdicts(results: list[dict]) -> list[dict]:
    """
    Use the LLM to review borderline or suspicious clauses and override
    the classifier verdict when a more reliable answer is available.
    The LLM can supply label, reason, issue, and suggestion.
    """
    if not results or not is_llm_suggestions_enabled() or generate_llm_clause_reviews_batch is None:
        return results

    candidates: list[dict[str, Any]] = [
        {
            "index": idx,
            "clause": _truncate_for_llm(result["clause"]),
            "label": result["label"],
            "confidence": result["confidence"],
        }
        for idx, result in enumerate(results)
        if _needs_llm_verdict(result)
    ]

    if not candidates:
        return results

    llm_reviews = generate_llm_clause_reviews_batch(candidates)
    if not llm_reviews:
        return results

    for candidate, review in zip(candidates, llm_reviews):
        if not review:
            continue

        label = review.get("label")
        if label not in {"fair", "unfair"}:
            continue

        idx = candidate["index"]
        original_label = results[idx]["label"]
        results[idx]["label"] = label

        # Apply reason (short explanation).
        llm_reason = review.get("reason", "")
        if isinstance(llm_reason, str) and llm_reason.strip():
            results[idx]["reason"] = llm_reason.strip()
        elif label == "unfair" and not results[idx].get("reason"):
            results[idx]["reason"] = DEFAULT_UNFAIR_REASON

        # Apply issue (detailed LLM explanation).
        issue = review.get("issue", "")
        if isinstance(issue, str) and issue.strip():
            results[idx]["issue"] = issue.strip()

        # Apply suggestion.
        suggestion = review.get("suggestion", "")
        if isinstance(suggestion, str) and suggestion.strip():
            results[idx]["suggestion"] = suggestion.strip()
            results[idx]["suggestion_source"] = "llm"

        # When the LLM flips a low-confidence verdict, cap confidence to signal
        # that it came from fallback review rather than a strong model score.
        if original_label != label and results[idx]["confidence"] < MODERATE_CONFIDENCE_THRESHOLD:
            results[idx]["confidence"] = round(
                min(results[idx]["confidence"], LOW_CONFIDENCE_THRESHOLD), 4
            )

        # Clear reason when LLM marks a rule-flagged clause as fair.
        if label == "fair":
            results[idx]["reason"] = None

    return results


def _apply_llm_suggestions(results: list[dict]) -> list[dict]:
    """Optionally enhance suggestions with LLM output, falling back to rules on failure."""
    if not results or not is_llm_suggestions_enabled() or generate_llm_suggestions_batch is None:
        return results

    candidates = [
        {
            "index": idx,
            "clause": _truncate_for_llm(result["clause"]),
            "label": result["label"],
            "confidence": result["confidence"],
        }
        for idx, result in enumerate(results)
        if _needs_llm_suggestion(result)
    ]

    if not candidates:
        return results

    llm_suggestions = generate_llm_suggestions_batch(candidates)
    if not llm_suggestions:
        return results

    for candidate, llm_suggestion in zip(candidates, llm_suggestions):
        if llm_suggestion and llm_suggestion.strip():
            results[candidate["index"]]["suggestion"] = llm_suggestion.strip()
            results[candidate["index"]]["suggestion_source"] = "llm"

    return results


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def analyze_clauses(classifier, clauses: list) -> list:
    """
    Run inference on a list of clauses.

    Each result dict contains:
      clause          — original text
      label           — "fair" | "unfair"
      confidence      — calibrated float 0-1
      reason          — short one-sentence explanation (None for fair clauses)
      suggestion      — fix/confirmation text
      suggestion_source — "rule" | "llm"
      issue           — detailed LLM explanation (None unless LLM ran)
    """
    results = []

    for clause in clauses:
        if not clause.strip():
            continue

        raw_label, confidence = _predict_clause_windowed(classifier, clause)
        label = LABELS.get(raw_label, raw_label)
        reason = get_reason(clause, label, confidence)
        suggestion = get_suggestion(clause, label, confidence)

        results.append({
            "clause": clause,
            "label": label,
            "confidence": confidence,
            "reason": reason,
            "suggestion": suggestion,
            "suggestion_source": "rule",
            "issue": None,
        })

    results = _apply_llm_verdicts(results)
    return _apply_llm_suggestions(results)
