from extractor import split_into_clauses, split_into_clauses_with_sections


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


def test_excludes_document_preamble_before_first_numbered_clause():
    text = """
    FREELANCING CONTRACT
    This Agreement is made and entered into by and between:
    Client: Maria Santos
    Freelancer: Jarduliza Arellano

    1. Scope of Work. The Freelancer shall perform a fairness evaluation.
    2. Payment Terms. The Client shall pay within five (5) business days.
    """
    clauses = split_into_clauses(text)
    assert len(clauses) >= 2
    assert clauses[0].startswith("1. Scope of Work.")
    joined = " ".join(clauses).lower()
    assert "this agreement is made and entered into" not in joined
    assert "client: maria santos" not in joined


def test_removes_signature_block_from_last_clause():
    text = """
    12. Governing Law. This Agreement shall be governed by Philippine law.
    Client Signature: ___________________________ Date: ____________
    Freelancer Signature: ________________________ Date: ____________
    """
    clauses = split_into_clauses(text)
    assert len(clauses) == 1
    assert clauses[0].startswith("12. Governing Law.")
    assert "client signature" not in clauses[0].lower()
    assert "freelancer signature" not in clauses[0].lower()


def test_returns_sections_for_audit_metadata():
    text = """
    FREELANCING CONTRACT
    This Agreement is between Client and Freelancer.

    1. Scope. The Freelancer shall evaluate the contract for fairness.
    2. Payment. The Client shall pay within five (5) business days.
    Client Signature: __________________ Date: ____________
    Freelancer Signature: ______________ Date: ____________
    """
    sections = split_into_clauses_with_sections(text)

    assert "this agreement is between client and freelancer" in sections["preamble"].lower()
    assert len(sections["clauses"]) == 2
    assert sections["clauses"][0].startswith("1. Scope.")
    assert sections["clauses"][1].startswith("2. Payment.")
    assert "client signature" in sections["signature_block"].lower()
    assert "freelancer signature" in sections["signature_block"].lower()


def test_does_not_split_on_parenthetical_acronym_like_sow():
    text = """
    2. Services and Statements of Work.
    2.1 Service Provider shall perform services set forth in one or more Statements of Work (SOW) executed by authorized representatives of both Parties.
    2.2 If there is a conflict between this Agreement and an SOW, the SOW controls only for terms expressly addressed in that SOW.
    """
    clauses = split_into_clauses(text)
    joined = " ".join(clauses)
    assert "(SOW) executed by authorized representatives of both Parties." in joined
    assert not any(c.startswith("(SOW)") for c in clauses)


def test_signed_by_phrase_does_not_trigger_signature_mode():
    text = """
    5. Change Management.
    5.1 Any material change to scope requires a written change order signed by both Parties.
    5.2 Service Provider is not obligated to start changed work until the change order is fully executed.
    6. Intellectual Property. Subject to payment in full, Client owns Deliverables.
    """
    sections = split_into_clauses_with_sections(text)
    clauses = sections["clauses"]
    assert any("5.1 Any material change" in c for c in clauses)
    assert any(c.startswith("5.2 Service Provider") for c in clauses)
    assert any(c.startswith("6. Intellectual Property.") for c in clauses)
    assert sections["signature_block"] == ""
