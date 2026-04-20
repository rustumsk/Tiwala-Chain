using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

[ApiController]
[Route("api/public/postings")]
public sealed class PublicPostingsController : ControllerBase
{
    private readonly PublicPostingService _publicPostingService;

    public PublicPostingsController(PublicPostingService publicPostingService)
    {
        _publicPostingService = publicPostingService;
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
        return Ok(await _publicPostingService.BrowsePostingsAsync(
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
            cancellationToken));
    }

    [EnableRateLimiting("public-postings-browse")]
    [HttpGet("{id:int}")]
    public async Task<ActionResult<PublicPostingDetailResponse>> GetPosting(
        int id,
        CancellationToken cancellationToken)
    {
        var result = await _publicPostingService.GetPostingAsync(id, cancellationToken);
        if (!result.IsSuccess)
        {
            return NotFound(result.Error);
        }

        return Ok(result.Value);
    }
}
