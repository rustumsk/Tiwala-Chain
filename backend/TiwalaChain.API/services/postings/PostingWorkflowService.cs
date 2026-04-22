using Microsoft.EntityFrameworkCore;

public sealed class PostingWorkflowService
{
    private readonly AppDbContext _dbContext;
    private readonly PostingMapper _postingMapper;

    public PostingWorkflowService(AppDbContext dbContext, PostingMapper postingMapper)
    {
        _dbContext = dbContext;
        _postingMapper = postingMapper;
    }

    public Task<ServiceResult<PostingResponse>> PublishAsync(
        User user,
        int id,
        CancellationToken cancellationToken)
    {
        return ChangeStatusAsync(user, id, PostingStatus.Published, cancellationToken);
    }

    public Task<ServiceResult<PostingResponse>> CloseAsync(
        User user,
        int id,
        CancellationToken cancellationToken)
    {
        return ChangeStatusAsync(user, id, PostingStatus.Closed, cancellationToken);
    }

    public Task<ServiceResult<PostingResponse>> ReopenAsync(
        User user,
        int id,
        CancellationToken cancellationToken)
    {
        return ChangeStatusAsync(user, id, PostingStatus.Published, cancellationToken, allowFromClosed: true);
    }

    private async Task<ServiceResult<PostingResponse>> ChangeStatusAsync(
        User user,
        int id,
        PostingStatus nextStatus,
        CancellationToken cancellationToken,
        bool allowFromClosed = false)
    {
        var posting = await _dbContext.JobPostings.FirstOrDefaultAsync(p => p.Id == id, cancellationToken);
        if (posting is null)
        {
            return ServiceResult<PostingResponse>.NotFound("Posting not found.");
        }

        await ApplyLazyExpiryAsync(posting, cancellationToken);

        if (!PostingPolicy.CanManage(user, posting))
        {
            return ServiceResult<PostingResponse>.Forbidden();
        }

        if (nextStatus == PostingStatus.Published)
        {
            if (posting.Status == PostingStatus.Published)
            {
                var currentResponse = await _postingMapper.ToPostingResponseAsync(posting, cancellationToken);
                return ServiceResult<PostingResponse>.Success(currentResponse);
            }

            if (posting.Status != PostingStatus.Draft && !(allowFromClosed && posting.Status == PostingStatus.Closed))
            {
                return ServiceResult<PostingResponse>.BadRequest("This posting cannot be published.");
            }

            posting.Status = PostingStatus.Published;
            posting.PublishedAt ??= DateTime.UtcNow;
            posting.ClosedAt = null;
        }
        else if (nextStatus == PostingStatus.Closed)
        {
            if (posting.Status != PostingStatus.Published)
            {
                return ServiceResult<PostingResponse>.BadRequest("Only published postings can be closed.");
            }

            posting.Status = PostingStatus.Closed;
            posting.ClosedAt = DateTime.UtcNow;
        }

        posting.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync(cancellationToken);

        var response = await _postingMapper.ToPostingResponseAsync(posting, cancellationToken);
        return ServiceResult<PostingResponse>.Success(response);
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
}
