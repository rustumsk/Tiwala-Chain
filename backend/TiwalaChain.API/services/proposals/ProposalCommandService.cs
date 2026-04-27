using System.Text.Json;
using Microsoft.EntityFrameworkCore;

public sealed class ProposalCommandService
{
    private readonly AppDbContext _dbContext;
    private readonly ProposalMapper _proposalMapper;

    public ProposalCommandService(AppDbContext dbContext, ProposalMapper proposalMapper)
    {
        _dbContext = dbContext;
        _proposalMapper = proposalMapper;
    }

    public async Task<ServiceResult<ProposalResponse>> CreateAsync(
        User user,
        int postingId,
        CreateProposalRequest request,
        CancellationToken cancellationToken)
    {
        if (!user.IsApproved)
        {
            return ServiceResult<ProposalResponse>.Forbidden("Your account is pending admin approval.");
        }

        if (!ProposalPolicy.CanSubmit(user.Role))
        {
            return ServiceResult<ProposalResponse>.Forbidden();
        }

        var posting = await _dbContext.JobPostings.FirstOrDefaultAsync(p => p.Id == postingId, cancellationToken);
        if (posting is null)
        {
            return ServiceResult<ProposalResponse>.NotFound("Posting not found.");
        }

        await ApplyLazyExpiryAsync(posting, cancellationToken);

        if (posting.Status != PostingStatus.Published)
        {
            return ServiceResult<ProposalResponse>.BadRequest("This posting is not accepting proposals.");
        }

        if (string.Equals(posting.EmployerWallet, user.WalletAddress, StringComparison.OrdinalIgnoreCase))
        {
            return ServiceResult<ProposalResponse>.BadRequest("You cannot apply to your own posting.");
        }

        var validation = ProposalValidator.ValidateInput(request.CoverLetter, request.ProposedAmount, request.EstimatedTimeline);
        if (validation is not null)
        {
            return ServiceResult<ProposalResponse>.BadRequest(validation);
        }

        var existing = await _dbContext.Proposals
            .FirstOrDefaultAsync(
                p => p.PostingId == postingId &&
                    p.FreelancerWallet == user.WalletAddress &&
                    p.Status != ProposalStatus.Withdrawn,
                cancellationToken);
        if (existing is not null)
        {
            return ServiceResult<ProposalResponse>.Conflict("You already have an active proposal for this posting.");
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

        var response = await _proposalMapper.ToProposalResponseAsync(proposal, posting, cancellationToken);
        return ServiceResult<ProposalResponse>.Success(response);
    }

    public async Task<ServiceResult<ProposalResponse>> UpdateAsync(
        User user,
        int id,
        UpdateProposalRequest request,
        CancellationToken cancellationToken)
    {
        var proposal = await _dbContext.Proposals.FirstOrDefaultAsync(p => p.Id == id, cancellationToken);
        if (proposal is null)
        {
            return ServiceResult<ProposalResponse>.NotFound("Proposal not found.");
        }

        if (!string.Equals(proposal.FreelancerWallet, user.WalletAddress, StringComparison.OrdinalIgnoreCase))
        {
            return ServiceResult<ProposalResponse>.Forbidden();
        }

        if (proposal.Status is ProposalStatus.Shortlisted or ProposalStatus.Selected or ProposalStatus.Rejected or ProposalStatus.Withdrawn or ProposalStatus.ConvertedToOffer)
        {
            return ServiceResult<ProposalResponse>.BadRequest("This proposal can no longer be edited.");
        }

        var nextAmount = request.ProposedAmount ?? proposal.ProposedAmount;
        var nextTimeline = request.EstimatedTimeline ?? proposal.EstimatedTimeline;
        var validation = ProposalValidator.ValidateInput(request.CoverLetter ?? proposal.CoverLetter, nextAmount, nextTimeline);
        if (validation is not null)
        {
            return ServiceResult<ProposalResponse>.BadRequest(validation);
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
        var response = await _proposalMapper.ToProposalResponseAsync(proposal, posting, cancellationToken);
        return ServiceResult<ProposalResponse>.Success(response);
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
}
