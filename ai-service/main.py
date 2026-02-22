from fastapi import FastAPI, File, UploadFile, HTTPException
from pydantic import BaseModel
from typing import List
import uvicorn

from model import load_model, analyze_clauses
from extractor import extract_text, split_into_clauses
from llm_suggestions import ask_llm_question

app = FastAPI(
    title="TiwalaChain AI Service",
    description="Contract fairness evaluation using fine-tuned LegalBERT",
    version="1.0.0"
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
    suggestion: str
    suggestion_source: str = "rule"

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
    return {"status": "ok", "model": "legal-bert-finetuned"}


@app.post("/evaluate/text", response_model=EvaluationResponse)
def evaluate_text(request: TextRequest):
    """
    Evaluate contract fairness from plain text input.
    """
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty.")

    clauses = split_into_clauses(request.text)

    if not clauses:
        raise HTTPException(status_code=400, detail="No clauses could be extracted from the text.")

    results = analyze_clauses(classifier, clauses)
    return build_response(results)


@app.post("/evaluate/file", response_model=EvaluationResponse)
async def evaluate_file(file: UploadFile = File(...)):
    """
    Evaluate contract fairness from uploaded PDF or DOCX file.
    """
    filename = file.filename.lower()

    if not (filename.endswith(".pdf") or filename.endswith(".docx")):
        raise HTTPException(status_code=400, detail="Only PDF and DOCX files are supported.")

    contents = await file.read()

    try:
        text = extract_text(contents, filename)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to extract text: {str(e)}")

    if not text.strip():
        raise HTTPException(status_code=400, detail="Could not extract any text from the file.")

    clauses = split_into_clauses(text)

    if not clauses:
        raise HTTPException(status_code=400, detail="No clauses could be extracted from the document.")

    results = analyze_clauses(classifier, clauses)
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
            suggestion=r["suggestion"],
            suggestion_source=r.get("suggestion_source", "rule")
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
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)