public sealed record PublicAiClauseResponse(
    string Clause,
    string Label,
    int? Confidence,
    string? Reason,
    string? Suggestion,
    string? Issue
);
