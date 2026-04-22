using Microsoft.EntityFrameworkCore;

public sealed class PostingQueryService
{
    private readonly AppDbContext _dbContext;
    private readonly CurrentUserService _currentUserService;
    private readonly PostingMapper _postingMapper;

    public PostingQueryService(
        AppDbContext dbContext,
        CurrentUserService currentUserService,
        PostingMapper postingMapper)
    {
        _dbContext = dbContext;
        _currentUserService = currentUserService;
        _postingMapper = postingMapper;
    }

    public async Task<ServiceResult<PostingListResponse>> BrowseAsync(
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
            .Where(p => p.Status == PostingStatus.Published)
            .Where(p => !p.ProposalDeadline.HasValue || p.ProposalDeadline > now);

        query = ApplyFilters(query, q, category, experienceLevel, jobType, budgetMin, budgetMax, postedWithin, skills, now);
        query = ApplySort(query, sort);

        var totalCount = await query.CountAsync(cancellationToken);
        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        var responses = await _postingMapper.ToPostingResponsesAsync(items, cancellationToken);
        return ServiceResult<PostingListResponse>.Success(new PostingListResponse(responses, totalCount, page, pageSize));
    }

    public async Task<ServiceResult<List<PostingResponse>>> GetMineAsync(
        User user,
        CancellationToken cancellationToken)
    {
        var postings = await _dbContext.JobPostings
            .Where(p => p.EmployerWallet == user.WalletAddress)
            .OrderByDescending(p => p.CreatedAt)
            .ToListAsync(cancellationToken);

        await ApplyLazyExpiryAsync(postings, cancellationToken);
        var responses = await _postingMapper.ToPostingResponsesAsync(postings, cancellationToken);
        return ServiceResult<List<PostingResponse>>.Success(responses);
    }

    public async Task<ServiceResult<PostingStatsResponse>> GetMineStatsAsync(
        User user,
        CancellationToken cancellationToken)
    {
        var openPostings = await _dbContext.JobPostings.CountAsync(
            p => p.EmployerWallet == user.WalletAddress && p.Status == PostingStatus.Published,
            cancellationToken);

        var postingIds = await _dbContext.JobPostings
            .Where(p => p.EmployerWallet == user.WalletAddress)
            .Select(p => p.Id)
            .ToListAsync(cancellationToken);

        var newProposals = postingIds.Count == 0
            ? 0
            : await _dbContext.Proposals.CountAsync(
                p => postingIds.Contains(p.PostingId) && p.Status == ProposalStatus.Submitted,
                cancellationToken);

        return ServiceResult<PostingStatsResponse>.Success(new PostingStatsResponse(openPostings, newProposals));
    }

    public async Task<ServiceResult<PostingResponse>> GetAsync(
        System.Security.Claims.ClaimsPrincipal principal,
        int id,
        CancellationToken cancellationToken)
    {
        var posting = await _dbContext.JobPostings.FirstOrDefaultAsync(p => p.Id == id, cancellationToken);
        if (posting is null)
        {
            return ServiceResult<PostingResponse>.NotFound("Posting not found.");
        }

        await ApplyLazyExpiryAsync(posting, cancellationToken);

        if (posting.Status == PostingStatus.Draft)
        {
            var user = await _currentUserService.GetAsync(principal, cancellationToken);
            if (user is null)
            {
                return ServiceResult<PostingResponse>.Unauthorized("Authentication required.");
            }

            if (!PostingPolicy.CanManage(user, posting))
            {
                return ServiceResult<PostingResponse>.Forbidden();
            }
        }
        else if (posting.Status != PostingStatus.Published && posting.Status != PostingStatus.Filled)
        {
            var user = await _currentUserService.GetAsync(principal, cancellationToken);
            if (user is null || !PostingPolicy.CanManage(user, posting))
            {
                return ServiceResult<PostingResponse>.NotFound("Posting not found.");
            }
        }

        var response = await _postingMapper.ToPostingResponseAsync(posting, cancellationToken);
        return ServiceResult<PostingResponse>.Success(response);
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
            "fewest_proposals" => query.OrderBy(p => p.ProposalCount)
                .ThenByDescending(p => p.PublishedAt ?? p.CreatedAt),
            _ => query.OrderByDescending(p => p.PublishedAt ?? p.CreatedAt),
        };
    }

    private async Task ApplyLazyExpiryAsync(JobPosting posting, CancellationToken cancellationToken)
    {
        if (posting.Status == PostingStatus.Published &&
            posting.ProposalDeadline.HasValue &&
            posting.ProposalDeadline.Value <= DateTime.UtcNow)
        {
            posting.Status = PostingStatus.Expired;
            posting.UpdatedAt = DateTime.UtcNow;
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
    }

    private async Task ApplyLazyExpiryAsync(List<JobPosting> postings, CancellationToken cancellationToken)
    {
        var changed = false;
        foreach (var posting in postings)
        {
            if (posting.Status == PostingStatus.Published &&
                posting.ProposalDeadline.HasValue &&
                posting.ProposalDeadline.Value <= DateTime.UtcNow)
            {
                posting.Status = PostingStatus.Expired;
                posting.UpdatedAt = DateTime.UtcNow;
                changed = true;
            }
        }

        if (changed)
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
    }
}
