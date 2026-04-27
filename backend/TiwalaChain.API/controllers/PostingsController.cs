using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

[ApiController]
[Route("api/[controller]")]
public sealed class PostingsController : ControllerBase
{
    private readonly CurrentUserService _currentUserService;
    private readonly PostingCommandService _postingCommandService;
    private readonly PostingFileService _postingFileService;
    private readonly PostingQueryService _postingQueryService;
    private readonly PostingWorkflowService _postingWorkflowService;

    public PostingsController(
        CurrentUserService currentUserService,
        PostingCommandService postingCommandService,
        PostingFileService postingFileService,
        PostingQueryService postingQueryService,
        PostingWorkflowService postingWorkflowService)
    {
        _currentUserService = currentUserService;
        _postingCommandService = postingCommandService;
        _postingFileService = postingFileService;
        _postingQueryService = postingQueryService;
        _postingWorkflowService = postingWorkflowService;
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

        var result = await _postingCommandService.CreateAsync(user, request, cancellationToken);
        return ToActionResult(result);
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

        var result = await _postingFileService.GetBriefAsync(user, id, cancellationToken);
        return ToFileActionResult(result);
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

        var result = await _postingCommandService.UpdateAsync(user, id, request, cancellationToken);
        return ToActionResult(result);
    }

    [Authorize]
    [HttpPost("{id:int}/publish")]
    public async Task<ActionResult<PostingResponse>> PublishPosting(int id, CancellationToken cancellationToken)
    {
        var user = await _currentUserService.GetAsync(User, cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var result = await _postingWorkflowService.PublishAsync(user, id, cancellationToken);
        return ToActionResult(result);
    }

    [Authorize]
    [HttpPost("{id:int}/close")]
    public async Task<ActionResult<PostingResponse>> ClosePosting(int id, CancellationToken cancellationToken)
    {
        var user = await _currentUserService.GetAsync(User, cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var result = await _postingWorkflowService.CloseAsync(user, id, cancellationToken);
        return ToActionResult(result);
    }

    [Authorize]
    [HttpPost("{id:int}/reopen")]
    public async Task<ActionResult<PostingResponse>> ReopenPosting(int id, CancellationToken cancellationToken)
    {
        var user = await _currentUserService.GetAsync(User, cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var result = await _postingWorkflowService.ReopenAsync(user, id, cancellationToken);
        return ToActionResult(result);
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

        var result = await _postingCommandService.DeleteAsync(user, id, cancellationToken);
        return ToNoContentActionResult(result);
    }

    private ActionResult<T> ToActionResult<T>(ServiceResult<T> result)
    {
        return result.Status switch
        {
            ServiceResultStatus.Success => Ok(result.Value),
            ServiceResultStatus.BadRequest => BadRequest(result.Error),
            ServiceResultStatus.Conflict => Conflict(result.Error),
            ServiceResultStatus.NotFound => NotFound(result.Error),
            ServiceResultStatus.Unauthorized => Unauthorized(result.Error),
            ServiceResultStatus.Forbidden when result.Error is not null => StatusCode(403, result.Error),
            ServiceResultStatus.Forbidden => Forbid(),
            _ => StatusCode(StatusCodes.Status500InternalServerError),
        };
    }

    private IActionResult ToFileActionResult(ServiceResult<PostingFileDownload> result)
    {
        return result.Status switch
        {
            ServiceResultStatus.Success => File(result.Value!.Stream, result.Value.ContentType, result.Value.FileName),
            ServiceResultStatus.BadRequest => BadRequest(result.Error),
            ServiceResultStatus.Conflict => Conflict(result.Error),
            ServiceResultStatus.NotFound => NotFound(result.Error),
            ServiceResultStatus.Unauthorized => Unauthorized(result.Error),
            ServiceResultStatus.Forbidden when result.Error is not null => StatusCode(403, result.Error),
            ServiceResultStatus.Forbidden => Forbid(),
            _ => StatusCode(StatusCodes.Status500InternalServerError),
        };
    }

    private IActionResult ToNoContentActionResult(ServiceResult<bool> result)
    {
        return result.Status switch
        {
            ServiceResultStatus.Success => NoContent(),
            ServiceResultStatus.BadRequest => BadRequest(result.Error),
            ServiceResultStatus.Conflict => Conflict(result.Error),
            ServiceResultStatus.NotFound => NotFound(result.Error),
            ServiceResultStatus.Unauthorized => Unauthorized(result.Error),
            ServiceResultStatus.Forbidden when result.Error is not null => StatusCode(403, result.Error),
            ServiceResultStatus.Forbidden => Forbid(),
            _ => StatusCode(StatusCodes.Status500InternalServerError),
        };
    }

}
