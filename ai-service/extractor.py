import io
import re
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


def split_into_clauses(text: str) -> list:
    """
    Split contract text into individual clauses.
    Splits on sentence boundaries and numbered clauses.
    """
    # Normalize whitespace
    text = re.sub(r'\s+', ' ', text).strip()

    # Split on sentence endings or numbered list patterns
    raw_clauses = re.split(
        r'(?<=[.!?])\s+(?=[A-Z0-9])|(?=\n?\d+[\.\)]\s)|(?<=\.)\s{2,}',
        text
    )

    clauses = []
    for clause in raw_clauses:
        clause = clause.strip()
        # Filter out very short or irrelevant lines
        if len(clause) > 20:
            clauses.append(clause)

    return clauses