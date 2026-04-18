# TiwalaChain AI Service

The AI service is a FastAPI microservice that evaluates contract fairness from plain text, PDF, and DOCX inputs. The backend calls this service when users upload or review contract documents.

## Stack

- FastAPI
- Uvicorn
- Hugging Face Transformers
- pdfplumber for PDF extraction
- python-docx for DOCX extraction
- scikit-learn, datasets, pandas, accelerate

## Project Layout

```text
ai-service/
|-- main.py              FastAPI application and HTTP endpoints
|-- model.py             Model loading and clause classification
|-- extractor.py         PDF/DOCX text extraction and clause splitting helpers
|-- llm_suggestions.py   Optional LLM-powered rewrite suggestions
|-- train.py             Training entry point
|-- requirements.txt     Python dependencies
|-- .env.example         Environment template
|-- dataset/             Training/evaluation data
|-- sample_documents/    Local test documents
|-- integration_tests/   Service integration tests
`-- Dockerfile           Container image
```

## Endpoints

- `GET /` - service status
- `GET /health` - health and model path
- `POST /evaluate/text` - evaluate plain text
- `POST /evaluate/file` - evaluate uploaded PDF or DOCX
- `POST /debug/ask-llm` - optional LLM debug endpoint

## Environment

Copy `.env.example` to `.env` for local use:

```powershell
copy .env.example .env
```

Important variables:

```text
APP_ENV=local
AI_HOST=0.0.0.0
AI_PORT=8000
AI_RELOAD=1
AI_CORS_ALLOWED_ORIGINS=*
MODEL_PATH=rustumsk/tiwala-bert
AI_MAX_FILE_BYTES=3145728
AI_MAX_EXTRACTED_CHARS=60000
AI_MAX_CLAUSES=40
LLM_SUGGESTIONS_ENABLED=0
```

If the model is private, set `HF_TOKEN`.

## Local Development

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python main.py
```

The service runs on `http://localhost:8000` by default.

## Example Requests

Evaluate plain text:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:8000/evaluate/text `
  -ContentType "application/json" `
  -Body '{"text":"The freelancer must provide unlimited revisions without extra pay."}'
```

Health check:

```powershell
Invoke-RestMethod http://localhost:8000/health
```

## Training

```powershell
python train.py
```

Training outputs and checkpoints are written to model output folders. Keep large generated artifacts out of source control unless they are intentionally versioned.

## Backend Integration

The ASP.NET Core backend calls this service through the `AiService` HTTP client. Configure the backend with:

```text
AiService__BaseUrl=http://localhost:8000/
AiService__TimeoutSeconds=120
```
