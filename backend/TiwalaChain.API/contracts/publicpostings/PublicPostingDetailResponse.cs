public sealed record PublicPostingDetailResponse(
    int Id,
    string EmployerWallet,
    string Title,
    string? Summary,
    string? Description,
    string Category,
    List<string> Skills,
    string JobType,
    string BudgetType,
    decimal? BudgetMin,
    decimal? BudgetMax,
    string? Timeline,
    string ExperienceLevel,
    DateTime? ProposalDeadline,
    DateTime PublishedAt
);
