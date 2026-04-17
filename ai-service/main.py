from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
import os
import time
from pathlib import Path

try:
    from dotenv import load_dotenv
except Exception:  # pragma: no cover
    load_dotenv = None

from model import load_model, analyze_clauses, get_model_path
from extractor import extract_text, split_into_clauses
from llm_suggestions import ask_llm_question

MAX_FILE_BYTES = int(os.getenv("AI_MAX_FILE_BYTES", str(3 * 1024 * 1024)))
MAX_EXTRACTED_CHARS = int(os.getenv("AI_MAX_EXTRACTED_CHARS", "60000"))
MAX_CLAUSES = int(os.getenv("AI_MAX_CLAUSES", "40"))


def _load_local_env() -> None:
    env_path = Path(__file__).resolve().parent / ".env"
    if not env_path.exists() or load_dotenv is None:
        return
    load_dotenv(dotenv_path=env_path, override=False)


_load_local_env()

APP_ENV = os.getenv("APP_ENV", "local").strip().lower()
IS_LOCAL = APP_ENV in {"local", "development", "dev"}

cors_origins_raw = os.getenv("AI_CORS_ALLOWED_ORIGINS")
if cors_origins_raw:
    AI_CORS_ALLOWED_ORIGINS = [o.strip() for o in cors_origins_raw.split(",") if o.strip()]
elif IS_LOCAL:
    AI_CORS_ALLOWED_ORIGINS = ["*"]
else:
    raise RuntimeError("Missing required env: AI_CORS_ALLOWED_ORIGINS")

app = FastAPI(
    title="TiwalaChain AI Service",
    description="Contract fairness evaluation using fine-tuned LegalBERT",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=AI_CORS_ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

print("Loading fine-tuned model...")
classifier = load_model()
print("Model ready.")

class TextRequest(BaseModel):
    text: str

class ClauseResult(BaseModel):
    clause: str
    label: str
    confidence: float
    reason: Optional[str] = None
    suggestion: str
    suggestion_source: str = "rule"
    issue: Optional[str] = None

class EvaluationResponse(BaseModel):
    total_clauses: int
    unfair_count: int
    fair_count: int
    fairness_score: float   
    clauses: List[ClauseResult]


class LlmQuestionRequest(BaseModel):
    question: str


class LlmQuestionResponse(BaseModel):
    success: bool
    provider: str
    model: str
    content: str
    error: str


@app.get("/")
def root():
    return {"status": "TiwalaChain AI Service is running"}


@app.get("/health")
def health():
    return {"status": "ok", "model": "legal-bert-finetuned", "model_path": get_model_path()}


@app.post("/evaluate/text", response_model=EvaluationResponse)
def evaluate_text(request: TextRequest):
    """
    Evaluate contract fairness from plain text input.
    """
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty.")

    started_at = time.monotonic()
    clauses = split_into_clauses(request.text[:MAX_EXTRACTED_CHARS])
    print(f"[evaluate/text] clauses={len(clauses)} split_seconds={time.monotonic() - started_at:.2f}", flush=True)

    if not clauses:
        raise HTTPException(status_code=400, detail="No clauses could be extracted from the text.")

    results = analyze_clauses(classifier, clauses[:MAX_CLAUSES])
    print(f"[evaluate/text] total_seconds={time.monotonic() - started_at:.2f}", flush=True)
    return build_response(results)


@app.post("/evaluate/file", response_model=EvaluationResponse)
async def evaluate_file(file: UploadFile = File(...)):
    """
    Evaluate contract fairness from uploaded PDF or DOCX file.
    """
    filename = file.filename.lower()

    if not (filename.endswith(".pdf") or filename.endswith(".docx")):
        raise HTTPException(status_code=400, detail="Only PDF and DOCX files are supported.")

    started_at = time.monotonic()
    contents = await file.read()
    if len(contents) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail=f"File must be {MAX_FILE_BYTES} bytes or smaller.")
    print(f"[evaluate/file] filename={filename} bytes={len(contents)}", flush=True)

    try:
        text = extract_text(contents, filename)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to extract text: {str(e)}")
    print(f"[evaluate/file] extracted_chars={len(text)} extract_seconds={time.monotonic() - started_at:.2f}", flush=True)

    if not text.strip():
        raise HTTPException(status_code=400, detail="Could not extract any text from the file.")

    clauses = split_into_clauses(text[:MAX_EXTRACTED_CHARS])
    print(f"[evaluate/file] clauses={len(clauses)} split_seconds={time.monotonic() - started_at:.2f}", flush=True)

    if not clauses:
        raise HTTPException(status_code=400, detail="No clauses could be extracted from the document.")

    results = analyze_clauses(classifier, clauses[:MAX_CLAUSES])
    print(f"[evaluate/file] analyzed_clauses={len(results)} total_seconds={time.monotonic() - started_at:.2f}", flush=True)
    return build_response(results)


@app.post("/debug/ask-llm", response_model=LlmQuestionResponse)
def debug_ask_llm(request: LlmQuestionRequest):
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    result = ask_llm_question(request.question.strip())
    return LlmQuestionResponse(**result)

def build_response(results: List[dict]) -> EvaluationResponse:
    total = len(results)
    unfair_count = sum(1 for r in results if r["label"] == "unfair")
    fair_count = total - unfair_count
    fairness_score = round(fair_count / total, 2) if total > 0 else 1.0

    clauses = [
        ClauseResult(
            clause=r["clause"],
            label=r["label"],
            confidence=r["confidence"],
            reason=r.get("reason"),
            suggestion=r["suggestion"],
            suggestion_source=r.get("suggestion_source", "rule"),
            issue=r.get("issue"),
        )
        for r in results
    ]

    return EvaluationResponse(
        total_clauses=total,
        unfair_count=unfair_count,
        fair_count=fair_count,
        fairness_score=fairness_score,
        clauses=clauses
    )


if __name__ == "__main__":
    host = os.getenv("AI_HOST", "0.0.0.0" if IS_LOCAL else "").strip()
    port_raw = os.getenv("PORT") or os.getenv("AI_PORT", "8000" if IS_LOCAL else "")
    port_raw = port_raw.strip()
    reload_flag = os.getenv("AI_RELOAD", "1" if IS_LOCAL else "0").strip().lower() in {"1", "true", "yes", "on"}

    if not host:
        raise RuntimeError("Missing required env: AI_HOST")
    if not port_raw:
        raise RuntimeError("Missing required env: AI_PORT")

    uvicorn.run("main:app", host=host, port=int(port_raw), reload=reload_flag)
