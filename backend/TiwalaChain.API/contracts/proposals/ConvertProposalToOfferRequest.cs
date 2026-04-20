public sealed record ConvertProposalToOfferRequest(
    string? Title,
    string? Description,
    decimal? AmountUsdt,
    string ContractKey,
    string ContractHash
);
