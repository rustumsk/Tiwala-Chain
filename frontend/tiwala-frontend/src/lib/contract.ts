import type { Address } from "viem";

export const TIWALA_ESCROW_ADDRESS =
  "0xC2cEDA247c04e3a49541FcA219580A2348Df3568" as Address;

export const tiwalaEscrowAbi = [
  {
    type: "event",
    name: "JobCreated",
    inputs: [
      { name: "jobId", type: "uint256", indexed: true },
      { name: "employer", type: "address", indexed: true },
      { name: "freelancer", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "contractHash", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "JobFunded",
    inputs: [
      { name: "jobId", type: "uint256", indexed: true },
      { name: "employer", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "WorkSubmitted",
    inputs: [
      { name: "jobId", type: "uint256", indexed: true },
      { name: "freelancer", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "PaymentReleased",
    inputs: [
      { name: "jobId", type: "uint256", indexed: true },
      { name: "freelancer", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PaymentRefunded",
    inputs: [
      { name: "jobId", type: "uint256", indexed: true },
      { name: "employer", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "DisputeRaised",
    inputs: [
      { name: "jobId", type: "uint256", indexed: true },
      { name: "raisedBy", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "DisputeResolved",
    inputs: [
      { name: "jobId", type: "uint256", indexed: true },
      { name: "resolvedBy", type: "address", indexed: true },
      { name: "releasedToFreelancer", type: "bool", indexed: false },
    ],
  },
  {
    type: "function",
    name: "createJob",
    stateMutability: "nonpayable",
    inputs: [
      { name: "freelancer", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "contractHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "depositFunds",
    stateMutability: "nonpayable",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "startWork",
    stateMutability: "nonpayable",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "submitWork",
    stateMutability: "nonpayable",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "releasePayment",
    stateMutability: "nonpayable",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "raiseDispute",
    stateMutability: "nonpayable",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "resolveDispute",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "releaseToFreelancer", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "refund",
    stateMutability: "nonpayable",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "getEmployerJobs",
    stateMutability: "view",
    inputs: [{ name: "employer", type: "address" }],
    outputs: [{ name: "", type: "uint256[]" }],
  },
  {
    type: "function",
    name: "getFreelancerJobs",
    stateMutability: "view",
    inputs: [{ name: "freelancer", type: "address" }],
    outputs: [{ name: "", type: "uint256[]" }],
  },
  {
    type: "function",
    name: "getJob",
    stateMutability: "view",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "employer", type: "address" },
          { name: "freelancer", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "status", type: "uint8" },
          { name: "contractHash", type: "bytes32" },
          { name: "createdAt", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "jobCounter",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "moderator",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

export type EscrowJobStatus =
  | 0
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6;

export const JOB_STATUS_LABEL: Record<EscrowJobStatus, string> = {
  0: "Created",
  1: "Funded",
  2: "In Progress",
  3: "Submitted",
  4: "Disputed",
  5: "Released",
  6: "Refunded",
};
