using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
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

        return Ok(ToJobResponse(job));
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

        return Ok(jobs.Select(ToJobResponse).ToList());
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

        return Ok(jobs.Select(ToJobResponse).ToList());
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

        return Ok(ToJobResponse(job));
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

        return Ok(ToJobResponse(job));
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

        var normalizedEmployerWallet = NormalizeWalletAddress(request.EmployerWallet);
        var normalizedFreelancerWallet = NormalizeWalletAddress(request.FreelancerWallet);
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
        return Ok(ToJobResponse(job));
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
        await _dbContext.SaveChangesAsync();

        return Ok(ToJobResponse(job));
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
        await _dbContext.SaveChangesAsync();

        return Ok(ToJobResponse(job));
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

    private static JobResponse ToJobResponse(Job job)
    {
        return new JobResponse(
            job.Id,
            job.EmployerWallet,
            job.FreelancerWallet,
            job.Title,
            job.Description,
            job.Status.ToString(),
            job.AmountUsdt,
            job.ContractKey,
            job.ContractHash,
            job.CreatedAt,
            job.UpdatedAt
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

    private static string? NormalizeWalletAddress(string? walletAddress)
    {
        if (string.IsNullOrWhiteSpace(walletAddress)) return null;
        var normalized = walletAddress.Trim().ToLowerInvariant();
        return Regex.IsMatch(normalized, "^0x[a-f0-9]{40}$") ? normalized : null;
    }
}

public sealed record CreateJobRequest(
    string FreelancerWallet,
    string Title,
    string? Description,
    decimal AmountUsdt,
    string ContractKey,
    string ContractHash
);

public sealed record SyncJobFromChainRequest(
    string OnChainJobId,
    string EmployerWallet,
    string FreelancerWallet,
    decimal AmountUsdt,
    string ContractHash,
    string? Title,
    string? Description
);

public sealed record JobResponse(
    int Id,
    string EmployerWallet,
    string FreelancerWallet,
    string Title,
    string? Description,
    string Status,
    decimal AmountUsdt,
    string ContractKey,
    string ContractHash,
    DateTime CreatedAt,
    DateTime? UpdatedAt
);

