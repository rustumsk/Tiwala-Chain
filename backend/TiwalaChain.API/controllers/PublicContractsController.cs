using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using System.Security.Cryptography;
using System.Text.RegularExpressions;

[ApiController]
[Route("api/public/contracts")]
public sealed class PublicContractsController : ControllerBase
{
    private const long MaxAnonymousFileBytes = 3 * 1024 * 1024;
    private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".pdf",
        ".docx",
    };
    private static readonly Regex HashRegex = new("^[a-f0-9]{64}$", RegexOptions.Compiled);

    private readonly AppDbContext _dbContext;
    private readonly IMemoryCache _memoryCache;

    public PublicContractsController(AppDbContext dbContext, IMemoryCache memoryCache)
    {
        _dbContext = dbContext;
        _memoryCache = memoryCache;
    }

    [EnableRateLimiting("public-contract-verify")]
    [HttpPost("verify")]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxAnonymousFileBytes)]
    [RequestSizeLimit(MaxAnonymousFileBytes)]
    public async Task<ActionResult<PublicContractVerificationResponse>> Verify(
        [FromForm] string? contractHash,
        [FromForm] IFormFile? file,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(contractHash) && file is null)
        {
            return BadRequest(new { error = "Provide a contract hash or upload a file to verify." });
        }

        string? claimedHash = null;
        if (!string.IsNullOrWhiteSpace(contractHash))
        {
            claimedHash = NormalizeHash(contractHash);
            if (claimedHash is null)
            {
                return BadRequest(new { error = "Invalid contract hash." });
            }
        }

        string? uploadedHash = null;
        if (file is not null)
        {
            var validationError = ValidateUpload(file);
            if (validationError is not null)
            {
                return BadRequest(new { error = validationError });
            }

            await using var stream = file.OpenReadStream();
            using var memoryStream = new MemoryStream();
            await stream.CopyToAsync(memoryStream, cancellationToken);
            uploadedHash = Convert.ToHexString(SHA256.HashData(memoryStream.ToArray())).ToLowerInvariant();
        }

        if (claimedHash is not null && uploadedHash is not null && claimedHash != uploadedHash)
        {
            return Ok(new PublicContractVerificationResponse(
                "Mismatch",
                claimedHash,
                uploadedHash,
                null,
                "The uploaded file does not match the provided contract hash."
            ));
        }

        var lookupHash = uploadedHash ?? claimedHash;
        if (lookupHash is null)
        {
            return BadRequest(new { error = "Unable to determine which contract hash to verify." });
        }

        if (_memoryCache.TryGetValue(GetCacheKey(lookupHash), out PublicContractVerificationResponse? cached) &&
            cached is not null)
        {
            return Ok(cached with { UploadedHash = uploadedHash ?? cached.UploadedHash });
        }

        var job = await _dbContext.Jobs
            .AsNoTracking()
            .OrderByDescending(j => j.CreatedAt)
            .FirstOrDefaultAsync(j => j.ContractHash == lookupHash, cancellationToken);

        var response = job is null
            ? new PublicContractVerificationResponse(
                "NotFound",
                lookupHash,
                uploadedHash,
                null,
                "No contract record was found for that hash."
            )
            : new PublicContractVerificationResponse(
                "Verified",
                lookupHash,
                uploadedHash,
                new PublicContractTrustMetadata(
                    job.Title,
                    job.Status.ToString(),
                    job.AmountUsdt,
                    job.CreatedAt,
                    MaskWallet(job.EmployerWallet),
                    MaskWallet(job.FreelancerWallet)
                ),
                "This contract hash matches a record stored in TiwalaChain."
            );

        _memoryCache.Set(GetCacheKey(lookupHash), response, TimeSpan.FromHours(24));
        return Ok(response);
    }

    private static string GetCacheKey(string contractHash) => $"public-contract-verify:{contractHash}";

    private static string? ValidateUpload(IFormFile file)
    {
        if (file.Length <= 0)
        {
            return "Uploaded file is empty.";
        }

        if (file.Length > MaxAnonymousFileBytes)
        {
            return "Anonymous verification supports files up to 3 MB.";
        }

        var extension = Path.GetExtension(file.FileName);
        if (string.IsNullOrWhiteSpace(extension) || !AllowedExtensions.Contains(extension))
        {
            return "Only PDF and DOCX files are supported.";
        }

        return null;
    }

    private static string? NormalizeHash(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var trimmed = value.Trim().ToLowerInvariant();
        if (trimmed.StartsWith("0x", StringComparison.Ordinal))
        {
            trimmed = trimmed[2..];
        }

        return HashRegex.IsMatch(trimmed) ? trimmed : null;
    }

    private static string MaskWallet(string wallet)
    {
        if (string.IsNullOrWhiteSpace(wallet) || wallet.Length < 10)
        {
            return wallet;
        }

        return $"{wallet[..6]}...{wallet[^4..]}";
    }
}

public sealed record PublicContractVerificationResponse(
    string Status,
    string MatchedHash,
    string? UploadedHash,
    PublicContractTrustMetadata? Metadata,
    string Message
);

public sealed record PublicContractTrustMetadata(
    string Title,
    string JobStatus,
    decimal AmountUsdt,
    DateTime RecordedAt,
    string EmployerWallet,
    string FreelancerWallet
);

