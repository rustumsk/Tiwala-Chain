import io

import pytest
from docx import Document


def _build_docx_bytes(paragraphs: list[str]) -> bytes:
    document = Document()
    for paragraph in paragraphs:
        document.add_paragraph(paragraph)

    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def _multipart_parser_available() -> bool:
    try:
        from multipart.multipart import parse_options_header

        return callable(parse_options_header)
    except Exception:
        return False


def test_health_endpoint(client):
    response = client.get("/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["model"] == "legal-bert-finetuned"


def test_evaluate_text_success(client):
    response = client.post(
        "/evaluate/text",
        json={
            "text": (
                "1. Payment. Client shall pay all invoices within ten (10) days.\n"
                "2. Termination. Client may terminate this Agreement without notice."
            )
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["total_clauses"] >= 2
    assert payload["unfair_count"] >= 1
    assert len(payload["clauses"]) == payload["total_clauses"]


def test_evaluate_text_rejects_empty(client):
    response = client.post("/evaluate/text", json={"text": "   "})
    assert response.status_code == 400
    assert "cannot be empty" in response.json()["detail"].lower()


@pytest.mark.skipif(
    not _multipart_parser_available(),
    reason="python-multipart parser is not installed in this environment",
)
def test_evaluate_file_docx_success(client):
    file_bytes = _build_docx_bytes(
        [
            "1. Scope. Contractor shall provide software support.",
            "2. Fees. Client shall pay the monthly fee within ten (10) days.",
            "3. Termination. Either party may terminate with notice.",
        ]
    )
    response = client.post(
        "/evaluate/file",
        files={
            "file": (
                "agreement.docx",
                file_bytes,
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["total_clauses"] >= 2
    assert payload["fair_count"] >= 1


@pytest.mark.skipif(
    not _multipart_parser_available(),
    reason="python-multipart parser is not installed in this environment",
)
def test_evaluate_file_rejects_unsupported_extension(client):
    response = client.post(
        "/evaluate/file",
        files={"file": ("notes.txt", b"just text", "text/plain")},
    )
    assert response.status_code == 400
    assert "only pdf and docx files are supported" in response.json()["detail"].lower()
