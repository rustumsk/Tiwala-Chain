using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

[ApiController]
[Route("api/[controller]")]
public sealed class DeliverablesController : ControllerBase
{
    private readonly AppDbContext _dbContext;
    private readonly S3StorageService _storage;

    public DeliverablesController(AppDbContext dbContext, S3StorageService storage)
    {
        _dbContext = dbContext;
        _storage = storage;
    }

    [Authorize]
    [HttpGet("by-hash/{hash}")]
    public async Task<ActionResult<List<DeliverableResponse>>> ListByContractHash(string hash, CancellationToken cancellationToken)
    {
        var user = await ResolveCurrentUser(cancellationToken);
        if (user is null) return Unauthorized("Invalid session.");

        var normalizedHash = NormalizeHash(hash);
        if (normalizedHash is null) return BadRequest("Invalid contract hash.");

        IQueryable<Job> query = _dbContext.Jobs.OrderByDescending(j => j.CreatedAt);
        Job? job;
        if (user.Role == UserRole.Admin)
        {
            job = await query.FirstOrDefaultAsync(j => j.ContractHash == normalizedHash, cancellationToken);
        }
        else
        {
            var wallet = user.WalletAddress;
            job = await query.FirstOrDefaultAsync(
                j => j.ContractHash == normalizedHash &&
                     (j.EmployerWallet == wallet || j.FreelancerWallet == wallet),
                cancellationToken);
        }
        if (job is null) return NotFound("Job not found for this contract.");

        var deliverables = await _dbContext.Deliverables
            .Where(d => d.JobId == job.Id)
            .Include(d => d.Attachments)
            .OrderByDescending(d => d.CreatedAt)
            .ToListAsync(cancellationToken);

        return Ok(deliverables.Select(ToResponse).ToList());
    }

    [Authorize]
    [HttpPost("by-hash/{hash}")]
    [DisableRequestSizeLimit]
    public async Task<ActionResult<DeliverableResponse>> SubmitByContractHash(
        string hash,
        [FromForm] string? note,
        [FromForm] int? deliverableId,
        [FromForm] string? linksJson,
        [FromForm] List<IFormFile>? files,
        CancellationToken cancellationToken)
    {
        var user = await ResolveCurrentUser(cancellationToken);
        if (user is null) return Unauthorized("Invalid session.");

        var normalizedHash = NormalizeHash(hash);
        if (normalizedHash is null) return BadRequest("Invalid contract hash.");

        var job = await _dbContext.Jobs
            .OrderByDescending(j => j.CreatedAt)
            .FirstOrDefaultAsync(j =>
                j.ContractHash == normalizedHash &&
                (j.EmployerWallet == user.WalletAddress || j.FreelancerWallet == user.WalletAddress),
                cancellationToken);
        if (job is null) return NotFound("Job not found for this contract.");

        // Only the freelancer can submit deliverables.
        if (job.FreelancerWallet != user.WalletAddress)
        {
            return Forbid();
        }

        if (job.Status != JobStatus.Accepted)
        {
            return BadRequest("Job is not accepted yet.");
        }

        var normalizedNote = string.IsNullOrWhiteSpace(note) ? null : note.Trim();

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
            catch
            {
                return BadRequest("Invalid links payload.");
            }
        }

        if (files is not null)
        {
            foreach (var file in files.Where(f => f is not null && f.Length > 0))
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
                    foreach (var b in bytes) sb.Append(b.ToString("x2"));
                    hashHex = sb.ToString();
                }

                buffer.Position = 0;
                var safeName = Path.GetFileName(file.FileName);
                var key = $"deliverables/job-{job.Id}/{DateTime.UtcNow:yyyyMMddHHmmssfff}-{Guid.NewGuid():N}-{safeName}";
                await _storage.UploadAsync(buffer, key, file.ContentType, cancellationToken);

