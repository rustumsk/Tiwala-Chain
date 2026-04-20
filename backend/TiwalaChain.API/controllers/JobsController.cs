using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text.Json;
using System.Text.RegularExpressions;

[ApiController]
[Route("api/[controller]")]
public sealed class JobsController : ControllerBase
{
    private readonly AppDbContext _dbContext;
    private readonly S3StorageService _storage;

    public JobsController(AppDbContext dbContext, S3StorageService storage)
    {
        _dbContext = dbContext;
        _storage = storage;
    }

    [Authorize]
    [HttpPost]
    public async Task<ActionResult<JobResponse>> CreateJob([FromBody] CreateJobRequest request)
    {
        var user = await ResolveCurrentUser();
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        if (!user.IsApproved)
        {
            return StatusCode(403, "Your account is pending admin approval.");
        }

        if (string.IsNullOrWhiteSpace(request.FreelancerWallet))
        {
            return BadRequest("Freelancer wallet is required.");
        }

        if (string.IsNullOrWhiteSpace(request.Title))
        {
            return BadRequest("Title is required.");
        }

        if (string.IsNullOrWhiteSpace(request.ContractKey) || string.IsNullOrWhiteSpace(request.ContractHash))
        {
            return BadRequest("Contract key and hash are required.");
        }

        if (request.AmountUsdt <= 0)
        {
            return BadRequest("Amount must be greater than 0.");
        }

        var employerWallet = user.WalletAddress;
        var freelancerWallet = request.FreelancerWallet.Trim().ToLowerInvariant();

        var job = new Job
        {
            EmployerWallet = employerWallet,
            FreelancerWallet = freelancerWallet,
            Title = request.Title.Trim(),
            Description = request.Description?.Trim(),
            ContractKey = request.ContractKey.Trim(),
            ContractHash = request.ContractHash.Trim().ToLowerInvariant(),
            AmountUsdt = request.AmountUsdt,
            Status = JobStatus.PendingOffer,
        };

        _dbContext.Jobs.Add(job);
        await _dbContext.SaveChangesAsync();

        AddNotification(
            job.FreelancerWallet,
            "offer_sent",
            $"New job offer received: \"{job.Title}\".",
            new Dictionary<string, object?>
            {
                ["jobId"] = job.Id,
            });
        await _dbContext.SaveChangesAsync();

        return Ok(JobMapper.ToResponse(job));
    }

    [Authorize]
    [HttpGet("offers/incoming")]
    public async Task<ActionResult<List<JobResponse>>> GetIncomingOffers()
    {
        var user = await ResolveCurrentUser();
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var wallet = user.WalletAddress;

        var jobs = await _dbContext.Jobs
            .Where(j =>
                j.FreelancerWallet == wallet &&
                (j.Status == JobStatus.PendingOffer || j.Status == JobStatus.Accepted))
            .OrderByDescending(j => j.CreatedAt)
            .ToListAsync();

        return Ok(jobs.Select(JobMapper.ToResponse).ToList());
    }

    [Authorize]
    [HttpGet("offers/sent")]
    public async Task<ActionResult<List<JobResponse>>> GetSentOffers()
    {
        var user = await ResolveCurrentUser();
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var wallet = user.WalletAddress;

        var jobs = await _dbContext.Jobs
            .Where(j => j.EmployerWallet == wallet)
            .OrderByDescending(j => j.CreatedAt)
            .ToListAsync();

        return Ok(jobs.Select(JobMapper.ToResponse).ToList());
    }

    [Authorize]
    [HttpGet("{id:int}")]
    public async Task<ActionResult<JobResponse>> GetJob(int id)
    {
        var user = await ResolveCurrentUser();
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var job = await _dbContext.Jobs.FirstOrDefaultAsync(j => j.Id == id);
        if (job is null)
        {
            return NotFound("Job not found.");
        }

        if (user.Role != UserRole.Admin && !IsParticipant(job, user.WalletAddress))
        {
            return Forbid();
        }

        return Ok(JobMapper.ToResponse(job));
    }

