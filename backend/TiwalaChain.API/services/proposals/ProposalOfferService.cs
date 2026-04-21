using System.Text.Json;
using Microsoft.EntityFrameworkCore;

public sealed class ProposalOfferService
{
    private readonly AppDbContext _dbContext;

    public ProposalOfferService(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<ProposalServiceResult<JobResponse>> ConvertToOfferAsync(
        User user,
        int id,
        ConvertProposalToOfferRequest request,
        CancellationToken cancellationToken)
    {
        if (!user.IsApproved)
        {
            return ProposalServiceResult<JobResponse>.Forbidden("Your account is pending admin approval.");
        }

        var proposal = await _dbContext.Proposals.FirstOrDefaultAsync(p => p.Id == id, cancellationToken);
        if (proposal is null)
        {
            return ProposalServiceResult<JobResponse>.NotFound("Proposal not found.");
        }

        var posting = await _dbContext.JobPostings.FirstOrDefaultAsync(p => p.Id == proposal.PostingId, cancellationToken);
        if (posting is null)
        {
            return ProposalServiceResult<JobResponse>.NotFound("Posting not found.");
        }

        if (!ProposalPolicy.CanManage(user, posting))
        {
            return ProposalServiceResult<JobResponse>.Forbidden();
        }

        if (proposal.Status == ProposalStatus.ConvertedToOffer && proposal.ConvertedJobId.HasValue)
        {
            var existingJob = await _dbContext.Jobs.FirstOrDefaultAsync(j => j.Id == proposal.ConvertedJobId.Value, cancellationToken);
            if (existingJob is not null)
            {
                return ProposalServiceResult<JobResponse>.Success(JobMapper.ToResponse(existingJob));
            }
        }

        if (proposal.Status != ProposalStatus.Selected)
        {
            return ProposalServiceResult<JobResponse>.BadRequest("Only selected proposals can be converted to an offer.");
        }

        var normalizedHash = HashNormalizer.NormalizeSha256Hash(request.ContractHash);
        if (string.IsNullOrWhiteSpace(request.ContractKey) || normalizedHash is null)
        {
            return ProposalServiceResult<JobResponse>.BadRequest("Contract key and a valid contract hash are required.");
        }

        var amount = request.AmountUsdt ?? proposal.ProposedAmount;
        if (amount <= 0)
        {
            return ProposalServiceResult<JobResponse>.BadRequest("Offer amount must be greater than 0.");
        }

        var title = string.IsNullOrWhiteSpace(request.Title) ? posting.Title : request.Title.Trim();
        if (title.Length is < 5 or > 200)
        {
            return ProposalServiceResult<JobResponse>.BadRequest("Title must be between 5 and 200 characters.");
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

        return ProposalServiceResult<JobResponse>.Success(JobMapper.ToResponse(job));
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
