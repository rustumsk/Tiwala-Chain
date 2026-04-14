import importlib

import model


class _FakeClassifier:
    def __call__(self, clause, truncation=True, max_length=128):
        if "terminate" in clause.lower():
            return [{"label": "LABEL_1", "score": 0.58}]
        return [{"label": "LABEL_0", "score": 0.91}]


def test_llm_disabled_keeps_rule_suggestions(monkeypatch):
    importlib.reload(model)
    monkeypatch.setattr(model, "is_llm_suggestions_enabled", lambda: False)
    monkeypatch.setattr(model, "generate_llm_suggestions_batch", None)

    results = model.analyze_clauses(
        _FakeClassifier(),
        ["Client may terminate this Agreement immediately without notice."],
    )

    assert len(results) == 1
    assert results[0]["suggestion_source"] == "rule"
    assert "notice" in results[0]["suggestion"].lower()


def test_llm_enabled_overrides_selected_candidates(monkeypatch):
    importlib.reload(model)
    monkeypatch.setattr(model, "is_llm_suggestions_enabled", lambda: True)
    monkeypatch.setattr(model, "generate_llm_clause_reviews_batch", lambda batch: [None] * len(batch))
    monkeypatch.setattr(
        model,
        "generate_llm_suggestions_batch",
        lambda batch: ["Use a 30-day notice and cure period."],
    )

    results = model.analyze_clauses(
        _FakeClassifier(),
        ["Client may terminate this Agreement immediately without notice."],
    )

    assert len(results) == 1
    assert results[0]["suggestion_source"] == "llm"
    assert "30-day notice" in results[0]["suggestion"]


def test_force_all_routes_even_high_confidence_rule_suggestions(monkeypatch):
    importlib.reload(model)
    monkeypatch.setenv("LLM_SUGGESTIONS_FORCE_ALL", "true")
    monkeypatch.setattr(model, "is_llm_suggestions_enabled", lambda: True)
    monkeypatch.setattr(model, "generate_llm_clause_reviews_batch", lambda batch: [None] * len(batch))
    monkeypatch.setattr(
        model,
        "generate_llm_suggestions_batch",
        lambda batch: ["LLM rewrite for all clauses."],
    )

    classifier = type(
        "HighConfidenceFairClassifier",
        (),
        {"__call__": lambda self, clause, truncation=True, max_length=128: [{"label": "LABEL_0", "score": 0.96}]},
    )()

    results = model.analyze_clauses(classifier, ["Payment shall be made within ten days."])
    assert len(results) == 1
    assert results[0]["suggestion_source"] == "llm"
    assert results[0]["suggestion"] == "LLM rewrite for all clauses."


def test_low_confidence_fair_clause_can_be_reclassified_by_llm(monkeypatch):
    importlib.reload(model)
    monkeypatch.setattr(model, "is_llm_suggestions_enabled", lambda: True)
    monkeypatch.setattr(
        model,
        "generate_llm_clause_reviews_batch",
        lambda batch: [
            {
                "label": "unfair",
                "issue": "The clause allows unlimited requests outside the agreed scope.",
                "suggestion": "Client may request revisions only within the agreed scope unless both parties approve a scope change in writing.",
            }
        ],
    )
    monkeypatch.setattr(model, "generate_llm_suggestions_batch", lambda batch: [None] * len(batch))

    classifier = type(
        "LowConfidenceFairClassifier",
        (),
        {"__call__": lambda self, clause, truncation=True, max_length=128: [{"label": "LABEL_0", "score": 0.55}]},
    )()

    results = model.analyze_clauses(
        classifier,
        ["Client may revise anything it wants even if the request falls outside the project scope."],
    )

    assert len(results) == 1
    assert results[0]["label"] == "unfair"
    assert results[0]["suggestion_source"] == "llm"
    assert "outside the agreed scope" in results[0]["issue"].lower()


def test_suspicious_fair_clause_routes_to_llm_review(monkeypatch):
    importlib.reload(model)
    monkeypatch.setattr(model, "is_llm_suggestions_enabled", lambda: True)
    monkeypatch.setattr(
        model,
        "generate_llm_clause_reviews_batch",
        lambda batch: [
            {
                "label": "unfair",
                "issue": "The clause removes leave protections in a one-sided way.",
                "suggestion": "Any leave, availability, or time-off expectations must be explicitly agreed and reflected in project timelines and compensation.",
            }
        ],
    )
    monkeypatch.setattr(model, "generate_llm_suggestions_batch", lambda batch: [None] * len(batch))

    classifier = type(
        "ModerateConfidenceFairClassifier",
        (),
        {"__call__": lambda self, clause, truncation=True, max_length=128: [{"label": "LABEL_0", "score": 0.82}]},
    )()

    results = model.analyze_clauses(
        classifier,
        ["There should be no paid-leaves or vacation and sick leaves during the engagement."],
    )

    assert len(results) == 1
    assert results[0]["label"] == "unfair"
    assert results[0]["suggestion_source"] == "llm"
    assert "leave" in results[0]["issue"].lower()


def test_confidence_is_softened_from_raw_classifier_score(monkeypatch):
    importlib.reload(model)
    monkeypatch.setattr(model, "is_llm_suggestions_enabled", lambda: False)
    monkeypatch.setattr(model, "generate_llm_suggestions_batch", None)
    monkeypatch.setenv("CLASSIFIER_CONFIDENCE_TEMPERATURE", "2.5")

    classifier = type(
        "AllScoresClassifier",
        (),
        {
            "__call__": lambda self, clause, truncation=True, max_length=128, top_k=None: [[
                {"label": "LABEL_0", "score": 0.9999},
                {"label": "LABEL_1", "score": 0.0001},
            ]]
        },
    )()

    results = model.analyze_clauses(classifier, ["Payment shall be made within ten days."])

    assert len(results) == 1
    assert results[0]["label"] == "fair"
    assert results[0]["confidence"] < 0.99
