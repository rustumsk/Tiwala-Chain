# TiwalaChain Frontend — Cursor Prompt

## Project Overview
Build the frontend for **TiwalaChain** — a blockchain-based freelancing platform for Filipino freelancers and employers. The platform uses smart contract escrow for payment protection and AI-powered contract fairness evaluation.

**Tagline:** *Tiwala* means trust in Filipino. This platform rebuilds trust between freelancers and employers through blockchain transparency.

---

## Tech Stack
- **Framework:** Next.js 14 (App Router)
- **Styling:** Tailwind CSS
- **Wallet Connection:** RainbowKit + Wagmi + Viem
- **Blockchain Interaction:** Ethers.js
- **HTTP Client:** Axios (for backend and AI service calls)
- **Language:** TypeScript

---

## Design Direction
- **Theme:** Dark, professional, Web3-native
- **Aesthetic:** Clean and trustworthy — think linear.app meets a DeFi dashboard. NOT purple gradients, NOT generic crypto bro aesthetics
- **Colors:** Deep navy/slate background, sharp cyan or teal accents, white text
- **Typography:** Distinctive font pairing — something like Syne or Cabinet Grotesk for headings, DM Sans or Instrument Sans for body
- **Feel:** Serious, Filipino-context, professional freelancing tool with blockchain underneath — not a meme coin site

---

## Smart Contract Details
```
TiwalaEscrow Address: 0x09dA619E3D4d38c4EbbdE188862A765442Ac9800
USDT Token (Sepolia): 0x7169D38820dfd117C3FA1f22a697dBA58d90BA06
Network: Sepolia Testnet (chainId: 11155111)
```

### Job Status Enum (from contract)
```
0 = Created
1 = Funded
2 = InProgress
3 = Submitted
4 = Disputed
5 = Completed
6 = Refunded
```

### Contract Functions
```typescript
createJob(freelancer: address, amount: uint256, contractHash: bytes32)
depositFunds(jobId: uint256)
startWork(jobId: uint256)
submitWork(jobId: uint256)
releasePayment(jobId: uint256)
raiseDispute(jobId: uint256)
resolveDispute(jobId: uint256, releaseToFreelancer: bool)
refund(jobId: uint256)
getJob(jobId: uint256)
getEmployerJobs(employer: address)
getFreelancerJobs(freelancer: address)
```

---

## Pages to Build

### 1. `/` — Landing Page
- Hero section with platform tagline
- How it works (3 steps: Create Contract → Lock Funds → Get Paid)
- Features: AI Contract Fairness, Blockchain Escrow, Transparent Disputes
- Connect Wallet CTA button
- Clean, impressive, makes someone want to sign up

### 2. `/onboarding` — Profile Setup
- After wallet connects, check if user exists in backend
- If new user: ask for display name and role (Freelancer / Employer / Both)
- Save to backend via POST /api/users
- Redirect to dashboard after

### 3. `/dashboard` — Main Dashboard
- Show wallet address (truncated) and display name
- Role-based view:
  - **Employer view:** Active contracts list, Create New Job button, USDT balance
  - **Freelancer view:** Active contracts list, pending submissions
- Each contract card shows: job title, counterparty, amount, status badge, action button
- Status badge colors: Created=gray, Funded=blue, InProgress=yellow, Submitted=orange, Disputed=red, Completed=green, Refunded=purple

### 4. `/jobs/create` — Create Job (Employer only)
- Form: Job title, description, freelancer wallet address, amount (USDT)
- Upload contract PDF
- AI Fairness Evaluation button — calls AI service, shows results inline
  - Shows each clause with fair/unfair label and suggestion
  - Overall fairness score
- If AI flags unfair clauses, warn employer before proceeding
- Both parties sign (employer signs on creation, freelancer signs separately)
- On submit: call backend to store job, then call createJob() on smart contract

### 5. `/jobs/[id]` — Job Detail Page
- Full job details
- Contract document viewer (PDF)
- Status timeline showing current stage
- Action buttons based on status and role:
  - Employer + Created → Fund Escrow button
  - Employer + Funded → Start Work button  
  - Employer + Submitted → Release Payment / Raise Dispute buttons
  - Freelancer + InProgress → Submit Work button
  - Freelancer + Submitted → Raise Dispute button
  - Moderator + Disputed → Resolve Dispute (release or refund)
