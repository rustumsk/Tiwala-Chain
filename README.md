# TiwalaChain

TiwalaChain is a blockchain-based freelancing platform for managing job offers, contract review, escrow funding, deliverables, disputes, and payment release. It combines a Next.js app, an ASP.NET Core API, a FastAPI contract fairness service, and Solidity smart contracts on Sepolia.

The name "Tiwala" means "trust" in Filipino. The project is built around the trust problems common in freelance work: unclear contracts, delayed payments, weak proof of delivery, and opaque dispute handling.

## What It Does

- Creates job postings and freelancer proposals.
- Converts selected proposals into formal job offers.
- Uploads and verifies contract documents with SHA-256 hashes.
- Evaluates contract fairness with an AI service.
- Creates escrow jobs on-chain and tracks lifecycle events.
- Lets employers fund escrow, start work, release payment, refund, or raise disputes.
- Lets freelancers accept offers, submit deliverables, submit work on-chain, and raise disputes.
- Gives moderators dispute visibility and on-chain resolution controls.
- Shows notifications and blockchain transaction logs inside the app, with Etherscan links.

## Repository Layout

```text
Tiwala-Chain/
|-- frontend/              Next.js client application wrapper
|   `-- tiwala-frontend/   Main web app
|-- backend/               ASP.NET Core API wrapper
|   `-- TiwalaChain.API/   Main API, EF Core models, migrations, controllers
|-- ai-service/            FastAPI service for contract fairness evaluation
|-- blockchain/            Solidity/Foundry wrapper
|   `-- tiwala_chain/      Escrow and mock token contracts
|-- docs/                  Product and implementation notes
|-- lib/                   Foundry dependency checkout
|-- foundry.lock           Foundry dependency lockfile
`-- README.md
```

Generated and local-only folders such as `.next/`, `node_modules/`, `bin/`, `obj/`, `.tmp_build/`, `.tmp_pdf_pages/`, and `.vs/` are not part of the core source.

## Tech Stack

| Area | Technology |
| --- | --- |
| Web app | Next.js 16, React 19, Tailwind CSS, wagmi, viem, RainbowKit |
| API | ASP.NET Core on .NET 10, EF Core, PostgreSQL, JWT auth |
| AI | FastAPI, Hugging Face Transformers, document extraction for PDF/DOCX |
| Blockchain | Solidity, Foundry, Sepolia testnet |
| Storage | S3-compatible object storage for contract and deliverable files |

## Local Development

Run each service in its own terminal.

### 1. Backend API

```powershell
cd backend/TiwalaChain.API
dotnet restore
dotnet ef database update
dotnet run
```

The frontend expects the API at `http://localhost:5067` by default.

### 2. AI Service

```powershell
cd ai-service
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python main.py
```

The backend expects the AI service at `http://localhost:8000/` in local development.

### 3. Frontend

```powershell
cd frontend/tiwala-frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

### 4. Blockchain

```powershell
cd blockchain/tiwala_chain
forge build
forge test
```

The frontend currently points to a deployed Sepolia escrow contract in `frontend/tiwala-frontend/src/lib/contract.ts`.

## Configuration

Each runnable project has its own environment file or appsettings:

- Frontend: `frontend/tiwala-frontend/.env`
- Backend: `backend/TiwalaChain.API/.env` and `appsettings.json`
- AI service: `ai-service/.env` or `ai-service/.env.example`

Do not commit real secrets. Use local `.env` files for database credentials, JWT keys, storage credentials, WalletConnect IDs, API URLs, and optional LLM provider keys.

## Key Workflows

1. Employer creates a public posting or direct job offer.
2. Freelancer submits a proposal or receives an offer.
3. Employer converts a selected proposal to a formal offer.
4. Freelancer accepts the offer.
5. Employer creates/funds the on-chain escrow job.
6. Employer starts work after funding.
7. Freelancer submits deliverables off-chain and submits work on-chain after approval.
8. Employer releases payment or either party raises a dispute.
9. Moderator resolves disputed jobs on-chain.

## Verification Commands

```powershell
# Frontend type check
cd frontend/tiwala-frontend
npx tsc --noEmit --pretty false

# Frontend lint
npm run lint

# Backend build
cd ../../backend/TiwalaChain.API
dotnet build

# Blockchain tests
cd ../../blockchain/tiwala_chain
forge test
```

## Notes

- The current escrow contract emits events for creation, funding, submission, release, refund, and disputes. It does not emit a `WorkStarted` event, so the in-app blockchain transaction log cannot show that lifecycle step unless the contract is upgraded or redeployed with that event.
- The app reads blockchain transaction logs from Sepolia RPC in block chunks to avoid provider `eth_getLogs` range limits.
- Account approval and deletion rules are enforced by the backend.

## Academic Context

This repository supports a thesis project for the Bachelor of Science in Computer Science at the University of Cebu.

Researchers:

- Arellano, Rustum Domingo Jr. D.
- Gutierrez, Miguel Joaquin P.
- Pilapil, Harvey Jay T.
- Pilapil, Shannen Mae T.

Adviser: Christian Barral

## License

Academic use only unless a separate license is added.
