using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

public sealed class PublicContractService
{
    public const long MaxAnonymousFileBytes = 3 * 1024 * 1024;

    private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".pdf",
        ".docx",
    };

    private readonly AppDbContext _dbContext;
    private readonly IMemoryCache _memoryCache;
    private readonly IHttpClientFactory _httpClientFactory;

    public PublicContractService(
        AppDbContext dbContext,
        IMemoryCache memoryCache,
        IHttpClientFactory httpClientFactory)
    {
        _dbContext = dbContext;
        _memoryCache = memoryCache;
        _httpClientFactory = httpClientFactory;
    }

    public async Task<PublicContractEvaluationResult> EvaluateAsync(
        PublicContractEvaluationRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Text))
        {
            return PublicContractEvaluationResult.BadRequest(new { error = "Contract text is required before running AI review." });
        }

        if (request.Text.Length > 60000)
        {
            return PublicContractEvaluationResult.BadRequest(new { error = "Anonymous contract builder reviews support up to 60,000 characters." });
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
                return PublicContractEvaluationResult.Status((int)upstream.StatusCode, new { error = message });
            }

            return PublicContractEvaluationResult.Ok(payload);
        }
        catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return PublicContractEvaluationResult.Status(StatusCodes.Status504GatewayTimeout, new
            {
                error = "ai_evaluation_timeout",
                message = "The AI review service took too long to respond. Please try again later.",
            });
        }
        catch (HttpRequestException)
        {
            return PublicContractEvaluationResult.Status(StatusCodes.Status503ServiceUnavailable, new
            {
                error = "ai_evaluation_unavailable",
                message = "The AI review service is currently unavailable. Please try again later.",
            });
        }
    }

    public async Task<PublicContractVerificationResult> VerifyAsync(
        string? contractHash,
        IFormFile? file,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(contractHash) && file is null)
        {
            return PublicContractVerificationResult.BadRequest(new { error = "Provide a contract hash or upload a file to verify." });
        }

        string? claimedHash = null;
        if (!string.IsNullOrWhiteSpace(contractHash))
        {
            claimedHash = HashNormalizer.NormalizeSha256Hash(contractHash);
            if (claimedHash is null)
            {
                return PublicContractVerificationResult.BadRequest(new { error = "Invalid contract hash." });
            }
        }

        string? uploadedHash = null;
        if (file is not null)
        {
            var validationError = ValidateUpload(file);
            if (validationError is not null)
            {
                return PublicContractVerificationResult.BadRequest(new { error = validationError });
            }

            await using var stream = file.OpenReadStream();
            using var memoryStream = new MemoryStream();
            await stream.CopyToAsync(memoryStream, cancellationToken);
            uploadedHash = Convert.ToHexString(SHA256.HashData(memoryStream.ToArray())).ToLowerInvariant();
        }

        if (claimedHash is not null && uploadedHash is not null && claimedHash != uploadedHash)
        {
            return PublicContractVerificationResult.Ok(new PublicContractVerificationResponse(
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
            return PublicContractVerificationResult.BadRequest(new { error = "Unable to determine which contract hash to verify." });
        }

        if (_memoryCache.TryGetValue(GetCacheKey(lookupHash), out PublicContractVerificationResponse? cached) &&
            cached is not null)
        {
            return PublicContractVerificationResult.Ok(cached with { UploadedHash = uploadedHash ?? cached.UploadedHash });
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
        return PublicContractVerificationResult.Ok(response);
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

    private static string MaskWallet(string wallet)
    {
        if (string.IsNullOrWhiteSpace(wallet) || wallet.Length < 10)
        {
            return wallet;
        }

        return $"{wallet[..6]}...{wallet[^4..]}";
    }
}

public sealed record PublicContractEvaluationResult(int StatusCode, object? Payload)
{
    public static PublicContractEvaluationResult Ok(object? payload) => new(StatusCodes.Status200OK, payload);
    public static PublicContractEvaluationResult BadRequest(object payload) => new(StatusCodes.Status400BadRequest, payload);
    public static PublicContractEvaluationResult Status(int statusCode, object payload) => new(statusCode, payload);
}

public sealed record PublicContractVerificationResult(int StatusCode, object? Payload)
{
    public static PublicContractVerificationResult Ok(object? payload) => new(StatusCodes.Status200OK, payload);
    public static PublicContractVerificationResult BadRequest(object payload) => new(StatusCodes.Status400BadRequest, payload);
}
