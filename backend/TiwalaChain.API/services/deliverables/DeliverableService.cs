using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

public sealed class DeliverableService
{
    private readonly AppDbContext _dbContext;
    private readonly S3StorageService _storage;

    public DeliverableService(AppDbContext dbContext, S3StorageService storage)
    {
        _dbContext = dbContext;
        _storage = storage;
    }

    public async Task<DeliverableResult<List<DeliverableResponse>>> ListByContractHashAsync(
        User user,
        string hash,
        CancellationToken cancellationToken)
    {
        var normalizedHash = HashNormalizer.NormalizeSha256Hash(hash);
        if (normalizedHash is null)
        {
            return DeliverableResult<List<DeliverableResponse>>.BadRequest("Invalid contract hash.");
        }

        var job = await FindAccessibleJobByHashAsync(user, normalizedHash, cancellationToken);
        if (job is null)
        {
            return DeliverableResult<List<DeliverableResponse>>.NotFound("Job not found for this contract.");
        }

        var deliverables = await _dbContext.Deliverables
            .Where(d => d.JobId == job.Id)
            .Include(d => d.Attachments)
            .OrderByDescending(d => d.CreatedAt)
            .ToListAsync(cancellationToken);

        return DeliverableResult<List<DeliverableResponse>>.Success(
            deliverables.Select(DeliverableMapper.ToResponse).ToList());
    }

    public async Task<DeliverableResult<DeliverableResponse>> SubmitByContractHashAsync(
        User user,
        string hash,
        string? note,
        int? deliverableId,
        string? linksJson,
        List<IFormFile>? files,
        CancellationToken cancellationToken)
    {
        var normalizedHash = HashNormalizer.NormalizeSha256Hash(hash);
        if (normalizedHash is null)
        {
            return DeliverableResult<DeliverableResponse>.BadRequest("Invalid contract hash.");
        }

        var job = await _dbContext.Jobs
            .OrderByDescending(j => j.CreatedAt)
            .FirstOrDefaultAsync(j =>
                j.ContractHash == normalizedHash &&
                (j.EmployerWallet == user.WalletAddress || j.FreelancerWallet == user.WalletAddress),
                cancellationToken);
        if (job is null)
        {
            return DeliverableResult<DeliverableResponse>.NotFound("Job not found for this contract.");
        }

        if (!string.Equals(job.FreelancerWallet, user.WalletAddress, StringComparison.OrdinalIgnoreCase))
        {
            return DeliverableResult<DeliverableResponse>.Forbidden();
        }

        if (job.Status != JobStatus.Accepted)
        {
            return DeliverableResult<DeliverableResponse>.BadRequest("Job is not accepted yet.");
        }

        var attachmentsResult = await BuildAttachmentsAsync(job.Id, linksJson, files, cancellationToken);
        if (!attachmentsResult.IsSuccess)
        {
            return DeliverableResult<DeliverableResponse>.BadRequest(attachmentsResult.Error!);
        }

        var normalizedNote = string.IsNullOrWhiteSpace(note) ? null : note.Trim();
        var attachments = attachmentsResult.Value!;

        if (deliverableId is not null)
        {
            return await UpdateExistingDeliverableAsync(
                job.Id,
                deliverableId.Value,
                normalizedNote,
                attachments,
                cancellationToken);
        }

        var deliverable = new Deliverable
        {
            JobId = job.Id,
            Note = normalizedNote,
            Status = DeliverableStatus.PendingReview,
            Attachments = attachments,
        };

        _dbContext.Deliverables.Add(deliverable);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return DeliverableResult<DeliverableResponse>.Success(DeliverableMapper.ToResponse(deliverable));
    }

    public async Task<DeliverableResult<DeliverableResponse>> ApproveAsync(
        User user,
        int id,
        ReviewRequest request,
        CancellationToken cancellationToken)
    {
        return await ReviewAsync(user, id, request.Note, DeliverableStatus.Approved, cancellationToken);
    }

    public async Task<DeliverableResult<DeliverableResponse>> RequestRevisionAsync(
        User user,
        int id,
        ReviewRequest request,
        CancellationToken cancellationToken)
    {
        return await ReviewAsync(user, id, request.Note, DeliverableStatus.RevisionRequested, cancellationToken);
    }

