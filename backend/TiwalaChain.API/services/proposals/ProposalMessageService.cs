using System.Text.Json;
using Microsoft.EntityFrameworkCore;

public sealed class ProposalMessageService
{
    private readonly AppDbContext _dbContext;
    private readonly ProposalMapper _proposalMapper;

    public ProposalMessageService(AppDbContext dbContext, ProposalMapper proposalMapper)
    {
        _dbContext = dbContext;
        _proposalMapper = proposalMapper;
    }

    public async Task<ProposalServiceResult<List<ProposalMessageResponse>>> GetMessagesAsync(
        User user,
        int proposalId,
        CancellationToken cancellationToken)
    {
        var proposal = await _dbContext.Proposals.FirstOrDefaultAsync(p => p.Id == proposalId, cancellationToken);
        if (proposal is null)
        {
            return ProposalServiceResult<List<ProposalMessageResponse>>.NotFound("Proposal not found.");
        }

        var posting = await _dbContext.JobPostings.FirstOrDefaultAsync(p => p.Id == proposal.PostingId, cancellationToken);
        if (posting is null)
        {
            return ProposalServiceResult<List<ProposalMessageResponse>>.NotFound("Posting not found.");
        }

        if (!ProposalPolicy.CanAccess(user, posting, proposal))
        {
            return ProposalServiceResult<List<ProposalMessageResponse>>.Forbidden();
        }

        var messages = await _dbContext.ProposalMessages
            .Where(m => m.ProposalId == proposalId)
            .OrderBy(m => m.CreatedAt)
            .ToListAsync(cancellationToken);

        var changed = false;
        foreach (var message in messages.Where(m => m.ReadAt is null && !string.Equals(m.SenderWallet, user.WalletAddress, StringComparison.OrdinalIgnoreCase)))
        {
            message.ReadAt = DateTime.UtcNow;
            changed = true;
        }

        if (changed)
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }

        var response = await _proposalMapper.ToProposalMessageResponsesAsync(messages, cancellationToken);
        return ProposalServiceResult<List<ProposalMessageResponse>>.Success(response);
    }

    public async Task<ProposalServiceResult<ProposalMessageResponse>> SendMessageAsync(
        User user,
        int proposalId,
        SendProposalMessageRequest request,
        CancellationToken cancellationToken)
    {
        if (!user.IsApproved)
        {
            return ProposalServiceResult<ProposalMessageResponse>.Forbidden("Your account is pending admin approval.");
        }

        if (string.IsNullOrWhiteSpace(request.Body) || request.Body.Trim().Length > 4000)
        {
            return ProposalServiceResult<ProposalMessageResponse>.BadRequest("Message body must be between 1 and 4000 characters.");
        }

        var proposal = await _dbContext.Proposals.FirstOrDefaultAsync(p => p.Id == proposalId, cancellationToken);
        if (proposal is null)
        {
            return ProposalServiceResult<ProposalMessageResponse>.NotFound("Proposal not found.");
        }

        var posting = await _dbContext.JobPostings.FirstOrDefaultAsync(p => p.Id == proposal.PostingId, cancellationToken);
        if (posting is null)
        {
            return ProposalServiceResult<ProposalMessageResponse>.NotFound("Posting not found.");
        }

        if (!ProposalPolicy.CanAccess(user, posting, proposal))
        {
            return ProposalServiceResult<ProposalMessageResponse>.Forbidden();
        }

        if (!ProposalPolicy.CanMessage(proposal.Status))
        {
            return ProposalServiceResult<ProposalMessageResponse>.BadRequest("This proposal thread is closed.");
        }

        var message = new ProposalMessage
        {
            ProposalId = proposal.Id,
            SenderWallet = user.WalletAddress,
            Body = request.Body.Trim(),
            MessageType = "user",
        };

        _dbContext.ProposalMessages.Add(message);

        var recipientWallet = string.Equals(user.WalletAddress, proposal.FreelancerWallet, StringComparison.OrdinalIgnoreCase)
            ? posting.EmployerWallet
            : proposal.FreelancerWallet;

        AddNotification(
            recipientWallet,
            "proposal_message",
            $"New message on proposal for \"{posting.Title}\".",
            new Dictionary<string, object?>
            {
                ["postingId"] = posting.Id,
                ["proposalId"] = proposal.Id,
            });

        await _dbContext.SaveChangesAsync(cancellationToken);
        var response = await _proposalMapper.ToProposalMessageResponseAsync(message, cancellationToken);
        return ProposalServiceResult<ProposalMessageResponse>.Success(response);
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

public sealed class ProposalServiceResult<T>
{
    private ProposalServiceResult(ProposalServiceResultStatus status, T? value, string? error)
    {
        Status = status;
        Value = value;
        Error = error;
    }

    public ProposalServiceResultStatus Status { get; }
    public T? Value { get; }
    public string? Error { get; }

    public static ProposalServiceResult<T> Success(T value) => new(ProposalServiceResultStatus.Success, value, null);
    public static ProposalServiceResult<T> BadRequest(string error) => new(ProposalServiceResultStatus.BadRequest, default, error);
    public static ProposalServiceResult<T> Conflict(string error) => new(ProposalServiceResultStatus.Conflict, default, error);
    public static ProposalServiceResult<T> NotFound(string error) => new(ProposalServiceResultStatus.NotFound, default, error);
    public static ProposalServiceResult<T> Forbidden(string? error = null) => new(ProposalServiceResultStatus.Forbidden, default, error);
}

public enum ProposalServiceResultStatus
{
    Success,
    BadRequest,
    Conflict,
    NotFound,
    Forbidden,
}
