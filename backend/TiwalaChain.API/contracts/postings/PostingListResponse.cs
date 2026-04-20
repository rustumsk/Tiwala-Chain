public sealed record PostingListResponse(
    List<PostingResponse> Items,
    int TotalCount,
    int Page,
    int PageSize
);
