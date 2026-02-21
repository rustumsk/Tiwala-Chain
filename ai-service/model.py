from transformers import pipeline

MODEL_PATH = "./fine_tuned_model"

# Label mapping
LABELS = {
    "LABEL_0": "fair",
    "LABEL_1": "unfair"
}

# Suggestion templates per unfair pattern keywords
SUGGESTIONS = {
    "waive": "Consider removing waiver clauses that eliminate basic rights without mutual benefit.",
    "unlimited": "Consider limiting this obligation to a specific number of rounds or hours.",
    "any reason": "Consider specifying clear, objective conditions instead of subjective ones.",
    "without notice": "Consider requiring a minimum notice period for both parties.",
    "without compensation": "Consider adding fair compensation for additional work or early termination.",
    "sole discretion": "Consider requiring mutual agreement or third-party arbitration instead.",
    "exclusively": "Consider allowing neutral or mutually agreed jurisdiction for disputes.",
    "all risk": "Consider distributing risk proportionally between both parties.",
    "regardless": "Consider adding exceptions for circumstances outside the freelancer's control.",
    "default": "Consider revising this clause to ensure fair and balanced obligations for both parties."
}


def load_model():
    """Load the fine-tuned model from local path."""
    print(f"Loading model from {MODEL_PATH}...")
    classifier = pipeline(
        "text-classification",
        model=MODEL_PATH,
        tokenizer=MODEL_PATH
    )
    return classifier


def get_suggestion(clause: str, label: str) -> str:
    """Return a suggestion based on clause content."""
    if label == "fair":
        return "This clause appears balanced and fair."

    clause_lower = clause.lower()
    for keyword, suggestion in SUGGESTIONS.items():
        if keyword != "default" and keyword in clause_lower:
            return suggestion

    return SUGGESTIONS["default"]


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
        suggestion = get_suggestion(clause, label)

        results.append({
            "clause": clause,
            "label": label,
            "confidence": confidence,
            "suggestion": suggestion
        })

    return results