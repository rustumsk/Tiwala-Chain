public sealed record CreateJobRequest(
    string FreelancerWallet,
    string Title,
    string? Description,
    decimal AmountUsdt,
    string ContractKey,
    string ContractHash
);
