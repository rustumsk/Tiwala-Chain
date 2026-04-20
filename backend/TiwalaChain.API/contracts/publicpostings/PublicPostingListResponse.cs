public sealed record PublicPostingListResponse(
    List<PublicPostingSummaryResponse> Items,
    int TotalCount,
    int Page,
    int PageSize
);
