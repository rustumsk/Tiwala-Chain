public static class PostingPolicy
{
    public static bool CanCreate(UserRole role) =>
        role is UserRole.Employer or UserRole.Both;

    public static bool IsOwner(JobPosting posting, string wallet) =>
        string.Equals(posting.EmployerWallet, wallet, StringComparison.OrdinalIgnoreCase);

    public static bool CanManage(User user, JobPosting posting) =>
        user.Role == UserRole.Admin || IsOwner(posting, user.WalletAddress);

    public static bool CanAccessBrief(User user, JobPosting posting) =>
        posting.Status == PostingStatus.Published || CanManage(user, posting);
}
