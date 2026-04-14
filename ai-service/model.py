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

# Label mapping
LABELS = {
    "LABEL_0": "fair",
    "LABEL_1": "unfair"
}

LOW_CONFIDENCE_THRESHOLD = 0.60
MODERATE_CONFIDENCE_THRESHOLD = 0.75

RISK_SUGGESTIONS = [
    (
        re.compile(r"\b(without notice|immediate(?:ly)?(?:\s+for convenience)?|terminate(?:d|s)?\s+at\s+any\s+time)\b", re.IGNORECASE),
        "Consider requiring advance written notice and a cure period before termination.",
    ),
    (
        re.compile(r"\b(sole discretion|at its discretion|unilateral(?:ly)?)\b", re.IGNORECASE),
        "Consider replacing unilateral discretion with objective criteria and mutual agreement mechanisms.",
    ),
    (
        re.compile(r"\b(waive|waiver|irrevocably waives)\b", re.IGNORECASE),
        "Consider narrowing waiver language so core rights and remedies are preserved for both parties.",
    ),
    (
        re.compile(r"\b(uncapped|unlimited liability|all damages|regardless of contributory fault)\b", re.IGNORECASE),
        "Consider setting reasonable liability caps and excluding disproportionate consequential exposure.",
    ),
    (
        re.compile(r"\b(indemnify,?\s+defend,?\s+and\s+hold harmless|hold harmless)\b", re.IGNORECASE),
        "Consider scoping indemnity to specific third-party claims and carve-outs tied to each party's fault.",
    ),
    (
        re.compile(r"\b(exclusive(?:ly)?|waives objections to venue|selected by client)\b", re.IGNORECASE),
        "Consider using a neutral venue or mutually agreed dispute forum.",
    ),
    (
        re.compile(r"\b(non-?compete|not provide .* competitor|exclusivity)\b", re.IGNORECASE),
        "Consider reducing non-compete duration/scope and allowing reasonable carve-outs for unrelated clients.",
    ),
    (
        re.compile(r"\b(non-?refundable|withhold payment|suspend(?:ed)? invoice|deemed accepted)\b", re.IGNORECASE),
        "Consider adding balanced acceptance criteria, payment timelines, and dispute-resolution safeguards.",
    ),
    (
        re.compile(r"\b(assign(?:ed|ment)? exclusively|retains ownership .* until all invoices)\b", re.IGNORECASE),
        "Consider clarifying IP ownership boundaries and ensuring license rights are fair to both parties.",
    ),
]

DEFAULT_UNFAIR_SUGGESTION = (
    "Consider revising this clause to ensure fair and balanced obligations for both parties."
)

LLM_REVIEW_PATTERNS = [
    re.compile(r"\b(outside (?:the )?project scope|scope creep|unlimited revisions?|revise anything)\b", re.IGNORECASE),
    re.compile(r"\b(no paid leave|no vacation|no sick leave|vacation and sick leaves?|paid[- ]leaves?)\b", re.IGNORECASE),
    re.compile(r"\b(cannot use the internet|may not use the internet|no internet access)\b", re.IGNORECASE),
]
SUSPICIOUS_FAIR_LLM_THRESHOLD = 0.9


def load_model():
    """Load the fine-tuned model from local path."""
    print(f"Loading model from {MODEL_PATH}...")
    classifier = pipeline(
        "text-classification",
        model=MODEL_PATH,
        tokenizer=MODEL_PATH
    )
    return classifier


def _suggestion_by_risk_pattern(clause: str) -> str | None:
    for pattern, suggestion in RISK_SUGGESTIONS:
        if pattern.search(clause):
            return suggestion
    return None


def _matches_llm_review_pattern(clause: str) -> bool:
    return any(pattern.search(clause) for pattern in LLM_REVIEW_PATTERNS)


