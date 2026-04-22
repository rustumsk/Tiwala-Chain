using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;

public sealed class JobService
{
    private readonly AppDbContext _dbContext;
    private readonly S3StorageService _storage;

    public JobService(AppDbContext dbContext, S3StorageService storage)
    {
        _dbContext = dbContext;
        _storage = storage;
    }

    public async Task<ServiceResult<JobResponse>> CreateJobAsync(
        User user,
        CreateJobRequest request,
        CancellationToken cancellationToken)
    {
        if (!user.IsApproved)
        {
            return ServiceResult<JobResponse>.Forbidden("Your account is pending admin approval.");
        }

        var validation = ValidateCreateJob(request);
        if (validation is not null)
        {
            return ServiceResult<JobResponse>.BadRequest(validation);
        }

        var job = new Job
        {
            EmployerWallet = user.WalletAddress,
            FreelancerWallet = request.FreelancerWallet.Trim().ToLowerInvariant(),
            Title = request.Title.Trim(),
            Description = request.Description?.Trim(),
            ContractKey = request.ContractKey.Trim(),
            ContractHash = request.ContractHash.Trim().ToLowerInvariant(),
            AmountUsdt = request.AmountUsdt,
            Status = JobStatus.PendingOffer,
        };

        _dbContext.Jobs.Add(job);
        await _dbContext.SaveChangesAsync(cancellationToken);

        AddNotification(
            job.FreelancerWallet,
            "offer_sent",
            $"New job offer received: \"{job.Title}\".",
            new Dictionary<string, object?>
            {
                ["jobId"] = job.Id,
            });
        await _dbContext.SaveChangesAsync(cancellationToken);

        return ServiceResult<JobResponse>.Success(JobMapper.ToResponse(job));
    }

    public async Task<List<JobResponse>> GetIncomingOffersAsync(User user, CancellationToken cancellationToken)
    {
        var wallet = user.WalletAddress;

        var jobs = await _dbContext.Jobs
            .Where(j =>
                j.FreelancerWallet == wallet &&
                (j.Status == JobStatus.PendingOffer || j.Status == JobStatus.Accepted))
            .OrderByDescending(j => j.CreatedAt)
            .ToListAsync(cancellationToken);

        return jobs.Select(JobMapper.ToResponse).ToList();
    }

    public async Task<List<JobResponse>> GetSentOffersAsync(User user, CancellationToken cancellationToken)
    {
        var wallet = user.WalletAddress;

        var jobs = await _dbContext.Jobs
            .Where(j => j.EmployerWallet == wallet)
            .OrderByDescending(j => j.CreatedAt)
            .ToListAsync(cancellationToken);

        return jobs.Select(JobMapper.ToResponse).ToList();
    }

    public async Task<ServiceResult<JobResponse>> GetJobAsync(
        User user,
        int id,
        CancellationToken cancellationToken)
    {
        var job = await _dbContext.Jobs.FirstOrDefaultAsync(j => j.Id == id, cancellationToken);
        if (job is null)
        {
            return ServiceResult<JobResponse>.NotFound("Job not found.");
        }

        if (user.Role != UserRole.Admin && !IsParticipant(job, user.WalletAddress))
        {
            return ServiceResult<JobResponse>.Forbidden();
        }

        return ServiceResult<JobResponse>.Success(JobMapper.ToResponse(job));
    }

    public async Task<ServiceResult<JobFileDownload>> GetJobContractAsync(
        User user,
        int id,
        CancellationToken cancellationToken)
    {
        var job = await _dbContext.Jobs.FirstOrDefaultAsync(j => j.Id == id, cancellationToken);
        if (job is null)
        {
            return ServiceResult<JobFileDownload>.NotFound("Job not found.");
        }

        if (user.Role != UserRole.Admin && !IsParticipant(job, user.WalletAddress))
        {
            return ServiceResult<JobFileDownload>.Forbidden();
        }

        var (stream, contentType) = await _storage.GetAsync(job.ContractKey, cancellationToken);
        return ServiceResult<JobFileDownload>.Success(
            new JobFileDownload(stream, contentType, $"job-{job.Id}-contract"));
    }

