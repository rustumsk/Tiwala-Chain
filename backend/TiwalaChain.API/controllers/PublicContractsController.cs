using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
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
    private readonly IHttpClientFactory _httpClientFactory;

    public PublicContractsController(
        AppDbContext dbContext,
        IMemoryCache memoryCache,
        IHttpClientFactory httpClientFactory)
    {
        _dbContext = dbContext;
        _memoryCache = memoryCache;
        _httpClientFactory = httpClientFactory;
    }

    [EnableRateLimiting("public-contract-builder")]
    [HttpPost("evaluate")]
    public async Task<IActionResult> Evaluate(
        [FromBody] PublicContractEvaluationRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Text))
        {
            return BadRequest(new { error = "Contract text is required before running AI review." });
        }

        if (request.Text.Length > 60000)
        {
            return BadRequest(new { error = "Anonymous contract builder reviews support up to 60,000 characters." });
        }

        try
        {
            var client = _httpClientFactory.CreateClient("AiService");
            using var upstream = await client.PostAsJsonAsync(
                "evaluate/text",
                new { text = request.Text },
                cancellationToken);
            var payload = await upstream.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: cancellationToken);

            if (!upstream.IsSuccessStatusCode)
            {
                var message = payload.ValueKind == JsonValueKind.Object &&
                              payload.TryGetProperty("detail", out var detail)
                    ? detail.GetString()
                    : "AI evaluation is currently unavailable.";
                return StatusCode((int)upstream.StatusCode, new { error = message });
            }

            return Ok(payload);
        }
        catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return StatusCode(StatusCodes.Status504GatewayTimeout, new
            {
                error = "ai_evaluation_timeout",
                message = "The AI review service took too long to respond. Please try again later.",
            });
        }
        catch (HttpRequestException)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new
            {
                error = "ai_evaluation_unavailable",
                message = "The AI review service is currently unavailable. Please try again later.",
            });
        }
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
