# TiwalaChain 🔗

> A Blockchain-Based Freelancing Platform with AI-Assisted Contract Fairness and Escrow Payment System

Built as a thesis project for the Bachelor of Science in Computer Science at the University of Cebu.

---

## What is TiwalaChain?

**Tiwala** (Filipino for *trust*) — because that's exactly what's broken in freelancing today.

TiwalaChain tackles the core problems of online freelance work: delayed payments, vague contracts, and biased dispute handling. It does this by combining blockchain-based escrow, AI-powered contract fairness evaluation, and transparent smart contract enforcement — so neither freelancers nor employers have to just *hope* the other party plays fair.

---

## Core Features

- **Escrow Payment System** — Funds are locked in a smart contract and only released when conditions are met. No platform middleman holding your money.
- **AI Contract Fairness Evaluator** — NLP analysis (RoBERTa-based) scans contract terms and flags imbalanced, vague, or risky clauses before you sign.
- **Smart Contract Lifecycle** — Every job follows a strict on-chain state machine: `Created → Funded → InProgress → Submitted → Completed / Disputed`
- **Moderator Dispute Resolution** — Disputed jobs are escalated to a designated moderator who can trigger release or refund on-chain.
- **SHA-256 Contract Hashing** — Every contract document is hashed and stored on-chain. Any tampering is immediately detectable.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js + Tailwind CSS |
| Backend | ASP.NET Core (C#) |
| AI Service | FastAPI (Python) + HuggingFace Transformers |
| Blockchain | Solidity + Foundry |
| Database | PostgreSQL |
| Testnet | Sepolia |

---

## Project Structure

```
tiwalachain/
├── frontend/        # Next.js — UI for employers and freelancers
├── backend/         # ASP.NET Core — main API, auth, business logic
├── ai-service/      # FastAPI — contract fairness evaluation microservice
├── blockchain/      # Solidity + Foundry — escrow smart contracts
└── README.md
```

---

## Smart Contract Design

One deployed contract manages all escrow jobs via a mapping — no factory pattern, no per-job deployments.

```solidity
enum JobStatus {
    Created,
    Funded,
    InProgress,
    Submitted,
    Disputed,
    Completed,
    Refunded
}

struct EscrowJob {
    address employer;
    address freelancer;
    uint256 amount;
    JobStatus status;
}

mapping(uint256 => EscrowJob) public jobs;
```

**Core functions:** `deposit()` `release()` `refund()` `dispute()` `resolve()`

---

## AI Fairness Service

The AI microservice accepts contract text and returns a fairness analysis:

- **RoBERTa-based semantic analysis** — detects imbalanced or exploitative clauses
- **Heuristic rule-based validator** — cross-references terms against fairness standards
- Runs as a standalone FastAPI service called by the ASP.NET backend

---

## Getting Started

### Prerequisites
- Node.js 18+
- .NET 8 SDK
- Python 3.10+
- Foundry (`curl -L https://foundry.paradigm.xyz | bash`)
- PostgreSQL

### Setup

```bash
# Clone the repo
git clone https://github.com/yourusername/tiwalachain.git
cd tiwalachain

# Blockchain
cd blockchain
forge install
forge build

# Backend
cd ../backend
dotnet restore
dotnet run

# AI Service
cd ../ai-service
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend
cd ../frontend
npm install
npm run dev
```

---

## Roadmap

- [x] Project architecture defined
- [x] Smart contract design finalized
- [ ] Escrow contract deployed on Sepolia testnet
- [ ] ASP.NET Core API — auth + contract endpoints
- [ ] AI fairness microservice (FastAPI + HuggingFace)
- [ ] Frontend — job posting, contract creation, escrow dashboard
- [ ] Full integration + system testing
- [ ] User acceptance testing (50 respondents)

---

## Research Context

**Institution:** University of Cebu, College of Computer Studies

**Degree:** BS Computer Science

**Researchers:**
- Arellano, Rustum Domingo Jr. D.
- Gutierrez, Miguel Joaquin P.
- Pilapil, Harvey Jay T.
- Pilapil, Shannen Mae T.

**Adviser:** Christian Barral

---

## License

For academic use only.
