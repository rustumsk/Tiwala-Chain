public sealed record CreateProposalRequest(
    string? CoverLetter,
    decimal ProposedAmount,
    string? EstimatedTimeline,
    List<string>? PortfolioLinks,
    string? RelevantExperience,
    Dictionary<string, string>? ScreeningAnswers,
    string? CvAttachmentKey
);
