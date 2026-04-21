using System.Text.Json;
using Microsoft.EntityFrameworkCore;

public sealed class ProposalWorkflowService
{
    private readonly AppDbContext _dbContext;
    private readonly ProposalMapper _proposalMapper;

    public ProposalWorkflowService(AppDbContext dbContext, ProposalMapper proposalMapper)
    {
        _dbContext = dbContext;
        _proposalMapper = proposalMapper;
    }

    public async Task<ProposalServiceResult<ProposalResponse>> WithdrawAsync(
        User user,
        int id,
        CancellationToken cancellationToken)
    {
        var proposal = await _dbContext.Proposals.FirstOrDefaultAsync(p => p.Id == id, cancellationToken);
        if (proposal is null)
        {
            return ProposalServiceResult<ProposalResponse>.NotFound("Proposal not found.");
        }

        if (!string.Equals(proposal.FreelancerWallet, user.WalletAddress, StringComparison.OrdinalIgnoreCase))
        {
            return ProposalServiceResult<ProposalResponse>.Forbidden();
        }

        if (proposal.Status is ProposalStatus.Rejected or ProposalStatus.Withdrawn or ProposalStatus.ConvertedToOffer or ProposalStatus.Selected)
        {
            return ProposalServiceResult<ProposalResponse>.BadRequest("This proposal cannot be withdrawn.");
        }

        var posting = await _dbContext.JobPostings.FirstOrDefaultAsync(p => p.Id == proposal.PostingId, cancellationToken);
        if (posting is null)
        {
            return ProposalServiceResult<ProposalResponse>.NotFound("Posting not found.");
        }

        proposal.Status = ProposalStatus.Withdrawn;
        proposal.UpdatedAt = DateTime.UtcNow;
        AddSystemMessage(proposal.Id, "Freelancer withdrew this proposal.");
        AddNotification(
            posting.EmployerWallet,
            "proposal_withdrawn",
            $"A proposal for \"{posting.Title}\" was withdrawn.",
            new Dictionary<string, object?>
            {
                ["postingId"] = posting.Id,
                ["proposalId"] = proposal.Id,
            });

        await _dbContext.SaveChangesAsync(cancellationToken);
        var response = await _proposalMapper.ToProposalResponseAsync(proposal, posting, cancellationToken);
        return ProposalServiceResult<ProposalResponse>.Success(response);
    }

    public Task<ProposalServiceResult<ProposalResponse>> ShortlistAsync(
        User user,
        int id,
        CancellationToken cancellationToken)
    {
        return UpdateStatusAsync(
            user,
            id,
            ProposalStatus.Shortlisted,
            "proposal_shortlisted",
            "Your proposal was shortlisted.",
            cancellationToken);
    }

    public Task<ProposalServiceResult<ProposalResponse>> RejectAsync(
        User user,
        int id,
        CancellationToken cancellationToken)
    {
        return UpdateStatusAsync(
            user,
            id,
            ProposalStatus.Rejected,
            "proposal_rejected",
            "Your proposal was not selected.",
            cancellationToken);
    }

