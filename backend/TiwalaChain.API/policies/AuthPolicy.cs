public static class AuthPolicy
{
    public static bool IsSelfServeDeletableRole(UserRole role) =>
        role is UserRole.Freelancer or UserRole.Employer or UserRole.Both;

    public static bool TryParseRole(string? roleValue, out UserRole role)
    {
        role = UserRole.Freelancer;
        if (string.IsNullOrWhiteSpace(roleValue))
        {
            return false;
        }

        return roleValue.Trim().ToLowerInvariant() switch
        {
            "freelancer" => (role = UserRole.Freelancer) == UserRole.Freelancer,
            "employer" => (role = UserRole.Employer) == UserRole.Employer,
            "both" => (role = UserRole.Both) == UserRole.Both,
            "admin" => (role = UserRole.Admin) == UserRole.Admin,
            _ => false,
        };
    }
}
