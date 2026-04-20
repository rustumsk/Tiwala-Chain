public sealed record PublicAiEvaluationResponse(
    int FairnessScore,
    List<PublicAiClauseResponse> Clauses,
    int TotalClauses,
    int UnfairCount,
    int FairCount,
    bool Truncated,
    bool Cached
);
