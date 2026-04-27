# Program Flow

This document gives a simple end-to-end view of how TiwalaChain works across the frontend, backend, AI service, and blockchain contract.

## 1. Startup Flow

### Frontend
- Next.js starts the web application.
- Users connect a wallet and interact with UI pages and forms.
- Frontend library files send requests to the backend and prepare blockchain calls.

### Backend
- ASP.NET Core loads environment variables and configuration.
- CORS, JWT auth, caching, rate limiting, and database access are configured.
- EF Core migrations are applied on startup.
- Controllers expose REST endpoints for the frontend.

### AI Service
- FastAPI starts and loads the fine-tuned LegalBERT model.
- The service exposes endpoints for text and file-based contract review.

### Blockchain
- The escrow contract is already deployed or deployed separately through Foundry.
- The frontend uses the contract ABI and address to call job lifecycle methods.

## 2. User and Offer Flow

### Employer side
1. Employer signs in with wallet-based authentication.
2. Employer creates a posting or directly creates an offer.
3. Backend validates input and stores job or posting data.
4. Backend creates notifications for affected users.

### Freelancer side
1. Freelancer browses postings or receives an offer.
2. Freelancer submits a proposal or accepts/declines an offer.
3. Backend checks permissions and current status before updating records.

## 3. Contract Review Flow

There are two related paths: verification and AI fairness review.

### A. Contract verification
1. A contract file is uploaded or a contract hash is provided.
2. Backend validates file size and extension.
3. Backend computes SHA-256 when a file is uploaded.
4. Backend compares uploaded hash and claimed hash if both exist.
5. Backend looks up the job record by contract hash.
6. Backend returns either `Verified`, `Mismatch`, or `NotFound`.

### B. AI contract fairness review
1. Frontend or public page sends contract text to the backend or AI service path.
2. AI service splits the text into clauses.
3. Each clause is classified as fair or unfair.
4. Rule-based explanations and suggestions are attached.
5. LLM fallback may refine borderline results.
6. The final score and per-clause notes are returned to the caller.

## 4. Escrow Job Flow

This is the main business flow of the platform.

1. Employer and freelancer agree on terms.
2. Backend stores the related job record, including contract hash.
3. Employer creates the escrow job on-chain with:
   - freelancer address
   - payment amount
   - contract hash
4. Employer deposits funds into escrow.
5. Employer marks work as started.
6. Freelancer submits work on-chain after completing the job flow.
7. Employer either:
   - releases payment, or
   - raises a dispute
8. If disputed, moderator resolves the dispute by paying the freelancer or refunding the employer.

## 5. Deliverables and File Flow

1. Freelancer uploads deliverables through the app.
2. Backend stores file metadata and uploads file content to S3-compatible storage.
3. Authorized users can later download those files.
4. Job and deliverable records stay linked through backend database models.

## 6. Notification Flow

1. A service method performs a business action.
2. The backend creates a notification record for the affected wallet.
3. Frontend reads notification data and shows it in the UI.

## 7. Public Services Flow

The project also exposes public-facing tools.

### Public postings
- Visitors can browse approved/public job postings without entering the full private workflow.

### Public contract verification
- Visitors can verify if a contract hash exists in TiwalaChain records.

### Public AI review
- Visitors can submit contract text for a fairness review, with stricter rate limits.

## 8. High-Level Data Flow

`Frontend -> Backend API -> Database / Storage / AI Service`

and for escrow actions:

`Frontend wallet client -> Smart contract on Sepolia`

The backend stores the off-chain business record, while the blockchain stores the escrow state and fund custody.

## 9. Failure Handling Flow

Some important guardrails already in the code:

- invalid requests return validation errors
- unauthorized users are blocked by JWT and policy checks
- public endpoints use rate limiting
- backend catches unhandled exceptions and returns a safe error response
- AI timeouts and upstream failures return fallback error messages
- contract actions enforce valid state transitions on-chain
