public static class AuthMapper
{
    public static AuthResponse ToAuthResponse(User user, string token, DateTime expiresAtUtc)
    {
        return new AuthResponse(token, expiresAtUtc, ToUserResponse(user));
    }

    public static UserResponse ToUserResponse(User user, bool canDeleteAccount = false)
    {
        return new UserResponse(
            user.Id,
            user.WalletAddress,
            user.DisplayName,
            user.Role.ToString().ToLowerInvariant(),
            user.IsApproved,
            user.CreatedAt,
            canDeleteAccount);
    }

    public static AdminUserResponse ToAdminUserResponse(User user, bool canDelete)
    {
        return new AdminUserResponse(
            user.Id,
            user.WalletAddress,
            user.DisplayName,
            user.Role.ToString().ToLowerInvariant(),
            user.IsApproved,
            user.CreatedAt,
            canDelete);
    }
}
