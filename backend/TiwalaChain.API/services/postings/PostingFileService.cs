using Microsoft.EntityFrameworkCore;

public sealed class PostingFileService
{
    private readonly AppDbContext _dbContext;
    private readonly S3StorageService _storage;

    public PostingFileService(AppDbContext dbContext, S3StorageService storage)
    {
        _dbContext = dbContext;
        _storage = storage;
    }

    public async Task<PostingServiceResult<PostingFileDownload>> GetBriefAsync(
        User user,
        int id,
        CancellationToken cancellationToken)
    {
        var posting = await _dbContext.JobPostings.FirstOrDefaultAsync(p => p.Id == id, cancellationToken);
        if (posting is null)
        {
            return PostingServiceResult<PostingFileDownload>.NotFound("Posting not found.");
        }

        await ApplyLazyExpiryAsync(posting, cancellationToken);

        if (string.IsNullOrWhiteSpace(posting.BriefAttachmentKey))
        {
            return PostingServiceResult<PostingFileDownload>.NotFound("No brief attachment found.");
        }

        if (!PostingPolicy.CanAccessBrief(user, posting))
        {
            return PostingServiceResult<PostingFileDownload>.Forbidden();
        }

        var (stream, contentType) = await _storage.GetAsync(posting.BriefAttachmentKey, cancellationToken);
        return PostingServiceResult<PostingFileDownload>.Success(new PostingFileDownload(
            stream,
            contentType,
            $"posting-{posting.Id}-brief"));
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

public sealed record PostingFileDownload(Stream Stream, string ContentType, string FileName);