    [Authorize]
    [HttpGet("{id:int}/contract")]
    public async Task<IActionResult> GetJobContract(int id, CancellationToken cancellationToken)
    {
        var user = await ResolveCurrentUser();
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var job = await _dbContext.Jobs.FirstOrDefaultAsync(j => j.Id == id);
        if (job is null)
        {
            return NotFound("Job not found.");
        }

        if (user.Role != UserRole.Admin && !IsParticipant(job, user.WalletAddress))
        {
            return Forbid();
        }

        var (stream, contentType) = await _storage.GetAsync(job.ContractKey, cancellationToken);
        var downloadFileName = $"job-{job.Id}-contract";
        return File(stream, contentType, downloadFileName);
    }

    [Authorize]
    [HttpGet("contract/by-hash/{hash}")]
    public async Task<IActionResult> GetJobContractByHash(string hash, CancellationToken cancellationToken)
    {
        var user = await ResolveCurrentUser();
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var normalized = NormalizeHash(hash);
        if (normalized is null)
        {
            return BadRequest("Invalid contract hash.");
        }
        
        IQueryable<Job> query = _dbContext.Jobs.OrderByDescending(j => j.CreatedAt);
        Job? job;
        if (user.Role == UserRole.Admin)
        {
            job = await query.FirstOrDefaultAsync(j => j.ContractHash == normalized, cancellationToken);
        }
        else
        {
            var wallet = user.WalletAddress;
            job = await query.FirstOrDefaultAsync(
                j => j.ContractHash == normalized &&
                     (j.EmployerWallet == wallet || j.FreelancerWallet == wallet),
                cancellationToken);
        }

        if (job is null)
        {
            return NotFound("Contract not found.");
        }

        var (stream, contentType) = await _storage.GetAsync(job.ContractKey, cancellationToken);
        var downloadFileName = $"job-{job.Id}-contract";
        return File(stream, contentType, downloadFileName);
    }

    [Authorize]
    [HttpGet("disputes/by-hash/{hash}")]
    public async Task<ActionResult<JobDisputeResponse>> GetJobDisputeByHash(string hash, CancellationToken cancellationToken)
    {
        var user = await ResolveCurrentUser();
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var normalized = NormalizeHash(hash);
        if (normalized is null)
        {
            return BadRequest("Invalid contract hash.");
        }

        var dispute = await _dbContext.JobDisputes.AsNoTracking()
            .FirstOrDefaultAsync(d => d.ContractHash == normalized, cancellationToken);
        if (dispute is null)
        {
            return NotFound("No dispute details recorded for this job.");
        }

        if (user.Role == UserRole.Admin)
        {
            return Ok(JobMapper.ToDisputeResponse(dispute));
        }

        var wallet = user.WalletAddress;
        var job = await _dbContext.Jobs.AsNoTracking()
            .OrderByDescending(j => j.CreatedAt)
            .FirstOrDefaultAsync(
                j => j.ContractHash == normalized &&
                     (j.EmployerWallet == wallet || j.FreelancerWallet == wallet),
                cancellationToken);

        if (job is null)
        {
            return Forbid();
        }

        return Ok(JobMapper.ToDisputeResponse(dispute));
    }

    [Authorize]
    [HttpPost("disputes")]
    public async Task<ActionResult<JobDisputeResponse>> RecordJobDispute(
        [FromBody] RecordJobDisputeRequest request,
        CancellationToken cancellationToken)
    {
        var user = await ResolveCurrentUser();
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        if (!user.IsApproved)
        {
            return StatusCode(403, "Your account is pending admin approval.");
        }

        var normalized = NormalizeHash(request.ContractHash);
        if (normalized is null)
        {
            return BadRequest("Invalid contract hash.");
        }

        var onChainJobId = request.OnChainJobId?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(onChainJobId) || onChainJobId.Length > 40 || !Regex.IsMatch(onChainJobId, "^[0-9]+$"))
        {
            return BadRequest("Invalid on-chain job id.");
        }

        var reasonCode = request.ReasonCode?.Trim().ToLowerInvariant() ?? string.Empty;
        if (!DisputeReasonCodes.Valid.Contains(reasonCode))
        {
            return BadRequest("Invalid dispute reason.");
        }

