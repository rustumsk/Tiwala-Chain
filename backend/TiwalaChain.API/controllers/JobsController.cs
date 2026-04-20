using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/[controller]")]
public sealed class JobsController : ControllerBase
{
    private readonly CurrentUserService _currentUserService;
    private readonly JobService _jobService;

    public JobsController(
        CurrentUserService currentUserService,
        JobService jobService)
    {
        _currentUserService = currentUserService;
        _jobService = jobService;
    }

    [Authorize]
    [HttpPost]
    public async Task<ActionResult<JobResponse>> CreateJob(
        [FromBody] CreateJobRequest request,
        CancellationToken cancellationToken)
    {
        var user = await ResolveCurrentUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var result = await _jobService.CreateJobAsync(user, request, cancellationToken);
        return ToActionResult(result);
    }

    [Authorize]
    [HttpGet("offers/incoming")]
    public async Task<ActionResult<List<JobResponse>>> GetIncomingOffers(CancellationToken cancellationToken)
    {
        var user = await ResolveCurrentUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        return Ok(await _jobService.GetIncomingOffersAsync(user, cancellationToken));
    }

    [Authorize]
    [HttpGet("offers/sent")]
    public async Task<ActionResult<List<JobResponse>>> GetSentOffers(CancellationToken cancellationToken)
    {
        var user = await ResolveCurrentUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        return Ok(await _jobService.GetSentOffersAsync(user, cancellationToken));
    }

    [Authorize]
    [HttpGet("{id:int}")]
    public async Task<ActionResult<JobResponse>> GetJob(int id, CancellationToken cancellationToken)
    {
        var user = await ResolveCurrentUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var result = await _jobService.GetJobAsync(user, id, cancellationToken);
        return ToActionResult(result);
    }

    [Authorize]
    [HttpGet("{id:int}/contract")]
    public async Task<IActionResult> GetJobContract(int id, CancellationToken cancellationToken)
    {
        var user = await ResolveCurrentUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var result = await _jobService.GetJobContractAsync(user, id, cancellationToken);
        return ToFileResult(result);
    }

    [Authorize]
    [HttpGet("contract/by-hash/{hash}")]
    public async Task<IActionResult> GetJobContractByHash(string hash, CancellationToken cancellationToken)
    {
        var user = await ResolveCurrentUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var result = await _jobService.GetJobContractByHashAsync(user, hash, cancellationToken);
        return ToFileResult(result);
    }

    [Authorize]
    [HttpGet("disputes/by-hash/{hash}")]
    public async Task<ActionResult<JobDisputeResponse>> GetJobDisputeByHash(
        string hash,
        CancellationToken cancellationToken)
    {
        var user = await ResolveCurrentUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var result = await _jobService.GetJobDisputeByHashAsync(user, hash, cancellationToken);
        return ToActionResult(result);
    }

    [Authorize]
    [HttpPost("disputes")]
    public async Task<ActionResult<JobDisputeResponse>> RecordJobDispute(
        [FromBody] RecordJobDisputeRequest request,
        CancellationToken cancellationToken)
    {
        var user = await ResolveCurrentUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var result = await _jobService.RecordJobDisputeAsync(user, request, cancellationToken);
        if (result.Status == JobServiceResultStatus.Created)
        {
            return CreatedAtAction(
                nameof(GetJobDisputeByHash),
                new { hash = result.LocationHash },
                result.Value);
        }

        return ToActionResult(result);
    }

    [Authorize]
    [HttpGet("by-hash/{hash}")]
    public async Task<ActionResult<JobResponse>> GetJobByHash(string hash, CancellationToken cancellationToken)
    {
        var user = await ResolveCurrentUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var result = await _jobService.GetJobByHashAsync(user, hash, cancellationToken);
        return ToActionResult(result);
    }

    [Authorize]
    [HttpPost("sync-from-chain")]
    public async Task<ActionResult<JobResponse>> SyncJobFromChain(
        [FromBody] SyncJobFromChainRequest request,
        CancellationToken cancellationToken)
    {
        var user = await ResolveCurrentUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var result = await _jobService.SyncJobFromChainAsync(user, request, cancellationToken);
        return ToActionResult(result);
    }

    [Authorize]
    [HttpPost("{id:int}/accept")]
    public async Task<ActionResult<JobResponse>> AcceptJob(int id, CancellationToken cancellationToken)
    {
        var user = await ResolveCurrentUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var result = await _jobService.AcceptJobAsync(user, id, cancellationToken);
        return ToActionResult(result);
    }

    [Authorize]
    [HttpPost("{id:int}/decline")]
    public async Task<ActionResult<JobResponse>> DeclineJob(int id, CancellationToken cancellationToken)
    {
        var user = await ResolveCurrentUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var result = await _jobService.DeclineJobAsync(user, id, cancellationToken);
        return ToActionResult(result);
    }

    private async Task<User?> ResolveCurrentUserAsync(CancellationToken cancellationToken)
    {
        return await _currentUserService.GetAsync(User, cancellationToken);
    }

    private ActionResult<T> ToActionResult<T>(JobServiceResult<T> result)
    {
        return result.Status switch
        {
            JobServiceResultStatus.Success => Ok(result.Value),
            JobServiceResultStatus.BadRequest => BadRequest(result.Error),
            JobServiceResultStatus.NotFound => NotFound(result.Error),
            JobServiceResultStatus.Conflict => Conflict(result.Error),
            JobServiceResultStatus.Forbidden when result.Error is not null => StatusCode(403, result.Error),
            JobServiceResultStatus.Forbidden => Forbid(),
            _ => StatusCode(StatusCodes.Status500InternalServerError),
        };
    }

    private IActionResult ToFileResult(JobServiceResult<JobFileDownload> result)
    {
        return result.Status switch
        {
            JobServiceResultStatus.Success => File(
                result.Value!.Stream,
                result.Value.ContentType,
                result.Value.FileName),
            JobServiceResultStatus.BadRequest => BadRequest(result.Error),
            JobServiceResultStatus.NotFound => NotFound(result.Error),
            JobServiceResultStatus.Forbidden when result.Error is not null => StatusCode(403, result.Error),
            JobServiceResultStatus.Forbidden => Forbid(),
            _ => StatusCode(StatusCodes.Status500InternalServerError),
        };
    }
}
