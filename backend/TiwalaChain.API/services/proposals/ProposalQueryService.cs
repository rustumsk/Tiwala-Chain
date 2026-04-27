using System.Text.Json;
using Microsoft.EntityFrameworkCore;

public sealed class ProposalQueryService
{
    private readonly AppDbContext _dbContext;
    private readonly ProposalMapper _proposalMapper;

    public ProposalQueryService(AppDbContext dbContext, ProposalMapper proposalMapper)
    {
        _dbContext = dbContext;
        _proposalMapper = proposalMapper;
    }

    public async Task<ServiceResult<List<ProposalResponse>>> GetPostingProposalsAsync(
        User user,
        int postingId,
        CancellationToken cancellationToken)
    {
        var posting = await _dbContext.JobPostings.FirstOrDefaultAsync(p => p.Id == postingId, cancellationToken);
        if (posting is null)
        {
            return ServiceResult<List<ProposalResponse>>.NotFound("Posting not found.");
        }

        await ApplyLazyExpiryAsync(posting, cancellationToken);

        IQueryable<Proposal> query = _dbContext.Proposals
            .Where(p => p.PostingId == postingId)
            .OrderByDescending(p => p.CreatedAt);

        var isOwner = ProposalPolicy.IsPostingOwner(posting, user.WalletAddress);
        if (!isOwner && user.Role != UserRole.Admin)
        {
            query = query.Where(p => p.FreelancerWallet == user.WalletAddress);
        }

        var proposals = await query.ToListAsync(cancellationToken);

        if (isOwner)
        {
            await MarkSubmittedAsViewedAsync(proposals, posting, cancellationToken);
        }

        var response = await _proposalMapper.ToProposalResponsesAsync(proposals, posting, cancellationToken);
        return ServiceResult<List<ProposalResponse>>.Success(response);
    }

    public async Task<ServiceResult<List<ProposalResponse>>> GetMineAsync(
        User user,
        CancellationToken cancellationToken)
    {
        var proposals = await _dbContext.Proposals
            .Where(p => p.FreelancerWallet == user.WalletAddress)
            .OrderByDescending(p => p.CreatedAt)
            .ToListAsync(cancellationToken);

        var response = await _proposalMapper.ToProposalResponsesAsync(proposals, cancellationToken);
        return ServiceResult<List<ProposalResponse>>.Success(response);
    }

    public async Task<ServiceResult<ProposalStatsResponse>> GetMineStatsAsync(
        User user,
        CancellationToken cancellationToken)
    {
        var activeApplications = await _dbContext.Proposals.CountAsync(
            p => p.FreelancerWallet == user.WalletAddress &&
                p.Status != ProposalStatus.Rejected &&
                p.Status != ProposalStatus.Withdrawn &&
                p.Status != ProposalStatus.ConvertedToOffer,
            cancellationToken);

        var unreadReplies = await _dbContext.Notifications.CountAsync(
            n => n.RecipientWallet == user.WalletAddress &&
                !n.IsRead &&
                n.Type == "proposal_message",
            cancellationToken);

        return ServiceResult<ProposalStatsResponse>.Success(new ProposalStatsResponse(activeApplications, unreadReplies));
    }

    public async Task<ServiceResult<ProposalResponse>> GetAsync(
        User user,
        int id,
        CancellationToken cancellationToken)
    {
        var proposal = await _dbContext.Proposals.FirstOrDefaultAsync(p => p.Id == id, cancellationToken);
        if (proposal is null)
        {
            return ServiceResult<ProposalResponse>.NotFound("Proposal not found.");
        }

        var posting = await _dbContext.JobPostings.FirstOrDefaultAsync(p => p.Id == proposal.PostingId, cancellationToken);
        if (posting is null)
        {
            return ServiceResult<ProposalResponse>.NotFound("Posting not found.");
        }

        if (!ProposalPolicy.CanAccess(user, posting, proposal))
        {
            return ServiceResult<ProposalResponse>.Forbidden();
        }

        if (ProposalPolicy.IsPostingOwner(posting, user.WalletAddress) && proposal.Status == ProposalStatus.Submitted)
        {
            proposal.Status = ProposalStatus.Viewed;
            proposal.ViewedAt = DateTime.UtcNow;
            proposal.UpdatedAt = DateTime.UtcNow;
            AddNotification(
                proposal.FreelancerWallet,
                "proposal_viewed",
                $"Your proposal for \"{posting.Title}\" was viewed.",
                new Dictionary<string, object?>
                {
                    ["postingId"] = posting.Id,
                    ["proposalId"] = proposal.Id,
                });
            await _dbContext.SaveChangesAsync(cancellationToken);
        }

        var response = await _proposalMapper.ToProposalResponseAsync(proposal, posting, cancellationToken);
        return ServiceResult<ProposalResponse>.Success(response);
    }

    private async Task MarkSubmittedAsViewedAsync(
        IReadOnlyCollection<Proposal> proposals,
        JobPosting posting,
        CancellationToken cancellationToken)
    {
        var submitted = proposals
            .Where(p => p.Status == ProposalStatus.Submitted)
            .ToList();
        if (submitted.Count == 0)
        {
            return;
        }

        foreach (var proposal in submitted)
        {
            proposal.Status = ProposalStatus.Viewed;
            proposal.ViewedAt = DateTime.UtcNow;
            proposal.UpdatedAt = DateTime.UtcNow;
            AddNotification(
                proposal.FreelancerWallet,
                "proposal_viewed",
                $"Your proposal for \"{posting.Title}\" was viewed.",
                new Dictionary<string, object?>
                {
                    ["postingId"] = posting.Id,
                    ["proposalId"] = proposal.Id,
                });
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
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
