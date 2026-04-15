using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

[ApiController]
[Route("api/public/postings")]
public sealed class PublicPostingsController : ControllerBase
{
    private readonly AppDbContext _dbContext;

    public PublicPostingsController(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    [EnableRateLimiting("public-postings-browse")]
    [HttpGet]
    public async Task<ActionResult<PublicPostingListResponse>> BrowsePostings(
        [FromQuery] string? q,
        [FromQuery] string? category,
        [FromQuery] string? experienceLevel,
        [FromQuery] string? jobType,
        [FromQuery] decimal? budgetMin,
        [FromQuery] decimal? budgetMax,
        [FromQuery] string? postedWithin,
        [FromQuery] string? skills,
        [FromQuery] string? sort,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 50);

        var query = _dbContext.JobPostings
            .AsNoTracking()
            .Where(p => p.Visibility == "public")
            .Where(p => p.Status == PostingStatus.Published)
            .Where(p => !p.ProposalDeadline.HasValue || p.ProposalDeadline > now);

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

        var skillTerms = ParseCommaList(skills);
        if (skillTerms.Count > 0)
        {
            query = query.Where(p => p.Skills.Any(skill => skillTerms.Contains(skill.ToLower())));
        }

        query = (sort ?? "newest").Trim().ToLowerInvariant() switch
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

        var totalCount = await query.CountAsync(cancellationToken);
        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return Ok(new PublicPostingListResponse(
            items.Select(ToSummaryResponse).ToList(),
            totalCount,
            page,
            pageSize));
    }

    [EnableRateLimiting("public-postings-browse")]
    [HttpGet("{id:int}")]
    public async Task<ActionResult<PublicPostingDetailResponse>> GetPosting(
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
            return NotFound(new { error = "Posting not found." });
        }

        return Ok(ToDetailResponse(posting));
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

    private static List<string> ParseCommaList(string? raw) =>
        string.IsNullOrWhiteSpace(raw)
            ? []
            : raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(item => item.ToLowerInvariant())
                .Distinct()
                .ToList();
}

public sealed record PublicPostingSummaryResponse(
    int Id,
    string EmployerWallet,
    string Title,
    string? Summary,
    string Category,
    List<string> Skills,
    string JobType,
    string BudgetType,
    decimal? BudgetMin,
    decimal? BudgetMax,
    string? Timeline,
    string ExperienceLevel,
    DateTime? ProposalDeadline,
    DateTime PublishedAt
);

public sealed record PublicPostingDetailResponse(
    int Id,
    string EmployerWallet,
    string Title,
    string? Summary,
    string? Description,
    string Category,
    List<string> Skills,
    string JobType,
    string BudgetType,
    decimal? BudgetMin,
    decimal? BudgetMax,
    string? Timeline,
    string ExperienceLevel,
    DateTime? ProposalDeadline,
    DateTime PublishedAt
);

public sealed record PublicPostingListResponse(
    List<PublicPostingSummaryResponse> Items,
    int TotalCount,
    int Page,
    int PageSize
);
