import io
import re
from typing import Dict, List
import pdfplumber
from docx import Document


def extract_text(file_bytes: bytes, filename: str) -> str:
    """
    Extract plain text from PDF or DOCX file bytes.
    """
    if filename.endswith(".pdf"):
        return extract_from_pdf(file_bytes)
    elif filename.endswith(".docx"):
        return extract_from_docx(file_bytes)
    else:
        raise ValueError("Unsupported file type. Only PDF and DOCX are supported.")


def extract_from_pdf(file_bytes: bytes) -> str:
    """Extract text from PDF bytes using pdfplumber."""
    text = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text.append(page_text)
    return "\n".join(text)


def extract_from_docx(file_bytes: bytes) -> str:
    """Extract text from DOCX bytes using python-docx."""
    doc = Document(io.BytesIO(file_bytes))
    text = []
    for paragraph in doc.paragraphs:
        if paragraph.text.strip():
            text.append(paragraph.text.strip())
    return "\n".join(text)


CLAUSE_START_RE = re.compile(
    r"""^(
        Section\s+\d+(?:\.\d+)*[\.:]?\s+|
        Article\s+[IVXLCM]+[\.:]?\s+|
        \d+(?:\.\d+)*[\.\)]\s+|
        \((?:[a-z]|\d{1,2}|[ivx]{1,4})\)\s+|
        [a-zA-Z]\)\s+|
        [IVXLCM]+\.\s+
    )""",
    re.IGNORECASE | re.VERBOSE,
)

SUBSTANTIVE_CLAUSE_START_RE = re.compile(
    r"""^(
        Section\s+\d+(?:\.\d+)*[\.:]?\s+|
        Article\s+[IVXLCM]+[\.:]?\s+|
        \d+(?:\.\d+)*[\.\)]\s+
    )""",
    re.IGNORECASE | re.VERBOSE,
)

ALL_CAPS_HEADING_RE = re.compile(r"^[A-Z][A-Z0-9\s,&/\-]{4,}$")
PAGE_NOISE_RE = re.compile(
    r"^(page\s+\d+(\s+of\s+\d+)?|\d+\s*/\s*\d+|confidential|draft)$",
    re.IGNORECASE,
)
CONTINUATION_WORD_RE = re.compile(
    r"^(and|or|but|provided|provided that|including|subject to|unless|whereas|that)\b",
    re.IGNORECASE,
)
SIGNATURE_SPLIT_RE = re.compile(
    r"\b(client signature|freelancer signature|authorized signatory|in witness whereof|witness(?:es)?)\b",
    re.IGNORECASE,
)


