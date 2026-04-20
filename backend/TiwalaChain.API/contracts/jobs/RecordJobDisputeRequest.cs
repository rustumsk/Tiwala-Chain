public sealed record RecordJobDisputeRequest(
    string ContractHash,
    string OnChainJobId,
    string ReasonCode,
    string? Details);
