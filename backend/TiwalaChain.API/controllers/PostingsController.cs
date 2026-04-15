using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text.Json;

[ApiController]
[Route("api/[controller]")]
public sealed class PostingsController : ControllerBase
{
    private static readonly HashSet<string> ValidCategories =
    [
        "development",
        "design",
        "marketing",
        "writing",
        "admin_support",
        "customer_support",
        "video_media",
        "blockchain",
        "ai_data",
        "product_strategy",
    ];

    private static readonly HashSet<string> ValidExperienceLevels =
    [
        "entry",
        "intermediate",
        "expert",
    ];

    private static readonly HashSet<string> ValidJobTypes =
    [
        "fixed_price",
    ];

    private static readonly HashSet<string> ValidBudgetTypes =
    [
        "fixed",
        "range",
    ];

    private static readonly HashSet<string> ValidVisibility =
    [
        "public",
    ];

    private readonly AppDbContext _dbContext;
    private readonly S3StorageService _storage;

    public PostingsController(AppDbContext dbContext, S3StorageService storage)
    {
        _dbContext = dbContext;
        _storage = storage;
    }

    [Authorize]
    [EnableRateLimiting("postings-create")]
    [HttpPost]
    public async Task<ActionResult<PostingResponse>> CreatePosting(
        [FromBody] CreatePostingRequest request,
        CancellationToken cancellationToken)
    {
        var user = await ResolveCurrentUser();
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        if (!user.IsApproved)
        {
            return StatusCode(403, "Your account is pending admin approval.");
        }

        if (!CanCreatePosting(user.Role))
        {
            return Forbid();
        }

        var validation = ValidatePostingInput(
            request.Title,
            request.Category,
            request.ExperienceLevel,
            request.JobType,
            request.BudgetType,
            request.BudgetMin,
            request.BudgetMax,
            request.Visibility,
            request.Skills,
            request.ProposalDeadline);
        if (validation is not null)
        {
            return BadRequest(validation);
        }

        var posting = new JobPosting
        {
            EmployerWallet = user.WalletAddress,
            Title = request.Title.Trim(),
            Summary = TrimToNull(request.Summary),
            Description = TrimToNull(request.Description),
            Category = request.Category.Trim().ToLowerInvariant(),
            Skills = NormalizeSkills(request.Skills),
            JobType = NormalizeOrDefault(request.JobType, "fixed_price"),
            BudgetType = NormalizeOrDefault(request.BudgetType, "fixed"),
            BudgetMin = request.BudgetMin,
            BudgetMax = request.BudgetType?.Trim().ToLowerInvariant() == "range"
                ? request.BudgetMax
                : null,
            Timeline = TrimToNull(request.Timeline),
            ExperienceLevel = NormalizeOrDefault(request.ExperienceLevel, "intermediate"),
            Visibility = NormalizeOrDefault(request.Visibility, "public"),
            ProposalDeadline = request.ProposalDeadline?.ToUniversalTime(),
            BriefAttachmentKey = TrimToNull(request.BriefAttachmentKey),
            ScreeningQuestionsJson = SerializeStringList(request.ScreeningQuestions),
            Status = PostingStatus.Draft,
        };

        _dbContext.JobPostings.Add(posting);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return Ok(await ToPostingResponseAsync(posting, cancellationToken));
    }

    [AllowAnonymous]
    [EnableRateLimiting("postings-browse")]
    [HttpGet]
    public async Task<ActionResult<PostingListResponse>> BrowsePostings(
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
            .Where(p => p.Status == PostingStatus.Published)
            .Where(p => !p.ProposalDeadline.HasValue || p.ProposalDeadline > now);

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
            "fewest_proposals" => query.OrderBy(p => p.ProposalCount)
                .ThenByDescending(p => p.PublishedAt ?? p.CreatedAt),
            _ => query.OrderByDescending(p => p.PublishedAt ?? p.CreatedAt),
        };

