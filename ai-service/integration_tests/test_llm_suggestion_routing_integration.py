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
