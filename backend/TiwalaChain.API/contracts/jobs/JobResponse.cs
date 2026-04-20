public sealed record JobResponse(
    int Id,
    string EmployerWallet,
    string FreelancerWallet,
    string Title,
    string? Description,
    string Status,
    decimal AmountUsdt,
    string ContractKey,
    string ContractHash,
    DateTime CreatedAt,
    DateTime? UpdatedAt,
    int? PostingId,
    int? ProposalId
);
