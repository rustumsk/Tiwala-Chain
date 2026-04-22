using Microsoft.EntityFrameworkCore;

public sealed class ProposalFileService
{
    private readonly AppDbContext _dbContext;
    private readonly S3StorageService _storage;

    public ProposalFileService(AppDbContext dbContext, S3StorageService storage)
    {
        _dbContext = dbContext;
        _storage = storage;
    }

    public async Task<ServiceResult<ProposalFileDownload>> GetCvAsync(
        User user,
        int id,
        CancellationToken cancellationToken)
    {
        var proposal = await _dbContext.Proposals.FirstOrDefaultAsync(p => p.Id == id, cancellationToken);
        if (proposal is null)
        {
            return ServiceResult<ProposalFileDownload>.NotFound("Proposal not found.");
        }

        var posting = await _dbContext.JobPostings.FirstOrDefaultAsync(p => p.Id == proposal.PostingId, cancellationToken);
        if (posting is null)
        {
            return ServiceResult<ProposalFileDownload>.NotFound("Posting not found.");
        }

        if (!ProposalPolicy.CanAccess(user, posting, proposal))
        {
            return ServiceResult<ProposalFileDownload>.Forbidden();
        }

        if (string.IsNullOrWhiteSpace(proposal.CvAttachmentKey))
        {
            return ServiceResult<ProposalFileDownload>.NotFound("No CV attached to this proposal.");
        }

        var (stream, contentType) = await _storage.GetAsync(proposal.CvAttachmentKey, cancellationToken);
        return ServiceResult<ProposalFileDownload>.Success(new ProposalFileDownload(
            stream,
            contentType,
            $"proposal-{proposal.Id}-cv"));
    }
}

public sealed record ProposalFileDownload(Stream Stream, string ContentType, string FileName);
