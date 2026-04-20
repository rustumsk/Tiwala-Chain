public sealed record AuthResponse(string AccessToken, DateTime ExpiresAtUtc, UserResponse User);