        var totalCount = await query.CountAsync(cancellationToken);
        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        var responses = await ToPostingResponsesAsync(items, cancellationToken);
        return Ok(new PostingListResponse(responses, totalCount, page, pageSize));
    }

    [Authorize]
    [HttpGet("mine")]
    public async Task<ActionResult<List<PostingResponse>>> GetMyPostings(CancellationToken cancellationToken)
    {
        var user = await ResolveCurrentUser();
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var postings = await _dbContext.JobPostings
            .Where(p => p.EmployerWallet == user.WalletAddress)
            .OrderByDescending(p => p.CreatedAt)
            .ToListAsync(cancellationToken);

        await ApplyLazyExpiryAsync(postings, cancellationToken);
        return Ok(await ToPostingResponsesAsync(postings, cancellationToken));
    }

    [Authorize]
    [HttpGet("mine/stats")]
    public async Task<ActionResult<PostingStatsResponse>> GetMyPostingStats(CancellationToken cancellationToken)
    {
        var user = await ResolveCurrentUser();
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

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

        return Ok(new PostingStatsResponse(openPostings, newProposals));
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<PostingResponse>> GetPosting(int id, CancellationToken cancellationToken)
    {
        var posting = await _dbContext.JobPostings.FirstOrDefaultAsync(p => p.Id == id, cancellationToken);
        if (posting is null)
        {
            return NotFound("Posting not found.");
        }

        await ApplyLazyExpiryAsync(posting, cancellationToken);

        if (posting.Status == PostingStatus.Draft)
        {
            var user = await ResolveCurrentUser();
            if (user is null)
            {
                return Unauthorized("Authentication required.");
            }

            if (!IsOwner(posting, user.WalletAddress) && user.Role != UserRole.Admin)
            {
                return Forbid();
            }
        }
        else if (posting.Status != PostingStatus.Published && posting.Status != PostingStatus.Filled)
        {
            var user = await ResolveCurrentUser();
            if (user is null || (!IsOwner(posting, user.WalletAddress) && user.Role != UserRole.Admin))
            {
                return NotFound("Posting not found.");
            }
        }

        return Ok(await ToPostingResponseAsync(posting, cancellationToken));
    }

    [Authorize]
    [HttpGet("{id:int}/brief")]
    public async Task<IActionResult> DownloadPostingBrief(int id, CancellationToken cancellationToken)
    {
        var user = await ResolveCurrentUser();
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var posting = await _dbContext.JobPostings.FirstOrDefaultAsync(p => p.Id == id, cancellationToken);
        if (posting is null)
        {
            return NotFound("Posting not found.");
        }

        await ApplyLazyExpiryAsync(posting, cancellationToken);

        if (string.IsNullOrWhiteSpace(posting.BriefAttachmentKey))
        {
            return NotFound("No brief attachment found.");
        }

        var canAccess = posting.Status == PostingStatus.Published
            || IsOwner(posting, user.WalletAddress)
            || user.Role == UserRole.Admin;
        if (!canAccess)
        {
            return Forbid();
        }

        var (stream, contentType) = await _storage.GetAsync(posting.BriefAttachmentKey, cancellationToken);
        return File(stream, contentType, $"posting-{posting.Id}-brief");
    }

    [Authorize]
    [HttpPatch("{id:int}")]
    public async Task<ActionResult<PostingResponse>> UpdatePosting(
        int id,
        [FromBody] UpdatePostingRequest request,
        CancellationToken cancellationToken)
    {
        var user = await ResolveCurrentUser();
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var posting = await _dbContext.JobPostings.FirstOrDefaultAsync(p => p.Id == id, cancellationToken);
        if (posting is null)
        {
            return NotFound("Posting not found.");
        }

        await ApplyLazyExpiryAsync(posting, cancellationToken);

        if (!IsOwner(posting, user.WalletAddress) && user.Role != UserRole.Admin)
        {
            return Forbid();
        }

        if (posting.Status is PostingStatus.Filled or PostingStatus.Expired)
        {
            return BadRequest("This posting can no longer be edited.");
        }

        var nextTitle = request.Title ?? posting.Title;
        var nextCategory = request.Category ?? posting.Category;
        var nextExperience = request.ExperienceLevel ?? posting.ExperienceLevel;
        var nextJobType = request.JobType ?? posting.JobType;
        var nextBudgetType = request.BudgetType ?? posting.BudgetType;
        var nextBudgetMin = request.BudgetMin ?? posting.BudgetMin;
        var nextBudgetMax = request.BudgetMax ?? posting.BudgetMax;
        var nextVisibility = request.Visibility ?? posting.Visibility;
        var nextSkills = request.Skills ?? posting.Skills;
        var nextDeadline = request.ProposalDeadline ?? posting.ProposalDeadline;

        var validation = ValidatePostingInput(
            nextTitle,
            nextCategory,
            nextExperience,
            nextJobType,
            nextBudgetType,
            nextBudgetMin,
            nextBudgetMax,
            nextVisibility,
            nextSkills,
            nextDeadline);
        if (validation is not null)
        {
            return BadRequest(validation);
        }

        posting.Title = nextTitle.Trim();
        posting.Summary = request.Title is null && request.Summary is null
            ? posting.Summary
            : TrimToNull(request.Summary) ?? posting.Summary;
        if (request.Summary is not null)
        {
            posting.Summary = TrimToNull(request.Summary);
        }
        if (request.Description is not null)
        {
            posting.Description = TrimToNull(request.Description);
        }

        posting.Category = nextCategory.Trim().ToLowerInvariant();
        posting.Skills = NormalizeSkills(nextSkills);
        posting.JobType = NormalizeOrDefault(nextJobType, posting.JobType);
        posting.BudgetType = NormalizeOrDefault(nextBudgetType, posting.BudgetType);
        posting.BudgetMin = nextBudgetMin;
        posting.BudgetMax = posting.BudgetType == "range" ? nextBudgetMax : null;
        if (request.Timeline is not null)
        {
            posting.Timeline = TrimToNull(request.Timeline);
        }
        posting.ExperienceLevel = NormalizeOrDefault(nextExperience, posting.ExperienceLevel);
        posting.Visibility = NormalizeOrDefault(nextVisibility, posting.Visibility);
        posting.ProposalDeadline = nextDeadline?.ToUniversalTime();
        if (request.BriefAttachmentKey is not null)
        {
            posting.BriefAttachmentKey = TrimToNull(request.BriefAttachmentKey);
        }
        if (request.ScreeningQuestions is not null)
        {
            posting.ScreeningQuestionsJson = SerializeStringList(request.ScreeningQuestions);
        }
        posting.UpdatedAt = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync(cancellationToken);
        return Ok(await ToPostingResponseAsync(posting, cancellationToken));
    }

    [Authorize]
    [HttpPost("{id:int}/publish")]
    public async Task<ActionResult<PostingResponse>> PublishPosting(int id, CancellationToken cancellationToken)
    {
        var result = await ChangePostingStatusAsync(id, PostingStatus.Published, cancellationToken);
        return result;
    }

    [Authorize]
    [HttpPost("{id:int}/close")]
    public async Task<ActionResult<PostingResponse>> ClosePosting(int id, CancellationToken cancellationToken)
    {
        var result = await ChangePostingStatusAsync(id, PostingStatus.Closed, cancellationToken);
        return result;
    }

    [Authorize]
    [HttpPost("{id:int}/reopen")]
    public async Task<ActionResult<PostingResponse>> ReopenPosting(int id, CancellationToken cancellationToken)
    {
        var result = await ChangePostingStatusAsync(id, PostingStatus.Published, cancellationToken, allowFromClosed: true);
        return result;
    }

    [Authorize]
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> DeletePosting(int id, CancellationToken cancellationToken)
    {
        var user = await ResolveCurrentUser();
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var posting = await _dbContext.JobPostings.FirstOrDefaultAsync(p => p.Id == id, cancellationToken);
        if (posting is null)
        {
            return NotFound("Posting not found.");
        }

        if (!IsOwner(posting, user.WalletAddress) && user.Role != UserRole.Admin)
        {
            return Forbid();
        }

        if (posting.Status != PostingStatus.Draft)
        {
            return BadRequest("Only draft postings can be deleted.");
        }

        var hasProposals = await _dbContext.Proposals.AnyAsync(p => p.PostingId == id, cancellationToken);
        if (hasProposals)
        {
            return BadRequest("Postings with proposals cannot be deleted.");
        }

        _dbContext.JobPostings.Remove(posting);
        await _dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    private async Task<ActionResult<PostingResponse>> ChangePostingStatusAsync(
        int id,
        PostingStatus nextStatus,
        CancellationToken cancellationToken,
        bool allowFromClosed = false)
    {
        var user = await ResolveCurrentUser();
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var posting = await _dbContext.JobPostings.FirstOrDefaultAsync(p => p.Id == id, cancellationToken);
        if (posting is null)
        {
            return NotFound("Posting not found.");
        }

        await ApplyLazyExpiryAsync(posting, cancellationToken);

        if (!IsOwner(posting, user.WalletAddress) && user.Role != UserRole.Admin)
        {
            return Forbid();
        }

        if (nextStatus == PostingStatus.Published)
        {
            if (posting.Status == PostingStatus.Published)
            {
                return Ok(await ToPostingResponseAsync(posting, cancellationToken));
            }

            if (posting.Status != PostingStatus.Draft && !(allowFromClosed && posting.Status == PostingStatus.Closed))
            {
                return BadRequest("This posting cannot be published.");
            }

            posting.Status = PostingStatus.Published;
            posting.PublishedAt ??= DateTime.UtcNow;
            posting.ClosedAt = null;
        }
        else if (nextStatus == PostingStatus.Closed)
        {
            if (posting.Status != PostingStatus.Published)
            {
                return BadRequest("Only published postings can be closed.");
            }

            posting.Status = PostingStatus.Closed;
            posting.ClosedAt = DateTime.UtcNow;
        }

        posting.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync(cancellationToken);
        return Ok(await ToPostingResponseAsync(posting, cancellationToken));
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

    private async Task<User?> ResolveCurrentUser()
    {
        var subjectClaim = User.FindFirstValue(JwtRegisteredClaimNames.Sub)
            ?? User.FindFirstValue(ClaimTypes.NameIdentifier);

        if (!int.TryParse(subjectClaim, out var userId))
        {
            return null;
        }

        return await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == userId);
    }

    private async Task<List<PostingResponse>> ToPostingResponsesAsync(
        List<JobPosting> postings,
        CancellationToken cancellationToken)
    {
        var wallets = postings.Select(p => p.EmployerWallet).Distinct().ToList();
        var users = await _dbContext.Users
            .Where(u => wallets.Contains(u.WalletAddress))
            .ToDictionaryAsync(u => u.WalletAddress, u => u.DisplayName, cancellationToken);

        return postings.Select(p => ToPostingResponse(p, users)).ToList();
    }

    private async Task<PostingResponse> ToPostingResponseAsync(JobPosting posting, CancellationToken cancellationToken)
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
            DeserializeStringList(posting.ScreeningQuestionsJson)
        );
    }

    private static bool CanCreatePosting(UserRole role) =>
        role is UserRole.Employer or UserRole.Both;

    private static bool IsOwner(JobPosting posting, string wallet) =>
        string.Equals(posting.EmployerWallet, wallet, StringComparison.OrdinalIgnoreCase);

    private static string? ValidatePostingInput(
        string? title,
        string? category,
        string? experienceLevel,
        string? jobType,
        string? budgetType,
        decimal? budgetMin,
        decimal? budgetMax,
        string? visibility,
        List<string>? skills,
        DateTime? proposalDeadline)
    {
        if (string.IsNullOrWhiteSpace(title) || title.Trim().Length is < 5 or > 200)
        {
            return "Title must be between 5 and 200 characters.";
        }

        var normalizedCategory = category?.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(normalizedCategory) || !ValidCategories.Contains(normalizedCategory))
        {
            return "Invalid category.";
        }

        var normalizedExperience = NormalizeOrDefault(experienceLevel, "intermediate");
        if (!ValidExperienceLevels.Contains(normalizedExperience))
        {
            return "Invalid experience level.";
        }

        var normalizedJobType = NormalizeOrDefault(jobType, "fixed_price");
        if (!ValidJobTypes.Contains(normalizedJobType))
        {
            return "Invalid job type.";
        }

        var normalizedBudgetType = NormalizeOrDefault(budgetType, "fixed");
        if (!ValidBudgetTypes.Contains(normalizedBudgetType))
        {
            return "Invalid budget type.";
        }

        if (normalizedBudgetType == "fixed" && (!budgetMin.HasValue || budgetMin.Value <= 0))
        {
            return "Fixed budget postings require a positive budget amount.";
        }

        if (normalizedBudgetType == "range")
        {
            if (!budgetMin.HasValue || !budgetMax.HasValue || budgetMin.Value <= 0 || budgetMax.Value <= 0 || budgetMin >= budgetMax)
            {
                return "Budget range postings require a valid minimum and maximum budget.";
            }
        }

        var normalizedVisibility = NormalizeOrDefault(visibility, "public");
        if (!ValidVisibility.Contains(normalizedVisibility))
        {
            return "Invalid visibility.";
        }

        var normalizedSkills = NormalizeSkills(skills);
        if (normalizedSkills.Count > 10)
        {
            return "A posting can have at most 10 skills.";
        }

        if (proposalDeadline.HasValue && proposalDeadline.Value.ToUniversalTime() <= DateTime.UtcNow)
        {
            return "Proposal deadline must be in the future.";
        }

        return null;
    }

    private static string NormalizeOrDefault(string? value, string fallback) =>
        string.IsNullOrWhiteSpace(value) ? fallback : value.Trim().ToLowerInvariant();

    private static string? TrimToNull(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static List<string> NormalizeSkills(List<string>? skills) =>
        (skills ?? [])
            .Select(skill => skill.Trim())
            .Where(skill => !string.IsNullOrWhiteSpace(skill))
            .Select(skill => skill.Length > 30 ? skill[..30] : skill)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Select(skill => skill.ToLowerInvariant())
            .ToList();

    private static List<string> ParseCommaList(string? raw) =>
        string.IsNullOrWhiteSpace(raw)
            ? []
            : raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(item => item.ToLowerInvariant())
                .Distinct()
                .ToList();

    private static string? SerializeStringList(List<string>? values)
    {
        var normalized = (values ?? [])
            .Select(v => v.Trim())
            .Where(v => !string.IsNullOrWhiteSpace(v))
            .ToList();
        return normalized.Count == 0 ? null : JsonSerializer.Serialize(normalized);
    }

    private static List<string> DeserializeStringList(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return [];
        }

        try
        {
            return JsonSerializer.Deserialize<List<string>>(raw) ?? [];
        }
        catch
        {
            return [];
        }
    }
}