    public async Task<ServiceResult<JobFileDownload>> GetJobContractByHashAsync(
        User user,
        string hash,
        CancellationToken cancellationToken)
    {
        var normalized = HashNormalizer.NormalizeSha256Hash(hash);
        if (normalized is null)
        {
            return ServiceResult<JobFileDownload>.BadRequest("Invalid contract hash.");
        }

        var job = await FindAccessibleJobByHashAsync(user, normalized, cancellationToken);
        if (job is null)
        {
            return ServiceResult<JobFileDownload>.NotFound("Contract not found.");
        }

        var (stream, contentType) = await _storage.GetAsync(job.ContractKey, cancellationToken);
        return ServiceResult<JobFileDownload>.Success(
            new JobFileDownload(stream, contentType, $"job-{job.Id}-contract"));
    }

    public async Task<ServiceResult<JobDisputeResponse>> GetJobDisputeByHashAsync(
        User user,
        string hash,
        CancellationToken cancellationToken)
    {
        var normalized = HashNormalizer.NormalizeSha256Hash(hash);
        if (normalized is null)
        {
            return ServiceResult<JobDisputeResponse>.BadRequest("Invalid contract hash.");
        }

        var dispute = await _dbContext.JobDisputes.AsNoTracking()
            .FirstOrDefaultAsync(d => d.ContractHash == normalized, cancellationToken);
        if (dispute is null)
        {
            return ServiceResult<JobDisputeResponse>.NotFound("No dispute details recorded for this job.");
        }

        if (user.Role == UserRole.Admin)
        {
            return ServiceResult<JobDisputeResponse>.Success(JobMapper.ToDisputeResponse(dispute));
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
            return ServiceResult<JobDisputeResponse>.Forbidden();
        }

        return ServiceResult<JobDisputeResponse>.Success(JobMapper.ToDisputeResponse(dispute));
    }

    public async Task<ServiceResult<JobDisputeResponse>> RecordJobDisputeAsync(
        User user,
        RecordJobDisputeRequest request,
        CancellationToken cancellationToken)
    {
        if (!user.IsApproved)
        {
            return ServiceResult<JobDisputeResponse>.Forbidden("Your account is pending admin approval.");
        }

        var normalized = HashNormalizer.NormalizeSha256Hash(request.ContractHash);
        if (normalized is null)
        {
            return ServiceResult<JobDisputeResponse>.BadRequest("Invalid contract hash.");
        }

        var onChainJobId = request.OnChainJobId?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(onChainJobId) || onChainJobId.Length > 40 || !Regex.IsMatch(onChainJobId, "^[0-9]+$"))
        {
            return ServiceResult<JobDisputeResponse>.BadRequest("Invalid on-chain job id.");
        }

        var reasonCode = request.ReasonCode?.Trim().ToLowerInvariant() ?? string.Empty;
        if (!DisputeReasonCodes.Valid.Contains(reasonCode))
        {
            return ServiceResult<JobDisputeResponse>.BadRequest("Invalid dispute reason.");
        }

        var details = string.IsNullOrWhiteSpace(request.Details) ? null : request.Details.Trim();
        if (details is not null && details.Length > 2000)
        {
            return ServiceResult<JobDisputeResponse>.BadRequest("Details must be at most 2000 characters.");
        }

        var job = await _dbContext.Jobs
            .OrderByDescending(j => j.CreatedAt)
            .FirstOrDefaultAsync(
                j => j.ContractHash == normalized &&
                     (j.EmployerWallet == user.WalletAddress || j.FreelancerWallet == user.WalletAddress),
                cancellationToken);

        if (job is null)
        {
            return ServiceResult<JobDisputeResponse>.NotFound("Job not found for this contract hash, or you are not a participant.");
        }

        var exists = await _dbContext.JobDisputes.AnyAsync(d => d.ContractHash == normalized, cancellationToken);
        if (exists)
        {
            return ServiceResult<JobDisputeResponse>.Conflict("Dispute details for this job were already recorded.");
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

        return ServiceResult<JobDisputeResponse>.Created(JobMapper.ToDisputeResponse(dispute), normalized);
    }

