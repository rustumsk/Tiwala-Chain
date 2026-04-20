public sealed record SyncJobFromChainRequest(
    string OnChainJobId,
    string EmployerWallet,
    string FreelancerWallet,
    decimal AmountUsdt,
    string ContractHash,
    string? Title,
    string? Description
);