public sealed record CreatePostingRequest(
    string Title,
    string? Summary,
    string? Description,
    string Category,
    List<string>? Skills,
    string? JobType,
    string? BudgetType,
    decimal? BudgetMin,
    decimal? BudgetMax,
    string? Timeline,
    string? ExperienceLevel,
    string? Visibility,
    DateTime? ProposalDeadline,
    List<string>? ScreeningQuestions,
    string? BriefAttachmentKey
);

public sealed record UpdatePostingRequest(
    string? Title,
    string? Summary,
    string? Description,
    string? Category,
    List<string>? Skills,
    string? JobType,
    string? BudgetType,
    decimal? BudgetMin,
    decimal? BudgetMax,
    string? Timeline,
    string? ExperienceLevel,
    string? Visibility,
    DateTime? ProposalDeadline,
    List<string>? ScreeningQuestions,
    string? BriefAttachmentKey
);

public sealed record PostingResponse(
    int Id,
    string EmployerWallet,
    string? EmployerDisplayName,
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
    string Visibility,
    DateTime? ProposalDeadline,
    string Status,
    int ProposalCount,
    DateTime CreatedAt,
    DateTime? PublishedAt,
    bool HasBriefAttachment,
    List<string> ScreeningQuestions
);

public sealed record PostingListResponse(
    List<PostingResponse> Items,
    int TotalCount,
    int Page,
    int PageSize
);

public sealed record PostingStatsResponse(
    int OpenPostings,
    int NewProposals
);
