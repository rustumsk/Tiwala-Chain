using Microsoft.EntityFrameworkCore;

public sealed class PostingMapper
{
    private readonly AppDbContext _dbContext;

    public PostingMapper(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<List<PostingResponse>> ToPostingResponsesAsync(
        List<JobPosting> postings,
        CancellationToken cancellationToken)
    {
        var wallets = postings.Select(p => p.EmployerWallet).Distinct().ToList();
        var users = await _dbContext.Users
            .Where(u => wallets.Contains(u.WalletAddress))
            .ToDictionaryAsync(u => u.WalletAddress, u => u.DisplayName, cancellationToken);

        return postings.Select(p => ToPostingResponse(p, users)).ToList();
    }

    public async Task<PostingResponse> ToPostingResponseAsync(
        JobPosting posting,
        CancellationToken cancellationToken)
    {
        var displayName = await _dbContext.Users
            .Where(u => u.WalletAddress == posting.EmployerWallet)
            .Select(u => u.DisplayName)
            .FirstOrDefaultAsync(cancellationToken);

        return ToPostingResponse(posting, new Dictionary<string, string?> { [posting.EmployerWallet] = displayName });
    }

    private static PostingResponse ToPostingResponse(JobPosting posting, IReadOnlyDictionary<string, string?> users)
    {
        users.TryGetValue(posting.EmployerWallet, out var displayName);
        return new PostingResponse(
            posting.Id,
            posting.EmployerWallet,
            displayName,
            posting.Title,
            posting.Summary,
            posting.Description,
            posting.Category,
            posting.Skills,
            posting.JobType,
            posting.BudgetType,
            posting.BudgetMin,
            posting.BudgetMax,
            posting.Timeline,
            posting.ExperienceLevel,
            posting.Visibility,
            posting.ProposalDeadline,
            posting.Status.ToString(),
            posting.ProposalCount,
            posting.CreatedAt,
            posting.PublishedAt,
            !string.IsNullOrWhiteSpace(posting.BriefAttachmentKey),
            JsonFieldSerializer.DeserializeStringList(posting.ScreeningQuestionsJson)
        );
    }
}
