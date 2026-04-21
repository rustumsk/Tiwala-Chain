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
        return await WithCurrentUserAsync(
            async user => ToActionResult(await _jobService.CreateJobAsync(user, request, cancellationToken)),
            cancellationToken);
    }

    [Authorize]
    [HttpGet("offers/incoming")]
    public async Task<ActionResult<List<JobResponse>>> GetIncomingOffers(CancellationToken cancellationToken)
    {
        return await WithCurrentUserAsync<List<JobResponse>>(
            async user => Ok(await _jobService.GetIncomingOffersAsync(user, cancellationToken)),
            cancellationToken);
    }

    [Authorize]
    [HttpGet("offers/sent")]
    public async Task<ActionResult<List<JobResponse>>> GetSentOffers(CancellationToken cancellationToken)
    {
        return await WithCurrentUserAsync<List<JobResponse>>(
            async user => Ok(await _jobService.GetSentOffersAsync(user, cancellationToken)),
            cancellationToken);
    }

    [Authorize]
    [HttpGet("{id:int}")]
    public async Task<ActionResult<JobResponse>> GetJob(int id, CancellationToken cancellationToken)
    {
        return await WithCurrentUserAsync(
            async user => ToActionResult(await _jobService.GetJobAsync(user, id, cancellationToken)),
            cancellationToken);
    }

    [Authorize]
    [HttpGet("{id:int}/contract")]
    public async Task<IActionResult> GetJobContract(int id, CancellationToken cancellationToken)
    {
        return await WithCurrentUserAsync(
            async user => ToFileResult(await _jobService.GetJobContractAsync(user, id, cancellationToken)),
            cancellationToken);
    }

    [Authorize]
    [HttpGet("contract/by-hash/{hash}")]
    public async Task<IActionResult> GetJobContractByHash(string hash, CancellationToken cancellationToken)
    {
        return await WithCurrentUserAsync(
            async user => ToFileResult(await _jobService.GetJobContractByHashAsync(user, hash, cancellationToken)),
            cancellationToken);
    }

    [Authorize]
    [HttpGet("disputes/by-hash/{hash}")]
    public async Task<ActionResult<JobDisputeResponse>> GetJobDisputeByHash(
        string hash,
        CancellationToken cancellationToken)
    {
        return await WithCurrentUserAsync(
            async user => ToActionResult(await _jobService.GetJobDisputeByHashAsync(user, hash, cancellationToken)),
            cancellationToken);
    }

    [Authorize]
    [HttpPost("disputes")]
    public async Task<ActionResult<JobDisputeResponse>> RecordJobDispute(
        [FromBody] RecordJobDisputeRequest request,
        CancellationToken cancellationToken)
    {
        return await WithCurrentUserAsync(
            async user =>
            {
                var result = await _jobService.RecordJobDisputeAsync(user, request, cancellationToken);
                if (result.Status == JobServiceResultStatus.Created)
                {
                    return CreatedAtAction(
                        nameof(GetJobDisputeByHash),
                        new { hash = result.LocationHash },
                        result.Value);
                }

                return ToActionResult(result);
            },
            cancellationToken);
    }

    [Authorize]
    [HttpGet("by-hash/{hash}")]
    public async Task<ActionResult<JobResponse>> GetJobByHash(string hash, CancellationToken cancellationToken)
    {
        return await WithCurrentUserAsync(
            async user => ToActionResult(await _jobService.GetJobByHashAsync(user, hash, cancellationToken)),
            cancellationToken);
    }

    [Authorize]
    [HttpPost("sync-from-chain")]
    public async Task<ActionResult<JobResponse>> SyncJobFromChain(
        [FromBody] SyncJobFromChainRequest request,
        CancellationToken cancellationToken)
    {
        return await WithCurrentUserAsync(
            async user => ToActionResult(await _jobService.SyncJobFromChainAsync(user, request, cancellationToken)),
            cancellationToken);
    }

    [Authorize]
    [HttpPost("{id:int}/accept")]
    public async Task<ActionResult<JobResponse>> AcceptJob(int id, CancellationToken cancellationToken)
    {
        return await WithCurrentUserAsync(
            async user => ToActionResult(await _jobService.AcceptJobAsync(user, id, cancellationToken)),
            cancellationToken);
    }

    [Authorize]
    [HttpPost("{id:int}/decline")]
    public async Task<ActionResult<JobResponse>> DeclineJob(int id, CancellationToken cancellationToken)
    {
        return await WithCurrentUserAsync(
            async user => ToActionResult(await _jobService.DeclineJobAsync(user, id, cancellationToken)),
            cancellationToken);
    }

    private async Task<ActionResult<T>> WithCurrentUserAsync<T>(
        Func<User, Task<ActionResult<T>>> action,
        CancellationToken cancellationToken)
    {
        var user = await _currentUserService.GetAsync(User, cancellationToken);
        return user is null
            ? Unauthorized("Invalid session.")
            : await action(user);
    }

    private async Task<IActionResult> WithCurrentUserAsync(
        Func<User, Task<IActionResult>> action,
        CancellationToken cancellationToken)
    {
        var user = await _currentUserService.GetAsync(User, cancellationToken);
        return user is null
            ? Unauthorized("Invalid session.")
            : await action(user);
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