                attachments.Add(new DeliverableAttachment
                {
                    Type = DeliverableAttachmentType.File,
                    Value = key,
                    FileName = safeName,
                    ContentType = file.ContentType,
                    SizeBytes = file.Length,
                    Sha256Hash = hashHex,
                });
            }
        }

        var latest = await _dbContext.Deliverables
            .Include(d => d.Attachments)
            .Where(d => d.JobId == job.Id)
            .OrderByDescending(d => d.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (deliverableId is not null)
        {
            var existing = await _dbContext.Deliverables
                .Include(d => d.Attachments)
                .FirstOrDefaultAsync(
                    d => d.Id == deliverableId.Value && d.JobId == job.Id,
                    cancellationToken);
            if (existing is null)
            {
                return NotFound("Deliverable not found for this job.");
            }

            if (existing.Status != DeliverableStatus.RevisionRequested &&
                existing.Status != DeliverableStatus.PendingReview)
            {
                return BadRequest("This deliverable cannot be updated.");
            }

            // Replace note + attachments
            _dbContext.DeliverableAttachments.RemoveRange(existing.Attachments);
            existing.Attachments = attachments;
            existing.Note = normalizedNote;
            existing.Status = DeliverableStatus.PendingReview;
            existing.UpdatedAt = DateTime.UtcNow;
            await _dbContext.SaveChangesAsync(cancellationToken);
            return Ok(ToResponse(existing));
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

        return Ok(ToResponse(deliverable));
    }

    [Authorize]
    [HttpPost("{id:int}/approve")]
    public async Task<ActionResult<DeliverableResponse>> Approve(int id, [FromBody] ReviewRequest request, CancellationToken cancellationToken)
    {
        var user = await ResolveCurrentUser(cancellationToken);
        if (user is null) return Unauthorized("Invalid session.");

        var deliverable = await _dbContext.Deliverables
            .Include(d => d.Job)
            .Include(d => d.Attachments)
            .FirstOrDefaultAsync(d => d.Id == id, cancellationToken);
        if (deliverable is null) return NotFound("Deliverable not found.");

        if (deliverable.Job.EmployerWallet != user.WalletAddress)
        {
            return Forbid();
        }

        if (deliverable.Status != DeliverableStatus.PendingReview)
        {
            return BadRequest("Deliverable is not pending review.");
        }

        deliverable.Status = DeliverableStatus.Approved;
        deliverable.ReviewNote = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim();
        deliverable.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync(cancellationToken);

        return Ok(ToResponse(deliverable));
    }

    [Authorize]
    [HttpPost("{id:int}/request-revision")]
    public async Task<ActionResult<DeliverableResponse>> RequestRevision(int id, [FromBody] ReviewRequest request, CancellationToken cancellationToken)
    {
        var user = await ResolveCurrentUser(cancellationToken);
        if (user is null) return Unauthorized("Invalid session.");

        var deliverable = await _dbContext.Deliverables
            .Include(d => d.Job)
            .Include(d => d.Attachments)
            .FirstOrDefaultAsync(d => d.Id == id, cancellationToken);
        if (deliverable is null) return NotFound("Deliverable not found.");

        if (deliverable.Job.EmployerWallet != user.WalletAddress)
        {
            return Forbid();
        }

        if (deliverable.Status != DeliverableStatus.PendingReview)
        {
            return BadRequest("Deliverable is not pending review.");
        }

        deliverable.Status = DeliverableStatus.RevisionRequested;
        deliverable.ReviewNote = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim();
        deliverable.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync(cancellationToken);

        return Ok(ToResponse(deliverable));
    }

    [Authorize]
    [HttpGet("files/{attachmentId:int}")]
    public async Task<IActionResult> DownloadAttachment(int attachmentId, CancellationToken cancellationToken)
    {
        var user = await ResolveCurrentUser(cancellationToken);
        if (user is null) return Unauthorized("Invalid session.");

        var attachment = await _dbContext.DeliverableAttachments
            .Include(a => a.Deliverable)
            .ThenInclude(d => d.Job)
            .FirstOrDefaultAsync(a => a.Id == attachmentId, cancellationToken);
        if (attachment is null) return NotFound("Attachment not found.");

        if (attachment.Type != DeliverableAttachmentType.File)
        {
            return BadRequest("Not a file attachment.");
        }

        var wallet = user.WalletAddress;
        if (user.Role != UserRole.Admin &&
            attachment.Deliverable.Job.EmployerWallet != wallet &&
            attachment.Deliverable.Job.FreelancerWallet != wallet)
        {
            return Forbid();
        }

        var (stream, contentType) = await _storage.GetAsync(attachment.Value, cancellationToken);
        return File(stream, contentType, attachment.FileName ?? "deliverable-file");
    }

    private async Task<User?> ResolveCurrentUser(CancellationToken cancellationToken)
    {
        var subjectClaim = User.FindFirstValue(JwtRegisteredClaimNames.Sub)
            ?? User.FindFirstValue(ClaimTypes.NameIdentifier);

        if (!int.TryParse(subjectClaim, out var userId))
        {
            return null;
        }

        return await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);
    }

    private static DeliverableResponse ToResponse(Deliverable deliverable)
    {
        return new DeliverableResponse(
            deliverable.Id,
            deliverable.JobId,
            deliverable.Note,
            deliverable.Status.ToString(),
            deliverable.ReviewNote,
            deliverable.CreatedAt,
            deliverable.UpdatedAt,
            deliverable.Attachments.Select(a =>
                new DeliverableAttachmentResponse(
                    a.Id,
                    a.Type.ToString(),
                    a.Type == DeliverableAttachmentType.Link ? a.Value : null,
                    a.Type == DeliverableAttachmentType.File ? a.FileName : null,
                    a.Type == DeliverableAttachmentType.File ? a.ContentType : null,
                    a.Type == DeliverableAttachmentType.File ? a.SizeBytes : null
                )).ToList()
        );
    }

    private static string? NormalizeHash(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var trimmed = value.Trim().ToLowerInvariant();
        if (trimmed.StartsWith("0x", StringComparison.Ordinal))
        {
            trimmed = trimmed[2..];
        }

        return Regex.IsMatch(trimmed, "^[a-f0-9]{64}$") ? trimmed : null;
    }
}

public sealed record ReviewRequest(string? Note);

public sealed record DeliverableResponse(
    int Id,
    int JobId,
    string? Note,
    string Status,
    string? ReviewNote,
    DateTime CreatedAt,
    DateTime? UpdatedAt,
    List<DeliverableAttachmentResponse> Attachments
);

public sealed record DeliverableAttachmentResponse(
    int Id,
    string Type,
    string? Url,
    string? FileName,
    string? ContentType,
    long? SizeBytes
);

