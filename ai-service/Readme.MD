# TiwalaChain AI Service

> Contract fairness evaluation microservice powered by fine-tuned LegalBERT and Groq LLM.

This service is part of the [TiwalaChain](https://github.com/rustumsk/Tiwala-Chain) platform. It accepts freelance contract text or documents, analyzes each clause for fairness, and returns AI-generated suggestions for unfair terms.

---

## What it does

1. **Accepts** contract text, PDF, or DOCX as input
2. **Extracts** individual clauses from the document
3. **Classifies** each clause as `fair` or `unfair` using a fine-tuned LegalBERT model
4. **Generates** actionable revision suggestions for unfair clauses via Groq LLM
5. **Returns** a structured JSON response with a fairness score

---

## Tech Stack

| Component | Technology |
|---|---|
| API Framework | FastAPI |
| Base Model | `nlpaueb/legal-bert-base-uncased` |
| Fine-tuning | HuggingFace Transformers + Trainer API |
| Suggestions | Rule-based templates |
| PDF Extraction | pdfplumber |
| DOCX Extraction | python-docx |
| Dataset | Custom curated freelance contract clauses |

---

## Project Structure

```
ai-service/
├── dataset/
│   └── Tiwalachain-finetune-dataset.csv   # labeled contract clauses
├── fine_tuned_model/                       # generated locally, not committed
├── main.py                                 # FastAPI app and endpoints
├── model.py                                # model loading and inference
├── extractor.py                            # PDF/DOCX to text + clause splitting
├── train.py                                # fine-tuning script
└── requirements.txt
```

---

## Setup

### 1. Create virtual environment

```bash
cd ai-service
python -m venv venv
venv\Scripts\activate        # Windows
source venv/bin/activate     # Mac/Linux
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Train the model

```bash
python train.py
```

This fine-tunes LegalBERT on the curated dataset and saves the model to `./fine_tuned_model`. Training takes ~2 minutes on CPU.

### 4. Run the service

```bash
python main.py
```

Service runs at `http://localhost:8000`

---

## API Endpoints

### `GET /health`
Check if the service is running.

```json
{ "status": "ok", "model": "legal-bert-finetuned" }
```

---

### `POST /evaluate/text`
Evaluate contract fairness from plain text.

**Request:**
```json
{
  "text": "Client may request additional features at any time without adjusting total compensation. Revisions are limited to 3 rounds per milestone."
}
```

**Response:**
```json
{
  "total_clauses": 2,
  "unfair_count": 1,
  "fair_count": 1,
  "fairness_score": 0.5,
  "clauses": [
    {
      "clause": "Client may request additional features at any time without adjusting total compensation.",
      "label": "unfair",
      "confidence": 0.73,
      "suggestion": "Consider specifying that any additional features outside the original scope require a revised quote and written agreement from both parties."
    },
    {
      "clause": "Revisions are limited to 3 rounds per milestone.",
      "label": "fair",
      "confidence": 0.86,
      "suggestion": "This clause appears balanced and fair."
    }
  ]
}
```

---

### `POST /evaluate/file`
Evaluate contract fairness from uploaded PDF or DOCX.

**Request:** `multipart/form-data` with a `file` field.

**Supported formats:** `.pdf`, `.docx`

**Response:** Same structure as `/evaluate/text`

---

## Dataset

The model is fine-tuned on a custom dataset of freelance contract clauses covering:

- Payment terms
- Project scope
- IP and ownership rights
- Termination conditions
- Revision policies
- Confidentiality
- Dispute resolution
- Availability requirements
- Liability
- Penalties

**Current dataset size:** 205 unique labeled clauses  
**Model accuracy:** ~80% on test split  
**Label distribution:** Balanced (50% fair, 50% unfair)

To improve accuracy, add more labeled clauses to the dataset CSV and retrain.

---

## Interactive Docs

FastAPI auto-generates Swagger UI at:

```
http://localhost:8000/docs
```

Test both endpoints directly from your browser without any frontend.

---

## Notes

- The `fine_tuned_model/` directory is excluded from version control (.gitignore)
- Run `python train.py` after cloning to regenerate the model locally
- Model performance improves as the dataset grows — current limitations are due to dataset size, not model architecture