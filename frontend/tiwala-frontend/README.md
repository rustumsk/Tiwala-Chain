# TiwalaChain Frontend

The frontend is a Next.js application for employers, freelancers, and moderators. It provides the main product UI for onboarding, marketplace postings, proposals, job offers, escrow job management, contract verification, AI fairness review, deliverables, notifications, and in-app blockchain transaction logs.

## Stack

- Next.js 16
- React 19
- Tailwind CSS
- wagmi, viem, RainbowKit
- TanStack Query
- sonner toast notifications
- lucide-react icons

## Important Paths

```text
src/
|-- app/                 Next.js App Router routes and API proxy routes
|-- components/          Reusable UI, layout, blockchain, job, marketplace, AI components
|-- hooks/               Shared React hooks
|-- lib/                 API clients, contract config, auth, notifications, utilities
|-- resource/            Static app resources
`-- types/               Shared TypeScript types
```

Notable files:

- `src/lib/contract.ts` - escrow contract address, ABI, status labels
- `src/lib/usdt.ts` - Sepolia USDT address and ABI
- `src/lib/jobs.ts` - job/offer API client
- `src/lib/proposals.ts` - proposal and marketplace API client
- `src/components/jobs/transaction-event-log.tsx` - in-app blockchain event log
- `src/components/layout/route-shell.tsx` - authenticated app shell

## Environment

Create or edit `.env`:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:5067
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=tiwalachain-dev-walletconnect-id
```

`NEXT_PUBLIC_*` values are exposed to the browser.

## Scripts

```powershell
npm install
npm run dev
npm run build
npm run start
npm run lint
```

Useful checks:

```powershell
npx tsc --noEmit --pretty false
```

## Local Development

Start the backend first, then run:

```powershell
npm run dev
```

Open `http://localhost:3000`.

The app is configured for Sepolia. Users need a supported wallet and Sepolia selected for on-chain actions.

## Feature Areas

- Public landing and onboarding
- Wallet authentication and local session persistence
- Employer dashboard and freelancer dashboard
- Job posting marketplace
- Proposal submission, messaging, shortlist/select/reject flows
- Offer creation, acceptance, and decline
- Contract upload, hashing, verification, and AI evaluation
- Deliverable submission and employer review
- Escrow actions through the deployed smart contract
- Notifications and unread counts
- Per-job blockchain transaction history with Etherscan links

## Deployment Notes

- Set `NEXT_PUBLIC_API_BASE_URL` to the deployed backend API.
- Set a real WalletConnect project ID for production.
- Make sure the backend CORS settings allow the deployed frontend origin.
- The currently configured escrow and USDT addresses live in `src/lib/contract.ts` and `src/lib/usdt.ts`.
