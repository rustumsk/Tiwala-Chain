using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

[ApiController]
[Route("api/[controller]")]
public sealed class PostingsController : ControllerBase
{
    private readonly AppDbContext _dbContext;
    private readonly S3StorageService _storage;
    private readonly CurrentUserService _currentUserService;
    private readonly PostingQueryService _postingQueryService;
    private readonly PostingMapper _postingMapper;

    public PostingsController(
        AppDbContext dbContext,
        S3StorageService storage,
        CurrentUserService currentUserService,
        PostingQueryService postingQueryService,
        PostingMapper postingMapper)
    {
        _dbContext = dbContext;
        _storage = storage;
        _currentUserService = currentUserService;
        _postingQueryService = postingQueryService;
        _postingMapper = postingMapper;
    }

    [Authorize]
    [EnableRateLimiting("postings-create")]
    [HttpPost]
    public async Task<ActionResult<PostingResponse>> CreatePosting(
        [FromBody] CreatePostingRequest request,
        CancellationToken cancellationToken)
    {
        var user = await _currentUserService.GetAsync(User, cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        if (!user.IsApproved)
        {
            return StatusCode(403, "Your account is pending admin approval.");
        }

        if (!PostingPolicy.CanCreate(user.Role))
        {
            return Forbid();
        }

        var validation = PostingValidator.ValidateInput(
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
            Summary = TextNormalizer.TrimToNull(request.Summary),
            Description = TextNormalizer.TrimToNull(request.Description),
            Category = request.Category.Trim().ToLowerInvariant(),
            Skills = PostingTextNormalizer.NormalizeSkills(request.Skills),
            JobType = PostingValidator.NormalizeOrDefault(request.JobType, "fixed_price"),
            BudgetType = PostingValidator.NormalizeOrDefault(request.BudgetType, "fixed"),
            BudgetMin = request.BudgetMin,
            BudgetMax = request.BudgetType?.Trim().ToLowerInvariant() == "range"
                ? request.BudgetMax
                : null,
            Timeline = TextNormalizer.TrimToNull(request.Timeline),
            ExperienceLevel = PostingValidator.NormalizeOrDefault(request.ExperienceLevel, "intermediate"),
            Visibility = PostingValidator.NormalizeOrDefault(request.Visibility, "public"),
            ProposalDeadline = request.ProposalDeadline?.ToUniversalTime(),
            BriefAttachmentKey = TextNormalizer.TrimToNull(request.BriefAttachmentKey),
            ScreeningQuestionsJson = JsonFieldSerializer.SerializeStringList(request.ScreeningQuestions),
            Status = PostingStatus.Draft,
        };

        _dbContext.JobPostings.Add(posting);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return Ok(await _postingMapper.ToPostingResponseAsync(posting, cancellationToken));
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
        var result = await _postingQueryService.BrowseAsync(
            q,
            category,
            experienceLevel,
            jobType,
            budgetMin,
            budgetMax,
            postedWithin,
            skills,
            sort,
            page,
            pageSize,
            cancellationToken);
        return ToActionResult(result);
    }

    [Authorize]
    [HttpGet("mine")]
    public async Task<ActionResult<List<PostingResponse>>> GetMyPostings(CancellationToken cancellationToken)
    {
        var user = await _currentUserService.GetAsync(User, cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var result = await _postingQueryService.GetMineAsync(user, cancellationToken);
        return ToActionResult(result);
    }

    [Authorize]
    [HttpGet("mine/stats")]
    public async Task<ActionResult<PostingStatsResponse>> GetMyPostingStats(CancellationToken cancellationToken)
    {
        var user = await _currentUserService.GetAsync(User, cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var result = await _postingQueryService.GetMineStatsAsync(user, cancellationToken);
        return ToActionResult(result);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<PostingResponse>> GetPosting(int id, CancellationToken cancellationToken)
    {
        var result = await _postingQueryService.GetAsync(User, id, cancellationToken);
        return ToActionResult(result);
    }

    [Authorize]
    [HttpGet("{id:int}/brief")]
    public async Task<IActionResult> DownloadPostingBrief(int id, CancellationToken cancellationToken)
    {
        var user = await _currentUserService.GetAsync(User, cancellationToken);
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

        if (!PostingPolicy.CanAccessBrief(user, posting))
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
        var user = await _currentUserService.GetAsync(User, cancellationToken);
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

        if (!PostingPolicy.CanManage(user, posting))
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

        var validation = PostingValidator.ValidateInput(
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
            : TextNormalizer.TrimToNull(request.Summary) ?? posting.Summary;
        if (request.Summary is not null)
        {
            posting.Summary = TextNormalizer.TrimToNull(request.Summary);
        }
        if (request.Description is not null)
        {
            posting.Description = TextNormalizer.TrimToNull(request.Description);
        }

        posting.Category = nextCategory.Trim().ToLowerInvariant();
        posting.Skills = PostingTextNormalizer.NormalizeSkills(nextSkills);
        posting.JobType = PostingValidator.NormalizeOrDefault(nextJobType, posting.JobType);
        posting.BudgetType = PostingValidator.NormalizeOrDefault(nextBudgetType, posting.BudgetType);
        posting.BudgetMin = nextBudgetMin;
        posting.BudgetMax = posting.BudgetType == "range" ? nextBudgetMax : null;
        if (request.Timeline is not null)
        {
            posting.Timeline = TextNormalizer.TrimToNull(request.Timeline);
        }
        posting.ExperienceLevel = PostingValidator.NormalizeOrDefault(nextExperience, posting.ExperienceLevel);
        posting.Visibility = PostingValidator.NormalizeOrDefault(nextVisibility, posting.Visibility);
        posting.ProposalDeadline = nextDeadline?.ToUniversalTime();
        if (request.BriefAttachmentKey is not null)
        {
            posting.BriefAttachmentKey = TextNormalizer.TrimToNull(request.BriefAttachmentKey);
        }
        if (request.ScreeningQuestions is not null)
        {
            posting.ScreeningQuestionsJson = JsonFieldSerializer.SerializeStringList(request.ScreeningQuestions);
        }
        posting.UpdatedAt = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync(cancellationToken);
        return Ok(await _postingMapper.ToPostingResponseAsync(posting, cancellationToken));
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
        var user = await _currentUserService.GetAsync(User, cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var posting = await _dbContext.JobPostings.FirstOrDefaultAsync(p => p.Id == id, cancellationToken);
        if (posting is null)
        {
            return NotFound("Posting not found.");
        }

        if (!PostingPolicy.CanManage(user, posting))
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
        var user = await _currentUserService.GetAsync(User, cancellationToken);
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

        if (!PostingPolicy.CanManage(user, posting))
        {
            return Forbid();
        }

        if (nextStatus == PostingStatus.Published)
        {
            if (posting.Status == PostingStatus.Published)
            {
                return Ok(await _postingMapper.ToPostingResponseAsync(posting, cancellationToken));
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
        return Ok(await _postingMapper.ToPostingResponseAsync(posting, cancellationToken));
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

    private ActionResult<T> ToActionResult<T>(PostingServiceResult<T> result)
    {
        return result.Status switch
        {
            PostingServiceResultStatus.Success => Ok(result.Value),
            PostingServiceResultStatus.BadRequest => BadRequest(result.Error),
            PostingServiceResultStatus.Conflict => Conflict(result.Error),
            PostingServiceResultStatus.NotFound => NotFound(result.Error),
            PostingServiceResultStatus.Unauthorized => Unauthorized(result.Error),
            PostingServiceResultStatus.Forbidden when result.Error is not null => StatusCode(403, result.Error),
            PostingServiceResultStatus.Forbidden => Forbid(),
            _ => StatusCode(StatusCodes.Status500InternalServerError),
        };
    }

}