def _normalize_for_split(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\xa0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _is_all_caps_heading(line: str) -> bool:
    words = line.split()
    if not words or len(words) > 12:
        return False
    return bool(ALL_CAPS_HEADING_RE.match(line)) and not line.endswith(".")


def _is_clause_start(line: str) -> bool:
    line = line.strip()
    if not line:
        return False
    if CLAUSE_START_RE.match(line):
        return True
    return _is_all_caps_heading(line)


def _clean_line(line: str) -> str:
    line = line.strip()
    line = re.sub(r"\s+", " ", line)
    return line


def _split_embedded_starts(paragraph: str) -> List[str]:
    """
    Split clauses when numbering appears mid-line (common in flattened PDF text).
    """
    parts = re.split(
        r"(?:(?<=^)|(?<=[.;:]))\s+(?=(?:Section\s+\d+(?:\.\d+)*|Article\s+[IVXLCM]+|\d+(?:\.\d+)*[\.\)]|\((?:[a-z]|\d{1,2}|[ivx]{1,4})\)|[a-zA-Z]\)|[IVXLCM]+\.))",
        paragraph,
        flags=re.IGNORECASE,
    )
    return [p.strip() for p in parts if p.strip()]


def _merge_short_fragments(chunks: List[str], min_len: int = 35) -> List[str]:
    merged: List[str] = []
    for chunk in chunks:
        chunk = chunk.strip()
        if not chunk:
            continue
        if len(chunk) < min_len and merged:
            merged[-1] = f"{merged[-1]} {chunk}".strip()
        else:
            merged.append(chunk)
    return merged


def _merge_heading_into_next(chunks: List[str], max_len: int = 30) -> List[str]:
    """
    Merge short structural headings into the following clause body.
    Example: "2. Services." + "2.1 Contractor shall..." -> combined clause.
    """
    merged: List[str] = []
    i = 0
    while i < len(chunks):
        current = chunks[i].strip()
        if not current:
            i += 1
            continue

        if i + 1 < len(chunks) and len(current) <= max_len and _is_clause_start(current):
            nxt = chunks[i + 1].strip()
            if nxt:
                merged.append(f"{current} {nxt}".strip())
                i += 2
                continue

        merged.append(current)
        i += 1

    return merged


def _split_preamble(chunks: List[str]) -> tuple[List[str], List[str]]:
    """Return (preamble_chunks, substantive_chunks)."""
    for idx, chunk in enumerate(chunks):
        if SUBSTANTIVE_CLAUSE_START_RE.match(chunk):
            return chunks[:idx], chunks[idx:]
    return [], chunks


def _split_signature_block(chunks: List[str], min_clause_len: int = 20) -> tuple[List[str], str]:
    """
    Split trailing signature block from clause chunks.
    Returns (cleaned_clauses, signature_block_text).
    """
    cleaned: List[str] = []
    signature_parts: List[str] = []
    signature_mode = False

    for chunk in chunks:
        current = chunk.strip()
        if not current:
            continue

        if signature_mode:
            signature_parts.append(current)
            continue

        match = SIGNATURE_SPLIT_RE.search(current)
        if match:
            before = current[: match.start()].strip()
            after = current[match.start() :].strip()

            if len(before) > min_clause_len:
                cleaned.append(before)
            if after:
                signature_parts.append(after)
            signature_mode = True
            continue

        if len(current) > min_clause_len:
            cleaned.append(current)

    signature_block = "\n".join(signature_parts).strip()
    return cleaned, signature_block


def _extract_clause_chunks(text: str) -> List[str]:
    """Extract raw clause-like chunks from normalized text."""
    normalized = _normalize_for_split(text)
    if not normalized:
        return []

    lines = [_clean_line(line) for line in normalized.split("\n")]
    clauses: List[str] = []
    current = ""

    for line in lines:
        if not line:
            if current:
                clauses.append(current.strip())
                current = ""
            continue

        if PAGE_NOISE_RE.match(line):
            continue

        if not current:
            current = line
            continue

        # Start a new clause when we detect explicit legal structure.
        if _is_clause_start(line):
            clauses.append(current.strip())
            current = line
            continue

        # Otherwise, treat line as a wrapped continuation.
        if current.endswith("-"):
            current = f"{current[:-1]}{line.lstrip()}"
        elif current.endswith((",", ";", ":", "(")) or CONTINUATION_WORD_RE.match(line):
            current = f"{current} {line}"
        else:
            current = f"{current} {line}"

    if current:
        clauses.append(current.strip())

    expanded: List[str] = []
    for clause in clauses:
        expanded.extend(_split_embedded_starts(clause))

    return _merge_heading_into_next(expanded, max_len=30)


def split_into_clauses_with_sections(text: str) -> Dict[str, object]:
    """
    Return document sections for auditing while keeping scoring clauses clean.

    Output keys:
      - preamble: text before first substantive clause (if any)
      - clauses: list of substantive clauses for model scoring
      - signature_block: trailing signature/sign-off text (if any)
    """
    chunks = _extract_clause_chunks(text)
    if not chunks:
        return {"preamble": "", "clauses": [], "signature_block": ""}

    preamble_chunks, substantive_chunks = _split_preamble(chunks)
    merged = _merge_short_fragments(substantive_chunks, min_len=35)
    cleaned_clauses, signature_block = _split_signature_block(merged, min_clause_len=20)

    preamble = "\n".join(preamble_chunks).strip()
    return {
        "preamble": preamble,
        "clauses": cleaned_clauses,
        "signature_block": signature_block,
    }


def split_into_clauses(text: str) -> list:
    """
    Contract-aware clause splitting.
    Prioritizes legal structure markers (sections, numbering, headings)
    and treats wrapped lines as clause continuations.
    """
    sections = split_into_clauses_with_sections(text)
    return list(sections["clauses"])