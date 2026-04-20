using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/[controller]")]
public sealed class DeliverablesController : ControllerBase
{
    private readonly CurrentUserService _currentUserService;
    private readonly DeliverableService _deliverableService;

    public DeliverablesController(
        CurrentUserService currentUserService,
        DeliverableService deliverableService)
    {
        _currentUserService = currentUserService;
        _deliverableService = deliverableService;
    }

    [Authorize]
    [HttpGet("by-hash/{hash}")]
    public async Task<ActionResult<List<DeliverableResponse>>> ListByContractHash(
        string hash,
        CancellationToken cancellationToken)
    {
        var user = await _currentUserService.GetAsync(User, cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var result = await _deliverableService.ListByContractHashAsync(user, hash, cancellationToken);
        return ToActionResult(result);
    }

    [Authorize]
    [HttpPost("by-hash/{hash}")]
    [DisableRequestSizeLimit]
    public async Task<ActionResult<DeliverableResponse>> SubmitByContractHash(
        string hash,
        [FromForm] string? note,
        [FromForm] int? deliverableId,
        [FromForm] string? linksJson,
        [FromForm] List<IFormFile>? files,
        CancellationToken cancellationToken)
    {
        var user = await _currentUserService.GetAsync(User, cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var result = await _deliverableService.SubmitByContractHashAsync(
            user,
            hash,
            note,
            deliverableId,
            linksJson,
            files,
            cancellationToken);

        return ToActionResult(result);
    }

    [Authorize]
    [HttpPost("{id:int}/approve")]
    public async Task<ActionResult<DeliverableResponse>> Approve(
        int id,
        [FromBody] ReviewRequest request,
        CancellationToken cancellationToken)
    {
        var user = await _currentUserService.GetAsync(User, cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var result = await _deliverableService.ApproveAsync(user, id, request, cancellationToken);
        return ToActionResult(result);
    }

    [Authorize]
    [HttpPost("{id:int}/request-revision")]
    public async Task<ActionResult<DeliverableResponse>> RequestRevision(
        int id,
        [FromBody] ReviewRequest request,
        CancellationToken cancellationToken)
    {
        var user = await _currentUserService.GetAsync(User, cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var result = await _deliverableService.RequestRevisionAsync(user, id, request, cancellationToken);
        return ToActionResult(result);
    }

    [Authorize]
    [HttpGet("files/{attachmentId:int}")]
    public async Task<IActionResult> DownloadAttachment(int attachmentId, CancellationToken cancellationToken)
    {
        var user = await _currentUserService.GetAsync(User, cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var result = await _deliverableService.DownloadAttachmentAsync(user, attachmentId, cancellationToken);
        return result.Status switch
        {
            DeliverableResultStatus.Success => File(
                result.Value!.Stream,
                result.Value.ContentType,
                result.Value.FileName),
            DeliverableResultStatus.BadRequest => BadRequest(result.Error),
            DeliverableResultStatus.NotFound => NotFound(result.Error),
            DeliverableResultStatus.Forbidden => Forbid(),
            _ => StatusCode(StatusCodes.Status500InternalServerError),
        };
    }

    private ActionResult<T> ToActionResult<T>(DeliverableResult<T> result)
    {
        return result.Status switch
        {
            DeliverableResultStatus.Success => Ok(result.Value),
            DeliverableResultStatus.BadRequest => BadRequest(result.Error),
            DeliverableResultStatus.NotFound => NotFound(result.Error),
            DeliverableResultStatus.Forbidden => Forbid(),
            _ => StatusCode(StatusCodes.Status500InternalServerError),
        };
    }
}
