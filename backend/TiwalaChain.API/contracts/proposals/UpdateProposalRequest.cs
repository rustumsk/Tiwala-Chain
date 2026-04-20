public sealed record UpdateProposalRequest(
    string? CoverLetter,
    decimal? ProposedAmount,
    string? EstimatedTimeline,
    List<string>? PortfolioLinks,
    string? RelevantExperience,
    Dictionary<string, string>? ScreeningAnswers,
    string? CvAttachmentKey
);
