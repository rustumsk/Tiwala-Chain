using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

[ApiController]
[Route("api")]
public sealed partial class ProposalsController : ControllerBase
{
    private readonly AppDbContext _dbContext;
    private readonly S3StorageService _storage;
    private readonly CurrentUserService _currentUserService;
    private readonly ProposalMessageService _proposalMessageService;
    private readonly ProposalQueryService _proposalQueryService;
    private readonly ProposalWorkflowService _proposalWorkflowService;
    private readonly ProposalMapper _proposalMapper;

    public ProposalsController(
        AppDbContext dbContext,
        S3StorageService storage,
        CurrentUserService currentUserService,
        ProposalMessageService proposalMessageService,
        ProposalQueryService proposalQueryService,
        ProposalWorkflowService proposalWorkflowService,
        ProposalMapper proposalMapper)
    {
        _dbContext = dbContext;
        _storage = storage;
        _currentUserService = currentUserService;
        _proposalMessageService = proposalMessageService;
        _proposalQueryService = proposalQueryService;
        _proposalWorkflowService = proposalWorkflowService;
        _proposalMapper = proposalMapper;
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

        if (!user.IsApproved)
        {
            return StatusCode(403, "Your account is pending admin approval.");
        }

        if (!ProposalPolicy.CanSubmit(user.Role))
        {
            return Forbid();
        }

        var posting = await _dbContext.JobPostings.FirstOrDefaultAsync(p => p.Id == postingId, cancellationToken);
        if (posting is null)
        {
            return NotFound("Posting not found.");
        }

        await ApplyLazyExpiryAsync(posting, cancellationToken);

        if (posting.Status != PostingStatus.Published)
        {
            return BadRequest("This posting is not accepting proposals.");
        }

        if (string.Equals(posting.EmployerWallet, user.WalletAddress, StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest("You cannot apply to your own posting.");
        }

        var validation = ProposalValidator.ValidateInput(request.CoverLetter, request.ProposedAmount, request.EstimatedTimeline);
        if (validation is not null)
        {
            return BadRequest(validation);
        }

        var existing = await _dbContext.Proposals
            .FirstOrDefaultAsync(
                p => p.PostingId == postingId &&
                    p.FreelancerWallet == user.WalletAddress &&
                    p.Status != ProposalStatus.Withdrawn,
                cancellationToken);
        if (existing is not null)
        {
            return Conflict("You already have an active proposal for this posting.");
        }

        var proposal = new Proposal
        {
            PostingId = posting.Id,
            FreelancerWallet = user.WalletAddress,
            CoverLetter = TextNormalizer.TrimToNull(request.CoverLetter),
            ProposedAmount = request.ProposedAmount,
            EstimatedTimeline = TextNormalizer.TrimToNull(request.EstimatedTimeline),
            PortfolioLinksJson = JsonFieldSerializer.SerializeStringList(request.PortfolioLinks),
            RelevantExperience = TextNormalizer.TrimToNull(request.RelevantExperience),
            ScreeningAnswersJson = JsonFieldSerializer.SerializeStringMap(request.ScreeningAnswers),
            CvAttachmentKey = TextNormalizer.TrimToNull(request.CvAttachmentKey),
            Status = ProposalStatus.Submitted,
        };

        _dbContext.Proposals.Add(proposal);
        posting.ProposalCount += 1;
        posting.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync(cancellationToken);

        AddNotification(
            posting.EmployerWallet,
            "proposal_received",
            $"New proposal received for \"{posting.Title}\".",
            new Dictionary<string, object?>
            {
                ["postingId"] = posting.Id,
                ["proposalId"] = proposal.Id,
            });
        await _dbContext.SaveChangesAsync(cancellationToken);

        return Ok(await _proposalMapper.ToProposalResponseAsync(proposal, posting, cancellationToken));
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

        var proposal = await _dbContext.Proposals.FirstOrDefaultAsync(p => p.Id == id, cancellationToken);
        if (proposal is null)
        {
            return NotFound("Proposal not found.");
        }

        if (!string.Equals(proposal.FreelancerWallet, user.WalletAddress, StringComparison.OrdinalIgnoreCase))
        {
            return Forbid();
        }

        if (proposal.Status is ProposalStatus.Shortlisted or ProposalStatus.Selected or ProposalStatus.Rejected or ProposalStatus.Withdrawn or ProposalStatus.ConvertedToOffer)
        {
            return BadRequest("This proposal can no longer be edited.");
        }

        var nextAmount = request.ProposedAmount ?? proposal.ProposedAmount;
        var nextTimeline = request.EstimatedTimeline ?? proposal.EstimatedTimeline;
        var validation = ProposalValidator.ValidateInput(request.CoverLetter ?? proposal.CoverLetter, nextAmount, nextTimeline);
        if (validation is not null)
        {
            return BadRequest(validation);
        }

        proposal.CoverLetter = TextNormalizer.TrimToNull(request.CoverLetter ?? proposal.CoverLetter);
        proposal.ProposedAmount = nextAmount;
        proposal.EstimatedTimeline = TextNormalizer.TrimToNull(nextTimeline);
        proposal.PortfolioLinksJson = request.PortfolioLinks is null
            ? proposal.PortfolioLinksJson
            : JsonFieldSerializer.SerializeStringList(request.PortfolioLinks);
        proposal.RelevantExperience = request.RelevantExperience is null
            ? proposal.RelevantExperience
            : TextNormalizer.TrimToNull(request.RelevantExperience);
        proposal.ScreeningAnswersJson = request.ScreeningAnswers is null
            ? proposal.ScreeningAnswersJson
            : JsonFieldSerializer.SerializeStringMap(request.ScreeningAnswers);
        proposal.CvAttachmentKey = request.CvAttachmentKey is null
            ? proposal.CvAttachmentKey
            : TextNormalizer.TrimToNull(request.CvAttachmentKey);
        proposal.UpdatedAt = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync(cancellationToken);

        var posting = await _dbContext.JobPostings.FirstAsync(p => p.Id == proposal.PostingId, cancellationToken);
        return Ok(await _proposalMapper.ToProposalResponseAsync(proposal, posting, cancellationToken));
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

        if (!user.IsApproved)
        {
            return StatusCode(403, "Your account is pending admin approval.");
        }

        var proposal = await _dbContext.Proposals.FirstOrDefaultAsync(p => p.Id == id, cancellationToken);
        if (proposal is null)
        {
            return NotFound("Proposal not found.");
        }

        var posting = await _dbContext.JobPostings.FirstOrDefaultAsync(p => p.Id == proposal.PostingId, cancellationToken);
        if (posting is null)
        {
            return NotFound("Posting not found.");
        }

        if (!ProposalPolicy.CanManage(user, posting))
        {
            return Forbid();
        }

        if (proposal.Status == ProposalStatus.ConvertedToOffer && proposal.ConvertedJobId.HasValue)
        {
            var existingJob = await _dbContext.Jobs.FirstOrDefaultAsync(j => j.Id == proposal.ConvertedJobId.Value, cancellationToken);
            if (existingJob is not null)
            {
                return Ok(JobMapper.ToResponse(existingJob));
            }
        }

        if (proposal.Status != ProposalStatus.Selected)
        {
            return BadRequest("Only selected proposals can be converted to an offer.");
        }

        var normalizedHash = HashNormalizer.NormalizeSha256Hash(request.ContractHash);
        if (string.IsNullOrWhiteSpace(request.ContractKey) || normalizedHash is null)
        {
            return BadRequest("Contract key and a valid contract hash are required.");
        }

        var amount = request.AmountUsdt ?? proposal.ProposedAmount;
        if (amount <= 0)
        {
            return BadRequest("Offer amount must be greater than 0.");
        }

        var title = string.IsNullOrWhiteSpace(request.Title) ? posting.Title : request.Title.Trim();
        if (title.Length is < 5 or > 200)
        {
            return BadRequest("Title must be between 5 and 200 characters.");
        }

        var job = new Job
        {
            EmployerWallet = posting.EmployerWallet,
            FreelancerWallet = proposal.FreelancerWallet,
            Title = title,
            Description = TextNormalizer.TrimToNull(request.Description ?? posting.Description ?? proposal.CoverLetter),
            ContractKey = request.ContractKey.Trim(),
            ContractHash = normalizedHash,
            AmountUsdt = amount,
            Status = JobStatus.PendingOffer,
            PostingId = posting.Id,
            ProposalId = proposal.Id,
        };

        _dbContext.Jobs.Add(job);
        proposal.Status = ProposalStatus.ConvertedToOffer;
        proposal.UpdatedAt = DateTime.UtcNow;
        posting.Status = PostingStatus.Filled;
        posting.ClosedAt = DateTime.UtcNow;
        posting.UpdatedAt = DateTime.UtcNow;
        AddSystemMessage(proposal.Id, "A formal offer was created from this proposal.");

        await _dbContext.SaveChangesAsync(cancellationToken);
        proposal.ConvertedJobId = job.Id;
        AddNotification(
            proposal.FreelancerWallet,
            "offer_from_proposal",
            $"A formal offer was created from your proposal for \"{posting.Title}\".",
            new Dictionary<string, object?>
            {
                ["postingId"] = posting.Id,
                ["proposalId"] = proposal.Id,
                ["jobId"] = job.Id,
            });
        await _dbContext.SaveChangesAsync(cancellationToken);
        return Ok(JobMapper.ToResponse(job));
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

        var proposal = await _dbContext.Proposals.FirstOrDefaultAsync(p => p.Id == id, cancellationToken);
        if (proposal is null)
        {
            return NotFound("Proposal not found.");
        }

        var posting = await _dbContext.JobPostings.FirstOrDefaultAsync(p => p.Id == proposal.PostingId, cancellationToken);
        if (posting is null)
        {
            return NotFound("Posting not found.");
        }

        if (!ProposalPolicy.CanAccess(user, posting, proposal))
        {
            return Forbid();
        }

        if (string.IsNullOrWhiteSpace(proposal.CvAttachmentKey))
        {
            return NotFound("No CV attached to this proposal.");
        }

        var (stream, contentType) = await _storage.GetAsync(proposal.CvAttachmentKey, cancellationToken);
        return File(stream, contentType, $"proposal-{proposal.Id}-cv");
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

    private void AddNotification(
        string recipientWallet,
        string type,
        string message,
        IReadOnlyDictionary<string, object?>? data = null)
    {
        _dbContext.Notifications.Add(new Notification
        {
            RecipientWallet = recipientWallet,
            Type = type,
            Message = message.Length > 500 ? message[..500] : message,
            DataJson = data is null ? null : JsonSerializer.Serialize(data),
        });
    }

    private void AddSystemMessage(int proposalId, string body)
    {
        _dbContext.ProposalMessages.Add(new ProposalMessage
        {
            ProposalId = proposalId,
            SenderWallet = "system",
            Body = body,
            MessageType = "system",
        });
    }

    private ActionResult<T> ToActionResult<T>(ProposalServiceResult<T> result)
    {
        return result.Status switch
        {
            ProposalServiceResultStatus.Success => Ok(result.Value),
            ProposalServiceResultStatus.BadRequest => BadRequest(result.Error),
            ProposalServiceResultStatus.NotFound => NotFound(result.Error),
            ProposalServiceResultStatus.Forbidden when result.Error is not null => StatusCode(403, result.Error),
            ProposalServiceResultStatus.Forbidden => Forbid(),
            _ => StatusCode(StatusCodes.Status500InternalServerError),
        };
    }
}
