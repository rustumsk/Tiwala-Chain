import importlib
import sys
import types

import pytest
from fastapi.testclient import TestClient


def _stub_analyze_clauses(_, clauses: list[str]) -> list[dict]:
    results = []
    for clause in clauses:
        label = "unfair" if "without notice" in clause.lower() else "fair"
        results.append(
            {
                "clause": clause,
                "label": label,
                "confidence": 0.99 if label == "unfair" else 0.88,
                "suggestion": "Stub suggestion for test coverage.",
            }
        )
    return results


@pytest.fixture()
def client():
    if "python_multipart" not in sys.modules:
        python_multipart = types.ModuleType("python_multipart")
        python_multipart.__version__ = "0.0.20"
        sys.modules["python_multipart"] = python_multipart

    import model

    model.load_model = lambda: object()
    model.analyze_clauses = _stub_analyze_clauses

    import main

    main = importlib.reload(main)
    return TestClient(main.app)
