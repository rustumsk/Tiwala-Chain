using Microsoft.EntityFrameworkCore;

public sealed class ProposalMapper
{
    private readonly AppDbContext _dbContext;

    public ProposalMapper(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<List<ProposalResponse>> ToProposalResponsesAsync(
        List<Proposal> proposals,
        CancellationToken cancellationToken)
    {
        var postingMap = await _dbContext.JobPostings
            .Where(p => proposals.Select(x => x.PostingId).Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, cancellationToken);

        return await ToProposalResponsesAsync(proposals, postingMap, cancellationToken);
    }

    public async Task<List<ProposalResponse>> ToProposalResponsesAsync(
        List<Proposal> proposals,
        JobPosting posting,
        CancellationToken cancellationToken)
    {
        return await ToProposalResponsesAsync(
            proposals,
            new Dictionary<int, JobPosting> { [posting.Id] = posting },
            cancellationToken);
    }

    public async Task<ProposalResponse> ToProposalResponseAsync(
        Proposal proposal,
        JobPosting posting,
        CancellationToken cancellationToken)
    {
        var wallets = new[] { proposal.FreelancerWallet, posting.EmployerWallet };
        var displayNames = await _dbContext.Users
            .Where(u => wallets.Contains(u.WalletAddress))
            .ToDictionaryAsync(u => u.WalletAddress, u => u.DisplayName, cancellationToken);

        return ToProposalResponse(proposal, posting, displayNames);
    }

    public async Task<List<ProposalMessageResponse>> ToProposalMessageResponsesAsync(
        List<ProposalMessage> messages,
        CancellationToken cancellationToken)
    {
        if (messages.Count == 0)
        {
            return [];
        }

        var wallets = messages.Select(m => m.SenderWallet).Distinct().ToList();
        var displayNames = await _dbContext.Users
            .Where(u => wallets.Contains(u.WalletAddress))
            .ToDictionaryAsync(u => u.WalletAddress, u => u.DisplayName, cancellationToken);

        return messages
            .Select(message => ToProposalMessageResponse(message, displayNames))
            .ToList();
    }

    public async Task<ProposalMessageResponse> ToProposalMessageResponseAsync(
        ProposalMessage message,
        CancellationToken cancellationToken)
    {
        var displayNames = await _dbContext.Users
            .Where(u => u.WalletAddress == message.SenderWallet)
            .ToDictionaryAsync(u => u.WalletAddress, u => u.DisplayName, cancellationToken);

        return ToProposalMessageResponse(message, displayNames);
    }

    private async Task<List<ProposalResponse>> ToProposalResponsesAsync(
        List<Proposal> proposals,
        IReadOnlyDictionary<int, JobPosting> postingMap,
        CancellationToken cancellationToken)
    {
        if (proposals.Count == 0)
        {
            return [];
        }

        var wallets = proposals
            .Select(p => p.FreelancerWallet)
            .Concat(postingMap.Values.Select(p => p.EmployerWallet))
            .Distinct()
            .ToList();

        var displayNames = await _dbContext.Users
            .Where(u => wallets.Contains(u.WalletAddress))
            .ToDictionaryAsync(u => u.WalletAddress, u => u.DisplayName, cancellationToken);

        return proposals
            .Select(proposal => ToProposalResponse(proposal, postingMap[proposal.PostingId], displayNames))
            .ToList();
    }

    private static ProposalResponse ToProposalResponse(
        Proposal proposal,
        JobPosting posting,
        IReadOnlyDictionary<string, string?> displayNames)
    {
        return new ProposalResponse(
            proposal.Id,
            proposal.PostingId,
            posting.Title,
            posting.Status.ToString(),
            posting.EmployerWallet,
            displayNames.GetValueOrDefault(posting.EmployerWallet),
            proposal.FreelancerWallet,
            displayNames.GetValueOrDefault(proposal.FreelancerWallet),
            proposal.CoverLetter,
            proposal.ProposedAmount,
            proposal.EstimatedTimeline,
            JsonFieldSerializer.DeserializeStringList(proposal.PortfolioLinksJson),
            proposal.RelevantExperience,
            JsonFieldSerializer.DeserializeStringMap(proposal.ScreeningAnswersJson),
            proposal.Status.ToString(),
            proposal.RejectionReason,
            proposal.CreatedAt,
            proposal.UpdatedAt,
            proposal.ViewedAt,
            proposal.ConvertedJobId,
            proposal.CvAttachmentKey is not null);
    }

    private static ProposalMessageResponse ToProposalMessageResponse(
        ProposalMessage message,
        IReadOnlyDictionary<string, string?> displayNames)
    {
        return new ProposalMessageResponse(
            message.Id,
            message.ProposalId,
            message.SenderWallet,
            displayNames.GetValueOrDefault(message.SenderWallet),
            message.Body,
            message.MessageType,
            message.CreatedAt,
            message.ReadAt);
    }
}
