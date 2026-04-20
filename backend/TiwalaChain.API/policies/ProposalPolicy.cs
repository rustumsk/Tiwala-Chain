public static class ProposalPolicy
{
    public static bool CanSubmit(UserRole role) =>
        role is UserRole.Freelancer or UserRole.Both;

    public static bool CanManage(User user, JobPosting posting) =>
        user.Role == UserRole.Admin || IsPostingOwner(posting, user.WalletAddress);

    public static bool CanAccess(User user, JobPosting posting, Proposal proposal) =>
        user.Role == UserRole.Admin ||
        IsPostingOwner(posting, user.WalletAddress) ||
        string.Equals(proposal.FreelancerWallet, user.WalletAddress, StringComparison.OrdinalIgnoreCase);

    public static bool CanMessage(ProposalStatus status) =>
        status is ProposalStatus.Submitted or ProposalStatus.Viewed or ProposalStatus.Shortlisted or ProposalStatus.Selected;

    public static bool IsPostingOwner(JobPosting posting, string wallet) =>
        string.Equals(posting.EmployerWallet, wallet, StringComparison.OrdinalIgnoreCase);
}