        var details = string.IsNullOrWhiteSpace(request.Details) ? null : request.Details.Trim();
        if (details is not null && details.Length > 2000)
        {
            return BadRequest("Details must be at most 2000 characters.");
        }

        var job = await _dbContext.Jobs
            .OrderByDescending(j => j.CreatedAt)
            .FirstOrDefaultAsync(
                j => j.ContractHash == normalized &&
                     (j.EmployerWallet == user.WalletAddress || j.FreelancerWallet == user.WalletAddress),
                cancellationToken);

        if (job is null)
        {
            return NotFound("Job not found for this contract hash, or you are not a participant.");
        }

        var exists = await _dbContext.JobDisputes.AnyAsync(d => d.ContractHash == normalized, cancellationToken);
        if (exists)
        {
            return Conflict("Dispute details for this job were already recorded.");
        }

        var dispute = new JobDispute
        {
            ContractHash = normalized,
            OnChainJobId = onChainJobId,
            RaisedByWallet = user.WalletAddress,
            ReasonCode = reasonCode,
            Details = details,
        };

        _dbContext.JobDisputes.Add(dispute);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return CreatedAtAction(
            nameof(GetJobDisputeByHash),
            new { hash = normalized },
            JobMapper.ToDisputeResponse(dispute));
    }

    [Authorize]
    [HttpGet("by-hash/{hash}")]
    public async Task<ActionResult<JobResponse>> GetJobByHash(string hash, CancellationToken cancellationToken)
    {
        var user = await ResolveCurrentUser();
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var normalized = NormalizeHash(hash);
        if (normalized is null)
        {
            return BadRequest("Invalid contract hash.");
        }

        IQueryable<Job> query = _dbContext.Jobs.OrderByDescending(j => j.CreatedAt);
        Job? job;
        if (user.Role == UserRole.Admin)
        {
            job = await query.FirstOrDefaultAsync(j => j.ContractHash == normalized, cancellationToken);
        }
        else
        {
            var wallet = user.WalletAddress;
            job = await query.FirstOrDefaultAsync(
                j => j.ContractHash == normalized &&
                     (j.EmployerWallet == wallet || j.FreelancerWallet == wallet),
                cancellationToken);
        }

        if (job is null)
        {
            return NotFound("Job not found for this contract hash.");
        }

        return Ok(JobMapper.ToResponse(job));
    }

    [Authorize]
    [HttpPost("sync-from-chain")]
    public async Task<ActionResult<JobResponse>> SyncJobFromChain(
        [FromBody] SyncJobFromChainRequest request,
        CancellationToken cancellationToken)
    {
        var user = await ResolveCurrentUser();
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var normalizedEmployerWallet = WalletNormalizer.NormalizeWalletAddress(request.EmployerWallet);
        var normalizedFreelancerWallet = WalletNormalizer.NormalizeWalletAddress(request.FreelancerWallet);
        var normalizedHash = NormalizeHash(request.ContractHash);
        if (normalizedEmployerWallet is null || normalizedFreelancerWallet is null)
        {
            return BadRequest("Employer and freelancer wallets are required.");
        }

        if (normalizedHash is null)
        {
            return BadRequest("Invalid contract hash.");
        }

        if (request.AmountUsdt <= 0)
        {
            return BadRequest("Amount must be greater than 0.");
        }

        if (user.Role != UserRole.Admin &&
            !string.Equals(user.WalletAddress, normalizedEmployerWallet, StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(user.WalletAddress, normalizedFreelancerWallet, StringComparison.OrdinalIgnoreCase))
        {
            return Forbid();
        }

        IQueryable<Job> query = _dbContext.Jobs
            .Where(j => j.ContractHash == normalizedHash)
            .OrderByDescending(j => j.CreatedAt);

        Job? job;
        if (user.Role == UserRole.Admin)
        {
            job = await query.FirstOrDefaultAsync(cancellationToken);
        }
        else
        {
            var wallet = user.WalletAddress;
            job = await query.FirstOrDefaultAsync(
                j => j.EmployerWallet == wallet || j.FreelancerWallet == wallet,
                cancellationToken);
        }

        var normalizedTitle = string.IsNullOrWhiteSpace(request.Title)
            ? $"On-chain job #{request.OnChainJobId}"
            : request.Title.Trim();
        var normalizedDescription = string.IsNullOrWhiteSpace(request.Description)
            ? null
            : request.Description.Trim();

        if (job is null)
        {
            job = new Job
            {
                EmployerWallet = normalizedEmployerWallet,
                FreelancerWallet = normalizedFreelancerWallet,
                Title = normalizedTitle,
                Description = normalizedDescription,
                ContractKey = string.Empty,
                ContractHash = normalizedHash,
                AmountUsdt = request.AmountUsdt,
                Status = JobStatus.Accepted,
            };

            _dbContext.Jobs.Add(job);
        }
        else
        {
            job.EmployerWallet = normalizedEmployerWallet;
            job.FreelancerWallet = normalizedFreelancerWallet;
            job.Title = string.IsNullOrWhiteSpace(job.Title) ? normalizedTitle : job.Title;
            if (string.IsNullOrWhiteSpace(job.Description) && normalizedDescription is not null)
            {
                job.Description = normalizedDescription;
            }
            job.AmountUsdt = request.AmountUsdt;
            job.Status = JobStatus.Accepted;
            job.UpdatedAt = DateTime.UtcNow;
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
        return Ok(JobMapper.ToResponse(job));
    }

    [Authorize]
    [HttpPost("{id:int}/accept")]
    public async Task<ActionResult<JobResponse>> AcceptJob(int id)
    {
        var user = await ResolveCurrentUser();
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var job = await _dbContext.Jobs.FirstOrDefaultAsync(j => j.Id == id);
        if (job is null)
        {
            return NotFound("Job not found.");
        }

        if (!string.Equals(job.FreelancerWallet, user.WalletAddress, StringComparison.OrdinalIgnoreCase))
        {
            return Forbid();
        }

        if (job.Status != JobStatus.PendingOffer)
        {
            return BadRequest("Job is not in a pending offer state.");
        }

        job.Status = JobStatus.Accepted;
        job.UpdatedAt = DateTime.UtcNow;
        AddNotification(
            job.EmployerWallet,
            "offer_accepted",
            $"Your offer \"{job.Title}\" was accepted.",
            new Dictionary<string, object?>
            {
                ["jobId"] = job.Id,
            });
        await _dbContext.SaveChangesAsync();

        return Ok(JobMapper.ToResponse(job));
    }

    [Authorize]
    [HttpPost("{id:int}/decline")]
    public async Task<ActionResult<JobResponse>> DeclineJob(int id)
    {
        var user = await ResolveCurrentUser();
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var job = await _dbContext.Jobs.FirstOrDefaultAsync(j => j.Id == id);
        if (job is null)
        {
            return NotFound("Job not found.");
        }

        if (!string.Equals(job.FreelancerWallet, user.WalletAddress, StringComparison.OrdinalIgnoreCase))
        {
            return Forbid();
        }

        if (job.Status != JobStatus.PendingOffer)
        {
            return BadRequest("Job is not in a pending offer state.");
        }

        job.Status = JobStatus.Declined;
        job.UpdatedAt = DateTime.UtcNow;
        AddNotification(
            job.EmployerWallet,
            "offer_declined",
            $"Your offer \"{job.Title}\" was declined.",
            new Dictionary<string, object?>
            {
                ["jobId"] = job.Id,
            });
        await _dbContext.SaveChangesAsync();

        return Ok(JobMapper.ToResponse(job));
    }

    private async Task<User?> ResolveCurrentUser()
    {
        var subjectClaim = User.FindFirstValue(JwtRegisteredClaimNames.Sub)
            ?? User.FindFirstValue(ClaimTypes.NameIdentifier);

        if (!int.TryParse(subjectClaim, out var userId))
        {
            return null;
        }

        return await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == userId);
    }

    private static bool IsParticipant(Job job, string wallet)
    {
        var w = wallet.ToLowerInvariant();
        return job.EmployerWallet == w || job.FreelancerWallet == w;
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