    public async Task<ServiceResult<JobResponse>> GetJobByHashAsync(
        User user,
        string hash,
        CancellationToken cancellationToken)
    {
        var normalized = HashNormalizer.NormalizeSha256Hash(hash);
        if (normalized is null)
        {
            return ServiceResult<JobResponse>.BadRequest("Invalid contract hash.");
        }

        var job = await FindAccessibleJobByHashAsync(user, normalized, cancellationToken);
        if (job is null)
        {
            return ServiceResult<JobResponse>.NotFound("Job not found for this contract hash.");
        }

        return ServiceResult<JobResponse>.Success(JobMapper.ToResponse(job));
    }

    public async Task<ServiceResult<JobResponse>> SyncJobFromChainAsync(
        User user,
        SyncJobFromChainRequest request,
        CancellationToken cancellationToken)
    {
        var normalizedEmployerWallet = WalletNormalizer.NormalizeWalletAddress(request.EmployerWallet);
        var normalizedFreelancerWallet = WalletNormalizer.NormalizeWalletAddress(request.FreelancerWallet);
        var normalizedHash = HashNormalizer.NormalizeSha256Hash(request.ContractHash);
        if (normalizedEmployerWallet is null || normalizedFreelancerWallet is null)
        {
            return ServiceResult<JobResponse>.BadRequest("Employer and freelancer wallets are required.");
        }

        if (normalizedHash is null)
        {
            return ServiceResult<JobResponse>.BadRequest("Invalid contract hash.");
        }

        if (request.AmountUsdt <= 0)
        {
            return ServiceResult<JobResponse>.BadRequest("Amount must be greater than 0.");
        }

        if (user.Role != UserRole.Admin &&
            !string.Equals(user.WalletAddress, normalizedEmployerWallet, StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(user.WalletAddress, normalizedFreelancerWallet, StringComparison.OrdinalIgnoreCase))
        {
            return ServiceResult<JobResponse>.Forbidden();
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
        return ServiceResult<JobResponse>.Success(JobMapper.ToResponse(job));
    }

    public async Task<ServiceResult<JobResponse>> AcceptJobAsync(
        User user,
        int id,
        CancellationToken cancellationToken)
    {
        return await ChangeOfferStatusAsync(
            user,
            id,
            JobStatus.Accepted,
            "offer_accepted",
            "accepted",
            cancellationToken);
    }

    public async Task<ServiceResult<JobResponse>> DeclineJobAsync(
        User user,
        int id,
        CancellationToken cancellationToken)
    {
        return await ChangeOfferStatusAsync(
            user,
            id,
            JobStatus.Declined,
            "offer_declined",
            "declined",
            cancellationToken);
    }

    private async Task<ServiceResult<JobResponse>> ChangeOfferStatusAsync(
        User user,
        int id,
        JobStatus status,
        string notificationType,
        string statusLabel,
        CancellationToken cancellationToken)
    {
        var job = await _dbContext.Jobs.FirstOrDefaultAsync(j => j.Id == id, cancellationToken);
        if (job is null)
        {
            return ServiceResult<JobResponse>.NotFound("Job not found.");
        }

        if (!string.Equals(job.FreelancerWallet, user.WalletAddress, StringComparison.OrdinalIgnoreCase))
        {
            return ServiceResult<JobResponse>.Forbidden();
        }

        if (job.Status != JobStatus.PendingOffer)
        {
            return ServiceResult<JobResponse>.BadRequest("Job is not in a pending offer state.");
        }

        job.Status = status;
        job.UpdatedAt = DateTime.UtcNow;
        AddNotification(
            job.EmployerWallet,
            notificationType,
            $"Your offer \"{job.Title}\" was {statusLabel}.",
            new Dictionary<string, object?>
            {
                ["jobId"] = job.Id,
            });
        await _dbContext.SaveChangesAsync(cancellationToken);

        return ServiceResult<JobResponse>.Success(JobMapper.ToResponse(job));
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

    private static string? ValidateCreateJob(CreateJobRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.FreelancerWallet))
        {
            return "Freelancer wallet is required.";
        }

        if (string.IsNullOrWhiteSpace(request.Title))
        {
            return "Title is required.";
        }

        if (string.IsNullOrWhiteSpace(request.ContractKey) || string.IsNullOrWhiteSpace(request.ContractHash))
        {
            return "Contract key and hash are required.";
        }

        if (request.AmountUsdt <= 0)
        {
            return "Amount must be greater than 0.";
        }

        return null;
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
}

public sealed record JobFileDownload(Stream Stream, string ContentType, string FileName);
