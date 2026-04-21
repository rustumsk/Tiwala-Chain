using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

[ApiController]
[Route("api")]
public sealed partial class ProposalsController : ControllerBase
{
    private readonly CurrentUserService _currentUserService;
    private readonly ProposalCommandService _proposalCommandService;
    private readonly ProposalFileService _proposalFileService;
    private readonly ProposalMessageService _proposalMessageService;
    private readonly ProposalOfferService _proposalOfferService;
    private readonly ProposalQueryService _proposalQueryService;
    private readonly ProposalWorkflowService _proposalWorkflowService;

    public ProposalsController(
        CurrentUserService currentUserService,
        ProposalCommandService proposalCommandService,
        ProposalFileService proposalFileService,
        ProposalMessageService proposalMessageService,
        ProposalOfferService proposalOfferService,
        ProposalQueryService proposalQueryService,
        ProposalWorkflowService proposalWorkflowService)
    {
        _currentUserService = currentUserService;
        _proposalCommandService = proposalCommandService;
        _proposalFileService = proposalFileService;
        _proposalMessageService = proposalMessageService;
        _proposalOfferService = proposalOfferService;
        _proposalQueryService = proposalQueryService;
        _proposalWorkflowService = proposalWorkflowService;
    }

    [Authorize]
    [EnableRateLimiting("proposals-create")]
    [HttpPost("postings/{postingId:int}/proposals")]
    public async Task<ActionResult<ProposalResponse>> CreateProposal(
        int postingId,
        [FromBody] CreateProposalRequest request,
        CancellationToken cancellationToken)
    {
        var user = await _currentUserService.GetAsync(User, cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var result = await _proposalCommandService.CreateAsync(user, postingId, request, cancellationToken);
        return ToActionResult(result);
    }

    [Authorize]
    [HttpGet("postings/{postingId:int}/proposals")]
    public async Task<ActionResult<List<ProposalResponse>>> GetPostingProposals(
        int postingId,
        CancellationToken cancellationToken)
    {
        var user = await _currentUserService.GetAsync(User, cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var result = await _proposalQueryService.GetPostingProposalsAsync(user, postingId, cancellationToken);
        return ToActionResult(result);
    }

    [Authorize]
    [HttpGet("proposals/mine")]
    public async Task<ActionResult<List<ProposalResponse>>> GetMyProposals(CancellationToken cancellationToken)
    {
        var user = await _currentUserService.GetAsync(User, cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var result = await _proposalQueryService.GetMineAsync(user, cancellationToken);
        return ToActionResult(result);
    }

    [Authorize]
    [HttpGet("proposals/mine/stats")]
    public async Task<ActionResult<ProposalStatsResponse>> GetMyProposalStats(CancellationToken cancellationToken)
    {
        var user = await _currentUserService.GetAsync(User, cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var result = await _proposalQueryService.GetMineStatsAsync(user, cancellationToken);
        return ToActionResult(result);
    }

    [Authorize]
    [HttpGet("proposals/{id:int}")]
    public async Task<ActionResult<ProposalResponse>> GetProposal(int id, CancellationToken cancellationToken)
    {
        var user = await _currentUserService.GetAsync(User, cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var result = await _proposalQueryService.GetAsync(user, id, cancellationToken);
        return ToActionResult(result);
    }

    [Authorize]
    [HttpPatch("proposals/{id:int}")]
    public async Task<ActionResult<ProposalResponse>> UpdateProposal(
        int id,
        [FromBody] UpdateProposalRequest request,
        CancellationToken cancellationToken)
    {
        var user = await _currentUserService.GetAsync(User, cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var result = await _proposalCommandService.UpdateAsync(user, id, request, cancellationToken);
        return ToActionResult(result);
    }

    [Authorize]
    [HttpPost("proposals/{id:int}/withdraw")]
    public async Task<ActionResult<ProposalResponse>> WithdrawProposal(int id, CancellationToken cancellationToken)
    {
        var user = await _currentUserService.GetAsync(User, cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var result = await _proposalWorkflowService.WithdrawAsync(user, id, cancellationToken);
        return ToActionResult(result);
    }

    [Authorize]
    [HttpPost("proposals/{id:int}/shortlist")]
    public async Task<ActionResult<ProposalResponse>> ShortlistProposal(int id, CancellationToken cancellationToken)
    {
        var user = await _currentUserService.GetAsync(User, cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var result = await _proposalWorkflowService.ShortlistAsync(user, id, cancellationToken);
        return ToActionResult(result);
    }

    [Authorize]
    [HttpPost("proposals/{id:int}/reject")]
    public async Task<ActionResult<ProposalResponse>> RejectProposal(int id, CancellationToken cancellationToken)
    {
        var user = await _currentUserService.GetAsync(User, cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var result = await _proposalWorkflowService.RejectAsync(user, id, cancellationToken);
        return ToActionResult(result);
    }

    [Authorize]
    [HttpPost("proposals/{id:int}/select")]
    public async Task<ActionResult<ProposalResponse>> SelectProposal(int id, CancellationToken cancellationToken)
    {
        var user = await _currentUserService.GetAsync(User, cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var result = await _proposalWorkflowService.SelectAsync(user, id, cancellationToken);
        return ToActionResult(result);
    }

    [Authorize]
    [HttpGet("proposals/{proposalId:int}/messages")]
    public async Task<ActionResult<List<ProposalMessageResponse>>> GetProposalMessages(
        int proposalId,
        CancellationToken cancellationToken)
    {
        var user = await _currentUserService.GetAsync(User, cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var result = await _proposalMessageService.GetMessagesAsync(user, proposalId, cancellationToken);
        return ToActionResult(result);
    }

    [Authorize]
    [EnableRateLimiting("messages-send")]
    [HttpPost("proposals/{proposalId:int}/messages")]
    public async Task<ActionResult<ProposalMessageResponse>> SendProposalMessage(
        int proposalId,
        [FromBody] SendProposalMessageRequest request,
        CancellationToken cancellationToken)
    {
        var user = await _currentUserService.GetAsync(User, cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var result = await _proposalMessageService.SendMessageAsync(user, proposalId, request, cancellationToken);
        return ToActionResult(result);
    }

    [Authorize]
    [HttpPost("proposals/{id:int}/convert-to-offer")]
    public async Task<ActionResult<JobResponse>> ConvertProposalToOffer(
        int id,
        [FromBody] ConvertProposalToOfferRequest request,
        CancellationToken cancellationToken)
    {
        var user = await _currentUserService.GetAsync(User, cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var result = await _proposalOfferService.ConvertToOfferAsync(user, id, request, cancellationToken);
        return ToActionResult(result);
    }

    [Authorize]
    [HttpGet("proposals/{id:int}/cv")]
    public async Task<IActionResult> GetProposalCv(int id, CancellationToken cancellationToken)
    {
        var user = await _currentUserService.GetAsync(User, cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var result = await _proposalFileService.GetCvAsync(user, id, cancellationToken);
        return result.Status switch
        {
            ProposalServiceResultStatus.Success => File(result.Value!.Stream, result.Value.ContentType, result.Value.FileName),
            ProposalServiceResultStatus.BadRequest => BadRequest(result.Error),
            ProposalServiceResultStatus.Conflict => Conflict(result.Error),
            ProposalServiceResultStatus.NotFound => NotFound(result.Error),
            ProposalServiceResultStatus.Forbidden when result.Error is not null => StatusCode(403, result.Error),
            ProposalServiceResultStatus.Forbidden => Forbid(),
            _ => StatusCode(StatusCodes.Status500InternalServerError),
        };
    }

    private ActionResult<T> ToActionResult<T>(ProposalServiceResult<T> result)
    {
        return result.Status switch
        {
            ProposalServiceResultStatus.Success => Ok(result.Value),
            ProposalServiceResultStatus.BadRequest => BadRequest(result.Error),
            ProposalServiceResultStatus.Conflict => Conflict(result.Error),
            ProposalServiceResultStatus.NotFound => NotFound(result.Error),
            ProposalServiceResultStatus.Forbidden when result.Error is not null => StatusCode(403, result.Error),
            ProposalServiceResultStatus.Forbidden => Forbid(),
            _ => StatusCode(StatusCodes.Status500InternalServerError),
        };
    }
}
