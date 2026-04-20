public sealed record AdminUserResponse(
    int Id,
    string WalletAddress,
    string? DisplayName,
    string Role,
    bool IsApproved,
    DateTime CreatedAt,
    bool CanDelete);