    public async Task<ProposalServiceResult<ProposalResponse>> SelectAsync(
        User user,
        int id,
        CancellationToken cancellationToken)
    {
        var proposal = await _dbContext.Proposals.FirstOrDefaultAsync(p => p.Id == id, cancellationToken);
        if (proposal is null)
        {
            return ProposalServiceResult<ProposalResponse>.NotFound("Proposal not found.");
        }

        var posting = await _dbContext.JobPostings.FirstOrDefaultAsync(p => p.Id == proposal.PostingId, cancellationToken);
        if (posting is null)
        {
            return ProposalServiceResult<ProposalResponse>.NotFound("Posting not found.");
        }

        if (!ProposalPolicy.CanManage(user, posting))
        {
            return ProposalServiceResult<ProposalResponse>.Forbidden();
        }

        if (posting.Status != PostingStatus.Published)
        {
            return ProposalServiceResult<ProposalResponse>.BadRequest("Only published postings can select a proposal.");
        }

        if (proposal.Status is ProposalStatus.Rejected or ProposalStatus.Withdrawn or ProposalStatus.ConvertedToOffer)
        {
            return ProposalServiceResult<ProposalResponse>.BadRequest("This proposal cannot be selected.");
        }

        var siblings = await _dbContext.Proposals
            .Where(p => p.PostingId == posting.Id && p.Id != proposal.Id)
            .ToListAsync(cancellationToken);

        foreach (var sibling in siblings)
        {
            if (sibling.Status is ProposalStatus.Rejected or ProposalStatus.Withdrawn or ProposalStatus.ConvertedToOffer)
            {
                continue;
            }

            sibling.Status = ProposalStatus.Rejected;
            sibling.RejectionReason = "Another proposal was selected.";
            sibling.UpdatedAt = DateTime.UtcNow;
            AddSystemMessage(sibling.Id, "This proposal was rejected because another proposal was selected.");
            AddNotification(
                sibling.FreelancerWallet,
                "proposal_rejected",
                $"Your proposal for \"{posting.Title}\" was not selected.",
                new Dictionary<string, object?>
                {
                    ["postingId"] = posting.Id,
                    ["proposalId"] = sibling.Id,
                });
        }

        proposal.Status = ProposalStatus.Selected;
        proposal.RejectionReason = null;
        proposal.UpdatedAt = DateTime.UtcNow;
        AddSystemMessage(proposal.Id, "Proposal selected. Create a formal offer to continue.");
        AddNotification(
            proposal.FreelancerWallet,
            "proposal_selected",
            $"Your proposal for \"{posting.Title}\" was selected.",
            new Dictionary<string, object?>
            {
                ["postingId"] = posting.Id,
                ["proposalId"] = proposal.Id,
            });

        await _dbContext.SaveChangesAsync(cancellationToken);
        var response = await _proposalMapper.ToProposalResponseAsync(proposal, posting, cancellationToken);
        return ProposalServiceResult<ProposalResponse>.Success(response);
    }

    private async Task<ProposalServiceResult<ProposalResponse>> UpdateStatusAsync(
        User user,
        int id,
        ProposalStatus status,
        string notificationType,
        string notificationMessage,
        CancellationToken cancellationToken)
    {
        var proposal = await _dbContext.Proposals.FirstOrDefaultAsync(p => p.Id == id, cancellationToken);
        if (proposal is null)
        {
            return ProposalServiceResult<ProposalResponse>.NotFound("Proposal not found.");
        }

        var posting = await _dbContext.JobPostings.FirstOrDefaultAsync(p => p.Id == proposal.PostingId, cancellationToken);
        if (posting is null)
        {
            return ProposalServiceResult<ProposalResponse>.NotFound("Posting not found.");
        }

        if (!ProposalPolicy.CanManage(user, posting))
        {
            return ProposalServiceResult<ProposalResponse>.Forbidden();
        }

        if (proposal.Status is ProposalStatus.Withdrawn or ProposalStatus.ConvertedToOffer)
        {
            return ProposalServiceResult<ProposalResponse>.BadRequest("This proposal can no longer be updated.");
        }

        proposal.Status = status;
        proposal.RejectionReason = status == ProposalStatus.Rejected ? "Employer rejected this proposal." : null;
        proposal.UpdatedAt = DateTime.UtcNow;
        AddSystemMessage(
            proposal.Id,
            status == ProposalStatus.Shortlisted
                ? "Proposal shortlisted."
                : "Proposal rejected.");
        AddNotification(
            proposal.FreelancerWallet,
            notificationType,
            $"{notificationMessage} ({posting.Title})",
            new Dictionary<string, object?>
            {
                ["postingId"] = posting.Id,
                ["proposalId"] = proposal.Id,
            });

        await _dbContext.SaveChangesAsync(cancellationToken);
        var response = await _proposalMapper.ToProposalResponseAsync(proposal, posting, cancellationToken);
        return ProposalServiceResult<ProposalResponse>.Success(response);
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
}
