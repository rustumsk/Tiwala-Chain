public sealed record ProposalMessageResponse(
    int Id,
    int ProposalId,
    string SenderWallet,
    string? SenderDisplayName,
    string Body,
    string MessageType,
    DateTime CreatedAt,
    DateTime? ReadAt
);