- Transaction history from blockchain events

### 6. `/profile` — User Profile
- Display name, wallet address, role
- Stats: total jobs, completed, disputes
- Edit display name

---

## API Integration

### Backend (ASP.NET Core) — Base URL: http://localhost:5000
```
POST   /api/users              — create user profile
GET    /api/users/:wallet      — get user by wallet address
POST   /api/jobs               — create job record
GET    /api/jobs/:id           — get job details
GET    /api/jobs/employer/:wallet — get employer jobs
GET    /api/jobs/freelancer/:wallet — get freelancer jobs
PATCH  /api/jobs/:id/status    — update job status
```

### AI Service (FastAPI) — Base URL: http://localhost:8000
```
POST   /evaluate/text          — evaluate contract text
POST   /evaluate/file          — evaluate contract PDF/DOCX
```

---

## Wallet Connection Setup
Use RainbowKit for wallet connection. Wallet address = user identity. No email/password auth.

```typescript
// Only show these wallet options
// MetaMask, Coinbase Wallet, WalletConnect
// Network: Sepolia only
```

After wallet connects:
1. Check backend if wallet exists
2. If yes → redirect to dashboard
3. If no → redirect to onboarding

---

## Key Components to Build

```
components/
├── layout/
│   ├── Navbar.tsx           — logo, wallet connect button, nav links
│   └── Sidebar.tsx          — dashboard sidebar
├── jobs/
│   ├── JobCard.tsx          — job summary card with status badge
│   ├── JobStatusBadge.tsx   — colored status indicator
│   ├── JobTimeline.tsx      — visual status progression
│   └── ActionButtons.tsx    — role + status based action buttons
├── ai/
│   ├── FairnessScore.tsx    — overall score display
│   └── ClauseAnalysis.tsx   — list of clauses with fair/unfair labels
├── blockchain/
│   ├── WalletButton.tsx     — connect/disconnect wallet
│   └── TransactionStatus.tsx — pending/success/failed tx indicator
└── ui/
    ├── Button.tsx
    ├── Card.tsx
    ├── Badge.tsx
    └── Modal.tsx
```

---

## Important Notes for Cursor

1. **Wallet = Identity** — no traditional auth. `wagmi` `useAccount()` hook gives you the connected wallet address. Use that as the user identifier everywhere.

2. **USDT has 6 decimals** — when displaying amounts divide by `1e6`. When sending to contract multiply by `1e6`. Always use `BigInt` for contract interactions.

3. **Approve before deposit** — before calling `depositFunds()`, always call `approve()` on the USDT contract first. Check allowance before to avoid redundant approvals.

4. **Read contract state** — use `wagmi` `useReadContract` for reading job status. Use `useWriteContract` for transactions.

5. **Contract hash** — when employer uploads a PDF, hash it client-side using SHA-256 before passing to `createJob()`. Store the actual PDF in backend/cloud.

6. **Error handling** — blockchain transactions can fail. Always wrap contract calls in try/catch and show meaningful error messages to users.

7. **Loading states** — transactions take time. Show pending state while waiting for confirmation. Use `useWaitForTransactionReceipt` from wagmi.

8. **Sepolia only** — force users to switch to Sepolia if they're on wrong network. Show a network warning banner if not on chainId 11155111.

---

## Folder Structure
```
frontend/
├── app/
│   ├── page.tsx                  — landing
│   ├── onboarding/page.tsx
│   ├── dashboard/page.tsx
│   ├── jobs/
│   │   ├── create/page.tsx
│   │   └── [id]/page.tsx
│   └── profile/page.tsx
├── components/
├── lib/
│   ├── contract.ts               — contract address + ABI
│   ├── usdt.ts                   — USDT contract helpers
│   └── api.ts                    — axios API calls
├── hooks/
│   ├── useEscrow.ts              — custom hook for contract interactions
│   └── useUser.ts                — user profile hook
└── types/
    └── index.ts                  — TypeScript interfaces
```

---

## Start Here
Build in this order:
1. Setup RainbowKit + Wagmi config
2. Landing page
3. Navbar with wallet connect
4. Onboarding flow
5. Dashboard with job cards
6. Job creation with AI evaluation
7. Job detail with action buttons
