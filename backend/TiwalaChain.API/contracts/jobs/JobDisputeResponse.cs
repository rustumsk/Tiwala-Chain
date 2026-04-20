public sealed record JobDisputeResponse(
    string ContractHash,
    string OnChainJobId,
    string RaisedByWallet,
    string ReasonCode,
    string ReasonLabel,
    string? Details,
    DateTime CreatedAt);
