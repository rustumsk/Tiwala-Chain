from extractor import split_into_clauses


def test_splits_numeric_clauses():
    text = """
    1. Payment Terms. Client shall pay within fifteen (15) days.
    2. Confidentiality. Contractor shall keep all records confidential.
    3. Termination. Either party may terminate with thirty (30) days notice.
    """
    clauses = split_into_clauses(text)
    assert len(clauses) >= 3
    assert any(c.startswith("1. Payment Terms") for c in clauses)
    assert any(c.startswith("2. Confidentiality") for c in clauses)
    assert any(c.startswith("3. Termination") for c in clauses)


def test_splits_subclauses():
    text = """
    2. Services.
    2.1 Contractor shall deliver milestones in writing.
    2.2 Contractor shall provide weekly progress updates.
    2.3 Client may request clarifications as reasonably necessary.
    """
    clauses = split_into_clauses(text)
    assert len(clauses) >= 3
    assert any("2. Services." in c for c in clauses)
    assert any("2.1 Contractor" in c for c in clauses)
    assert any(c.startswith("2.2 Contractor") for c in clauses)
    assert any(c.startswith("2.3 Client") for c in clauses)


def test_splits_lettered_subclauses():
    text = """
    4. Obligations.
    (a) Contractor shall comply with all applicable laws and regulations.
    (b) Contractor shall maintain accurate and complete work records.
    (c) Contractor shall promptly notify Client of material delays.
    """
    clauses = split_into_clauses(text)
    assert len(clauses) >= 3
    assert any("4. Obligations." in c for c in clauses)
    assert any("(a) Contractor" in c for c in clauses)
    assert any(c.startswith("(b) Contractor") for c in clauses)
    assert any(c.startswith("(c) Contractor") for c in clauses)


def test_detects_all_caps_headings():
    text = """
    DEFINITIONS
    "Services" means the deliverables listed in Schedule A.

    LIABILITY
    Neither party shall be liable for indirect or consequential damages.
    """
    clauses = split_into_clauses(text)
    assert len(clauses) >= 2
    assert any("DEFINITIONS" in c for c in clauses)
    assert any("LIABILITY" in c for c in clauses)


def test_keeps_wrapped_lines_together():
    text = """
    5. Intellectual Property. All work product developed under this Agreement
    shall remain the sole property of the Client and shall be assigned
    by the Contractor upon request.
    6. Governing Law. This Agreement shall be governed by the laws of the Philippines.
    """
    clauses = split_into_clauses(text)
    assert len(clauses) >= 2
    first = clauses[0]
    assert "All work product developed under this Agreement" in first
    assert "shall remain the sole property of the Client" in first
    assert "assigned by the Contractor" in first


def test_ignores_common_page_noise():
    text = """
    Page 1 of 8
    CONFIDENTIAL
    1. Scope. Contractor shall provide analytics support and model updates.
    2/8
    2. Fees. Client shall pay the monthly fees within ten (10) days.
    """
    clauses = split_into_clauses(text)
    assert len(clauses) >= 2
    joined = " ".join(clauses).lower()
    assert "page 1 of 8" not in joined
    assert "confidential" not in joined
    assert "2/8" not in joined


def test_splits_embedded_numbering_in_flattened_text():
    text = (
        "1. Scope. Contractor provides support and maintenance. "
        "2. Payment. Client pays within fifteen days of invoice. "
        "3. Termination. Either party may terminate for material breach."
    )
    clauses = split_into_clauses(text)
    assert len(clauses) >= 3
    assert any(c.startswith("1. Scope.") for c in clauses)
    assert any(c.startswith("2. Payment.") for c in clauses)
    assert any(c.startswith("3. Termination.") for c in clauses)


def test_returns_empty_for_blank_input():
    assert split_into_clauses("   \n\n\t") == []
