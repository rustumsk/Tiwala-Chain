import re
import os
from typing import Any

from transformers import pipeline
try:
    from llm_suggestions import generate_llm_suggestions_batch, is_llm_suggestions_enabled
except Exception:  # pragma: no cover - optional module fallback
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


def _truncate_for_llm(text: str) -> str:
    max_chars = _env_int("LLM_SUGGESTIONS_MAX_CLAUSE_CHARS", 1200)
    cleaned = text.strip()
    if len(cleaned) <= max_chars:
        return cleaned
    return f"{cleaned[:max_chars].rstrip()} ... [truncated for LLM suggestion]"


def _needs_llm_suggestion(result: dict) -> bool:
    if _env_flag("LLM_SUGGESTIONS_FORCE_ALL", default=False):
        return True

    label = result["label"]
    confidence = result["confidence"]
    suggestion = result["suggestion"]

    if label == "unfair" and confidence < MODERATE_CONFIDENCE_THRESHOLD:
        return True
    if label == "fair" and confidence < LOW_CONFIDENCE_THRESHOLD:
        return True
    return suggestion == DEFAULT_UNFAIR_SUGGESTION


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

        prediction = classifier(clause, truncation=True, max_length=128)
        raw_label = prediction[0]["label"]
        confidence = round(prediction[0]["score"], 4)
        label = LABELS.get(raw_label, raw_label)
        suggestion = get_suggestion(clause, label, confidence)

        results.append({
            "clause": clause,
            "label": label,
            "confidence": confidence,
            "suggestion": suggestion,
            "suggestion_source": "rule",
        })

    return _apply_llm_suggestions(results)