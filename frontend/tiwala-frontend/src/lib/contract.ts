import type { Address } from "viem";

export const TIWALA_ESCROW_ADDRESS =
  "0x2Ed31094DD468B59f3A76Fd6a71F938232A3C6F9" as Address;

export const tiwalaEscrowAbi = [
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
