public sealed record UpdatePostingRequest(
    string? Title,
    string? Summary,
    string? Description,
    string? Category,
    List<string>? Skills,
    string? JobType,
    string? BudgetType,
    decimal? BudgetMin,
    decimal? BudgetMax,
    string? Timeline,
    string? ExperienceLevel,
    string? Visibility,
    DateTime? ProposalDeadline,
    List<string>? ScreeningQuestions,
    string? BriefAttachmentKey
);
