public sealed record UserResponse(
    int Id,
    string WalletAddress,
    string? DisplayName,
    string Role,
    bool IsApproved,
    DateTime CreatedAt,
    bool CanDeleteAccount = false);
