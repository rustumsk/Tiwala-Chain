import type { Address, Hex } from "viem";
import type { EscrowJobStatus } from "@/lib/contract";

export type EscrowJob = {
  id: bigint;
  employer: Address;
  freelancer: Address;
  amount: bigint;
  contractHash: Hex;
  status: EscrowJobStatus;
  createdAt?: bigint;
};
