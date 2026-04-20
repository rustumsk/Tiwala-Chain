using Microsoft.EntityFrameworkCore;

public sealed class PublicPostingService
{
    private readonly AppDbContext _dbContext;

    public PublicPostingService(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<PublicPostingListResponse> BrowsePostingsAsync(
        string? q,
        string? category,
        string? experienceLevel,
        string? jobType,
        decimal? budgetMin,
        decimal? budgetMax,
        string? postedWithin,
        string? skills,
        string? sort,
        int page,
        int pageSize,
        CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 50);

        var query = _dbContext.JobPostings
            .AsNoTracking()
            .Where(p => p.Visibility == "public")
            .Where(p => p.Status == PostingStatus.Published)
            .Where(p => !p.ProposalDeadline.HasValue || p.ProposalDeadline > now);

        query = ApplyFilters(query, q, category, experienceLevel, jobType, budgetMin, budgetMax, postedWithin, skills, now);
        query = ApplySort(query, sort);

        var totalCount = await query.CountAsync(cancellationToken);
        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return new PublicPostingListResponse(
            items.Select(ToSummaryResponse).ToList(),
            totalCount,
            page,
            pageSize);
    }

    public async Task<PublicPostingServiceResult<PublicPostingDetailResponse>> GetPostingAsync(
        int id,
        CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        var posting = await _dbContext.JobPostings
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == id, cancellationToken);

        if (posting is null ||
            posting.Visibility != "public" ||
            posting.Status != PostingStatus.Published ||
            (posting.ProposalDeadline.HasValue && posting.ProposalDeadline <= now))
        {
            return PublicPostingServiceResult<PublicPostingDetailResponse>.NotFound(new { error = "Posting not found." });
        }

        return PublicPostingServiceResult<PublicPostingDetailResponse>.Success(ToDetailResponse(posting));
    }

    private static IQueryable<JobPosting> ApplyFilters(
        IQueryable<JobPosting> query,
        string? q,
        string? category,
        string? experienceLevel,
        string? jobType,
        decimal? budgetMin,
        decimal? budgetMax,
        string? postedWithin,
        string? skills,
        DateTime now)
    {
        if (!string.IsNullOrWhiteSpace(q))
        {
            var search = q.Trim().ToLowerInvariant();
            query = query.Where(p =>
                p.Title.ToLower().Contains(search) ||
                (p.Summary != null && p.Summary.ToLower().Contains(search)) ||
                (p.Description != null && p.Description.ToLower().Contains(search)) ||
                p.Skills.Any(skill => skill.ToLower().Contains(search)));
        }

        if (!string.IsNullOrWhiteSpace(category))
        {
            var normalized = category.Trim().ToLowerInvariant();
            query = query.Where(p => p.Category == normalized);
        }

        if (!string.IsNullOrWhiteSpace(experienceLevel))
        {
            var normalized = experienceLevel.Trim().ToLowerInvariant();
            query = query.Where(p => p.ExperienceLevel == normalized);
        }

        if (!string.IsNullOrWhiteSpace(jobType))
        {
            var normalized = jobType.Trim().ToLowerInvariant();
            query = query.Where(p => p.JobType == normalized);
        }

        if (budgetMin.HasValue)
        {
            query = query.Where(p => (p.BudgetMax ?? p.BudgetMin ?? 0m) >= budgetMin.Value);
        }

        if (budgetMax.HasValue)
        {
            query = query.Where(p => (p.BudgetMin ?? p.BudgetMax ?? 0m) <= budgetMax.Value);
        }

        if (!string.IsNullOrWhiteSpace(postedWithin))
        {
            var threshold = postedWithin.Trim().ToLowerInvariant() switch
            {
                "24h" => now.AddHours(-24),
                "3d" => now.AddDays(-3),
                "7d" => now.AddDays(-7),
                "14d" => now.AddDays(-14),
                _ => (DateTime?)null,
            };

            if (threshold.HasValue)
            {
                query = query.Where(p => (p.PublishedAt ?? p.CreatedAt) >= threshold.Value);
            }
        }

        var skillTerms = PostingTextNormalizer.ParseCommaList(skills);
        if (skillTerms.Count > 0)
        {
            query = query.Where(p => p.Skills.Any(skill => skillTerms.Contains(skill.ToLower())));
        }

        return query;
    }

    private static IQueryable<JobPosting> ApplySort(IQueryable<JobPosting> query, string? sort)
    {
        return (sort ?? "newest").Trim().ToLowerInvariant() switch
        {
            "oldest" => query.OrderBy(p => p.PublishedAt ?? p.CreatedAt),
            "budget_high" => query.OrderByDescending(p => p.BudgetMax ?? p.BudgetMin ?? 0m)
                .ThenByDescending(p => p.PublishedAt ?? p.CreatedAt),
            "budget_low" => query.OrderBy(p => p.BudgetMin ?? p.BudgetMax ?? 0m)
                .ThenByDescending(p => p.PublishedAt ?? p.CreatedAt),
            "closing_soon" => query.OrderBy(p => p.ProposalDeadline ?? DateTime.MaxValue)
                .ThenByDescending(p => p.PublishedAt ?? p.CreatedAt),
            _ => query.OrderByDescending(p => p.PublishedAt ?? p.CreatedAt),
        };
    }

    private static PublicPostingSummaryResponse ToSummaryResponse(JobPosting posting)
    {
        return new PublicPostingSummaryResponse(
            posting.Id,
            MaskWallet(posting.EmployerWallet),
            posting.Title,
            posting.Summary,
            posting.Category,
            posting.Skills,
            posting.JobType,
            posting.BudgetType,
            posting.BudgetMin,
            posting.BudgetMax,
            posting.Timeline,
            posting.ExperienceLevel,
            posting.ProposalDeadline,
            posting.PublishedAt ?? posting.CreatedAt);
    }

    private static PublicPostingDetailResponse ToDetailResponse(JobPosting posting)
    {
        return new PublicPostingDetailResponse(
            posting.Id,
            MaskWallet(posting.EmployerWallet),
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
            posting.ProposalDeadline,
            posting.PublishedAt ?? posting.CreatedAt);
    }

    private static string MaskWallet(string wallet)
    {
        if (string.IsNullOrWhiteSpace(wallet) || wallet.Length < 10)
        {
            return wallet;
        }

        return $"{wallet[..6]}...{wallet[^4..]}";
    }
}

public sealed record PublicPostingServiceResult<T>(bool IsSuccess, T? Value, object? Error)
{
    public static PublicPostingServiceResult<T> Success(T value) => new(true, value, null);
    public static PublicPostingServiceResult<T> NotFound(object error) => new(false, default, error);
}