def get_suggestion(clause: str, label: str, confidence: float) -> str:
    """Return confidence-aware suggestions with contract-specific guidance."""
    clause_text = clause.strip()
    targeted_suggestion = _suggestion_by_risk_pattern(clause_text)

    if label == "fair":
        if confidence < LOW_CONFIDENCE_THRESHOLD:
            return (
                "This clause is borderline and should be reviewed by a human reviewer before final approval."
            )
        if targeted_suggestion and confidence < MODERATE_CONFIDENCE_THRESHOLD:
            return (
                "This clause appears mostly balanced, but one-sided wording is present. "
                f"{targeted_suggestion}"
            )
        return "This clause appears balanced and fair."

    if confidence < LOW_CONFIDENCE_THRESHOLD:
        if targeted_suggestion:
            return (
                "This clause may be unfair but confidence is low. "
                f"{targeted_suggestion}"
            )
        return (
            "This clause may be unfair but confidence is low; review manually and rebalance obligations if needed."
        )

    if targeted_suggestion:
        return targeted_suggestion

    return DEFAULT_UNFAIR_SUGGESTION


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
        value = int(raw.strip())
    except Exception:
        return default
    return max(1, value)


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
    The classifier's raw softmax score is often overly saturated after fine-tuning.
    Apply lightweight temperature scaling so UI confidence reflects trustworthiness
    more realistically and does not collapse to 100% for nearly every clause.
    """
    temperature = max(1.0, _env_float("CLASSIFIER_CONFIDENCE_TEMPERATURE", 2.5))
    epsilon = 1e-6
    p = min(max(probability, epsilon), 1 - epsilon)
    logit = math.log(p / (1 - p))
    calibrated = 1 / (1 + math.exp(-(logit / temperature)))
    return round(calibrated, 4)


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
    calibrated_confidence = _calibrate_confidence(top_score)
    return raw_label, calibrated_confidence


def _predict_clause(classifier, clause: str) -> tuple[str, float]:
    try:
        prediction = classifier(clause, truncation=True, max_length=128, top_k=None)
    except TypeError:
        prediction = classifier(clause, truncation=True, max_length=128)
    return _extract_prediction_scores(prediction)


def _needs_llm_suggestion(result: dict) -> bool:
    """Only call the LLM for unfair clauses.

    Fair clauses keep the rule-based suggestion so we don't overwrite
    everything with LLM output.
    """
    if _env_flag("LLM_SUGGESTIONS_FORCE_ALL", default=False):
        return True

    if result.get("suggestion_source") == "llm":
        return False

    label = result["label"]
    confidence = result["confidence"]

    # Only unfair clauses may trigger LLM enhancement, typically when
    # the model is not very confident about the prediction.
    if label == "unfair" and confidence < MODERATE_CONFIDENCE_THRESHOLD:
        return True

    return False


def _needs_llm_verdict(result: dict) -> bool:
    if _env_flag("LLM_SUGGESTIONS_FORCE_ALL", default=False):
        return True

    confidence = result["confidence"]
    clause = result["clause"]

    if confidence < LOW_CONFIDENCE_THRESHOLD:
        return True

    return (
        result["label"] == "fair"
        and confidence < SUSPICIOUS_FAIR_LLM_THRESHOLD
        and (
            _matches_llm_review_pattern(clause)
            or _suggestion_by_risk_pattern(clause) is not None
        )
    )


def _apply_llm_verdicts(results: list[dict]) -> list[dict]:
    """
    Optionally use the LLM to review borderline or suspicious clauses and
    override the classifier verdict when a more reliable answer is returned.
    """
    if not results:
        return results
    if not is_llm_suggestions_enabled():
        return results
    if generate_llm_clause_reviews_batch is None:
        return results

    candidates: list[dict[str, Any]] = []
    for idx, result in enumerate(results):
        if _needs_llm_verdict(result):
            candidates.append(
                {
                    "index": idx,
                    "clause": _truncate_for_llm(result["clause"]),
                    "label": result["label"],
                    "confidence": result["confidence"],
                }
            )

    if not candidates:
        return results

    llm_reviews = generate_llm_clause_reviews_batch(candidates)
    if not llm_reviews:
        return results

    for candidate, review in zip(candidates, llm_reviews):
        if not review:
            continue

        label = review.get("label")
        suggestion = review.get("suggestion", "")
        issue = review.get("issue", "")
        if label not in {"fair", "unfair"}:
            continue

        result_idx = candidate["index"]
        original_label = results[result_idx]["label"]
        results[result_idx]["label"] = label

        if isinstance(issue, str) and issue.strip():
            results[result_idx]["issue"] = issue.strip()

        if isinstance(suggestion, str) and suggestion.strip():
            results[result_idx]["suggestion"] = suggestion.strip()
            results[result_idx]["suggestion_source"] = "llm"

        # When the classifier was low-confidence and the LLM flips the label,
        # mark the result with a conservative confidence so the UI reflects
        # that it came from fallback review rather than a strong model score.
        if original_label != label and results[result_idx]["confidence"] < MODERATE_CONFIDENCE_THRESHOLD:
            results[result_idx]["confidence"] = round(min(results[result_idx]["confidence"], LOW_CONFIDENCE_THRESHOLD), 4)

    return results


def _apply_llm_suggestions(results: list[dict]) -> list[dict]:
    """
    Optionally enhance suggestions with LLM output.
    Safely falls back to rule suggestions on any failure.
    """
    if not results:
        return results
    if not is_llm_suggestions_enabled():
        return results
    if generate_llm_suggestions_batch is None:
        return results

    candidates: list[dict[str, Any]] = []
    for idx, result in enumerate(results):
        if _needs_llm_suggestion(result):
            candidates.append(
                {
                    "index": idx,
                    "clause": _truncate_for_llm(result["clause"]),
                    "label": result["label"],
                    "confidence": result["confidence"],
                }
            )

    if not candidates:
        return results

    llm_suggestions = generate_llm_suggestions_batch(candidates)
    if not llm_suggestions:
        return results

    for candidate, llm_suggestion in zip(candidates, llm_suggestions):
        if llm_suggestion and llm_suggestion.strip():
            result_idx = candidate["index"]
            results[result_idx]["suggestion"] = llm_suggestion.strip()
            results[result_idx]["suggestion_source"] = "llm"

    return results


def analyze_clauses(classifier, clauses: list) -> list:
    """Run inference on a list of clauses."""
    results = []

    for clause in clauses:
        if not clause.strip():
            continue

        raw_label, confidence = _predict_clause(classifier, clause)
        label = LABELS.get(raw_label, raw_label)
        suggestion = get_suggestion(clause, label, confidence)

        results.append({
            "clause": clause,
            "label": label,
            "confidence": confidence,
            "suggestion": suggestion,
            "suggestion_source": "rule",
        })

    results = _apply_llm_verdicts(results)
    return _apply_llm_suggestions(results)