    public async Task<DeliverableResult<DeliverableFileDownload>> DownloadAttachmentAsync(
        User user,
        int attachmentId,
        CancellationToken cancellationToken)
    {
        var attachment = await _dbContext.DeliverableAttachments
            .Include(a => a.Deliverable)
            .ThenInclude(d => d.Job)
            .FirstOrDefaultAsync(a => a.Id == attachmentId, cancellationToken);
        if (attachment is null)
        {
            return DeliverableResult<DeliverableFileDownload>.NotFound("Attachment not found.");
        }

        if (attachment.Type != DeliverableAttachmentType.File)
        {
            return DeliverableResult<DeliverableFileDownload>.BadRequest("Not a file attachment.");
        }

        var wallet = user.WalletAddress;
        if (user.Role != UserRole.Admin &&
            !string.Equals(attachment.Deliverable.Job.EmployerWallet, wallet, StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(attachment.Deliverable.Job.FreelancerWallet, wallet, StringComparison.OrdinalIgnoreCase))
        {
            return DeliverableResult<DeliverableFileDownload>.Forbidden();
        }

        var (stream, contentType) = await _storage.GetAsync(attachment.Value, cancellationToken);
        return DeliverableResult<DeliverableFileDownload>.Success(
            new DeliverableFileDownload(stream, contentType, attachment.FileName ?? "deliverable-file"));
    }

    private async Task<DeliverableResult<DeliverableResponse>> UpdateExistingDeliverableAsync(
        int jobId,
        int deliverableId,
        string? note,
        List<DeliverableAttachment> attachments,
        CancellationToken cancellationToken)
    {
        var existing = await _dbContext.Deliverables
            .Include(d => d.Attachments)
            .FirstOrDefaultAsync(
                d => d.Id == deliverableId && d.JobId == jobId,
                cancellationToken);
        if (existing is null)
        {
            return DeliverableResult<DeliverableResponse>.NotFound("Deliverable not found for this job.");
        }

        if (existing.Status != DeliverableStatus.RevisionRequested &&
            existing.Status != DeliverableStatus.PendingReview)
        {
            return DeliverableResult<DeliverableResponse>.BadRequest("This deliverable cannot be updated.");
        }

        _dbContext.DeliverableAttachments.RemoveRange(existing.Attachments);
        existing.Attachments = attachments;
        existing.Note = note;
        existing.Status = DeliverableStatus.PendingReview;
        existing.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync(cancellationToken);

        return DeliverableResult<DeliverableResponse>.Success(DeliverableMapper.ToResponse(existing));
    }

    private async Task<DeliverableResult<DeliverableResponse>> ReviewAsync(
        User user,
        int id,
        string? note,
        DeliverableStatus status,
        CancellationToken cancellationToken)
    {
        var deliverable = await _dbContext.Deliverables
            .Include(d => d.Job)
            .Include(d => d.Attachments)
            .FirstOrDefaultAsync(d => d.Id == id, cancellationToken);
        if (deliverable is null)
        {
            return DeliverableResult<DeliverableResponse>.NotFound("Deliverable not found.");
        }

        if (!string.Equals(deliverable.Job.EmployerWallet, user.WalletAddress, StringComparison.OrdinalIgnoreCase))
        {
            return DeliverableResult<DeliverableResponse>.Forbidden();
        }

        if (deliverable.Status != DeliverableStatus.PendingReview)
        {
            return DeliverableResult<DeliverableResponse>.BadRequest("Deliverable is not pending review.");
        }

        deliverable.Status = status;
        deliverable.ReviewNote = string.IsNullOrWhiteSpace(note) ? null : note.Trim();
        deliverable.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync(cancellationToken);

        return DeliverableResult<DeliverableResponse>.Success(DeliverableMapper.ToResponse(deliverable));
    }

    private async Task<AttachmentBuildResult> BuildAttachmentsAsync(
        int jobId,
        string? linksJson,
        List<IFormFile>? files,
        CancellationToken cancellationToken)
    {
        var attachments = new List<DeliverableAttachment>();

        if (!string.IsNullOrWhiteSpace(linksJson))
        {
            try
            {
                var links = JsonSerializer.Deserialize<List<string>>(linksJson) ?? [];
                foreach (var link in links.Select(l => l?.Trim()).Where(l => !string.IsNullOrWhiteSpace(l)))
                {
                    attachments.Add(new DeliverableAttachment
                    {
                        Type = DeliverableAttachmentType.Link,
                        Value = link!,
                    });
                }
            }
            catch (JsonException)
            {
                return AttachmentBuildResult.Failure("Invalid links payload.");
            }
        }

        if (files is not null)
        {
            foreach (var file in files.Where(f => f is not null && f.Length > 0))
            {
                var attachment = await BuildFileAttachmentAsync(jobId, file, cancellationToken);
                attachments.Add(attachment);
            }
        }

        return AttachmentBuildResult.Success(attachments);
    }

    private async Task<DeliverableAttachment> BuildFileAttachmentAsync(
        int jobId,
        IFormFile file,
        CancellationToken cancellationToken)
    {
        await using var input = file.OpenReadStream();
        await using var buffer = new MemoryStream();
        await input.CopyToAsync(buffer, cancellationToken);
        buffer.Position = 0;

        string hashHex;
        using (var sha = SHA256.Create())
        {
            var bytes = sha.ComputeHash(buffer.ToArray());
            var sb = new StringBuilder(bytes.Length * 2);
            foreach (var b in bytes)
            {
                sb.Append(b.ToString("x2"));
            }

            hashHex = sb.ToString();
        }

        buffer.Position = 0;
        var safeName = Path.GetFileName(file.FileName);
        var key = $"deliverables/job-{jobId}/{DateTime.UtcNow:yyyyMMddHHmmssfff}-{Guid.NewGuid():N}-{safeName}";
        await _storage.UploadAsync(buffer, key, file.ContentType, cancellationToken);

        return new DeliverableAttachment
        {
            Type = DeliverableAttachmentType.File,
            Value = key,
            FileName = safeName,
            ContentType = file.ContentType,
            SizeBytes = file.Length,
            Sha256Hash = hashHex,
        };
    }

    private async Task<Job?> FindAccessibleJobByHashAsync(
        User user,
        string normalizedHash,
        CancellationToken cancellationToken)
    {
        IQueryable<Job> query = _dbContext.Jobs.OrderByDescending(j => j.CreatedAt);
        if (user.Role == UserRole.Admin)
        {
            return await query.FirstOrDefaultAsync(j => j.ContractHash == normalizedHash, cancellationToken);
        }

        var wallet = user.WalletAddress;
        return await query.FirstOrDefaultAsync(
            j => j.ContractHash == normalizedHash &&
                 (j.EmployerWallet == wallet || j.FreelancerWallet == wallet),
            cancellationToken);
    }
}

public sealed record DeliverableFileDownload(Stream Stream, string ContentType, string FileName);

public sealed class DeliverableResult<T>
{
    private DeliverableResult(DeliverableResultStatus status, T? value, string? error)
    {
        Status = status;
        Value = value;
        Error = error;
    }

    public DeliverableResultStatus Status { get; }
    public T? Value { get; }
    public string? Error { get; }

    public static DeliverableResult<T> Success(T value) => new(DeliverableResultStatus.Success, value, null);
    public static DeliverableResult<T> BadRequest(string error) => new(DeliverableResultStatus.BadRequest, default, error);
    public static DeliverableResult<T> NotFound(string error) => new(DeliverableResultStatus.NotFound, default, error);
    public static DeliverableResult<T> Forbidden() => new(DeliverableResultStatus.Forbidden, default, null);
}

public enum DeliverableResultStatus
{
    Success,
    BadRequest,
    NotFound,
    Forbidden,
}

internal sealed class AttachmentBuildResult
{
    private AttachmentBuildResult(bool isSuccess, List<DeliverableAttachment>? value, string? error)
    {
        IsSuccess = isSuccess;
        Value = value;
        Error = error;
    }

    public bool IsSuccess { get; }
    public List<DeliverableAttachment>? Value { get; }
    public string? Error { get; }

    public static AttachmentBuildResult Success(List<DeliverableAttachment> value) => new(true, value, null);
    public static AttachmentBuildResult Failure(string error) => new(false, null, error);
}
