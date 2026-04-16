import io
import re
from typing import Dict, List
import pdfplumber
from docx import Document


def extract_text(file_bytes: bytes, filename: str) -> str:
    if filename.endswith(".pdf"):
        return extract_from_pdf(file_bytes)
    elif filename.endswith(".docx"):
        return extract_from_docx(file_bytes)
    else:
        raise ValueError("Unsupported file type. Only PDF and DOCX are supported.")


def extract_from_pdf(file_bytes: bytes) -> str:
    text = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            # Filter out headers/footers by only keeping text in the main body bbox.
            # Strategy: crop away the top ~8% and bottom ~8% of each page where
            # running headers and page numbers typically live.
            w = float(page.width)
            h = float(page.height)
            margin_v = h * 0.08
            body = page.within_bbox((0, margin_v, w, h - margin_v))
            page_text = body.extract_text()
            if page_text:
                text.append(page_text)
    return "\n".join(text)


def extract_from_docx(file_bytes: bytes) -> str:
    doc = Document(io.BytesIO(file_bytes))
    text = []
    for paragraph in doc.paragraphs:
        if paragraph.text.strip():
            text.append(paragraph.text.strip())
    return "\n".join(text)


# ---------------------------------------------------------------------------
# Structural markers
# ---------------------------------------------------------------------------

# Top-level clause starters: Section N, Article X, numbered "1." / "1.1." etc.,
# roman numerals at the top level (I., II., …).
#
# INTENTIONALLY EXCLUDED from this regex:
#   • (a) / (b) / (i) / (ii) — parenthesised lettered/roman sub-items
#   • a) / b)                  — unparenthesised lettered sub-items
# These are treated as line continuations so they don't produce
# tiny, unclassifiable fragment clauses.
CLAUSE_START_RE = re.compile(
    r"""^(
        Section\s+\d+(?:\.\d+)*[\.:]?\s+|
        Article\s+[IVXLCM]+[\.:]?\s+|
        \d+(?:\.\d+)*[\.\)]\s+|
        [IVXLCM]+\.\s+
    )""",
    re.IGNORECASE | re.VERBOSE,
)

# Subset used to detect where the preamble ends and substantive clauses begin.
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

# Sentence-boundary regex: period followed by whitespace then an uppercase letter
# or an opening bracket/quote — characteristic of a new legal sentence.
# We use a lookbehind that requires the character before the period to be a
# lowercase letter, digit, closing paren, or closing quote so that we avoid
# splitting on numeric "1." prefixes or all-caps abbreviation endings.
_SENTENCE_BREAK_RE = re.compile(r'(?<=[a-z\d\)"\u2019])\.\s+(?=[A-Z\(\"])')

# Dense-paragraph threshold: chunks longer than this will undergo secondary
# sentence-boundary splitting.
_DENSE_THRESHOLD = 600

# Target size for sentence-grouped sub-chunks after secondary splitting.
_SENTENCE_CHUNK_TARGET = 400


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
    Split clauses when TOP-LEVEL numbering (Section/Article/numeric) appears
    mid-line — common in flattened PDF text.
    Sub-items like (a)/(b)/(i) are deliberately excluded to prevent over-splitting.
    """
    parts = re.split(
        r"(?:(?<=^)|(?<=[.;:]))\s+(?=(?:Section\s+\d+(?:\.\d+)*|Article\s+[IVXLCM]+|\d+(?:\.\d+)*[\.\)]))",
        paragraph,
        flags=re.IGNORECASE,
    )
    return [p.strip() for p in parts if p.strip()]


def _secondary_split(text: str) -> List[str]:
    """
    Break a dense paragraph at sentence boundaries into sub-chunks of
    approximately _SENTENCE_CHUNK_TARGET characters.

    Algorithm: scan sentence-break positions; whenever accumulated length
    since the last cut exceeds the target, cut at the current boundary.
    This preserves complete sentences rather than cutting mid-sentence.
    """
    if len(text) <= _DENSE_THRESHOLD:
        return [text]

    # Collect the positions where a new sentence starts (end of the match).
    break_positions = [m.end() for m in _SENTENCE_BREAK_RE.finditer(text)]
    if not break_positions:
        return [text]

    chunks: List[str] = []
    start = 0
    for bp in break_positions:
        if bp - start >= _SENTENCE_CHUNK_TARGET:
            chunk = text[start:bp].rstrip()
            if chunk:
                chunks.append(chunk)
            start = bp

    tail = text[start:].strip()
    if tail:
        chunks.append(tail)

    # If splitting produced nothing useful, return the original.
    return [c for c in chunks if c] or [text]


def _merge_short_fragments(chunks: List[str], min_len: int = 100) -> List[str]:
    """Merge fragments shorter than min_len characters into the previous chunk."""
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


def _merge_heading_into_next(chunks: List[str], max_len: int = 50) -> List[str]:
    """
    Merge short structural headings into the following clause body.
    Example: "2. Services." merged with "2.1 Contractor shall…"
    Raised max_len from 30 → 50 to also catch slightly longer heading lines.
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
    """Split trailing signature block from clause chunks."""
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
    """
    Extract raw clause-like chunks from normalized text.

    Pipeline:
      1. Structural split on numbered/titled markers (sub-items excluded).
      2. Re-split any embedded marker runs on the same line.
      3. Merge short structural headings into the following body.
      4. Secondary sentence-boundary split on remaining dense chunks (> 600 chars).
      5. Merge residual short fragments (< 100 chars).
    """
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

        if _is_clause_start(line):
            clauses.append(current.strip())
            current = line
            continue

        # Continuation: join hyphen-split words, then append.
        if current.endswith("-"):
            current = f"{current[:-1]}{line.lstrip()}"
        else:
            current = f"{current} {line}"

    if current:
        clauses.append(current.strip())

    # Re-split flattened embedded clause starts (top-level only).
    expanded: List[str] = []
    for clause in clauses:
        expanded.extend(_split_embedded_starts(clause))

    # Merge lone short headings into their following body.
    headed = _merge_heading_into_next(expanded, max_len=50)

    # Secondary sentence-boundary split for dense paragraphs.
    sentence_split: List[str] = []
    for chunk in headed:
        sentence_split.extend(_secondary_split(chunk))

    return sentence_split


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
    merged = _merge_short_fragments(substantive_chunks, min_len=100)
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
    and treats wrapped lines and sub-items as clause continuations.
    """
    sections = split_into_clauses_with_sections(text)
    return list(sections["clauses"])
