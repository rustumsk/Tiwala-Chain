using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Caching.Memory;
using System.Collections.Concurrent;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

[ApiController]
[Route("api/public/ai")]
public sealed class PublicAiController : ControllerBase
{
    private const long MaxAnonymousFileBytes = 3 * 1024 * 1024;
    private const int MaxAnonymousClauses = 5;
    private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".pdf",
        ".docx",
    };
    private static readonly ConcurrentDictionary<string, byte> ActiveReviewByIp = new();

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IMemoryCache _memoryCache;

    public PublicAiController(IHttpClientFactory httpClientFactory, IMemoryCache memoryCache)
    {
        _httpClientFactory = httpClientFactory;
        _memoryCache = memoryCache;
    }

    [EnableRateLimiting("public-ai-review")]
    [HttpPost("evaluate-file")]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxAnonymousFileBytes)]
    [RequestSizeLimit(MaxAnonymousFileBytes)]
    public async Task<IActionResult> EvaluateFile([FromForm] IFormFile? file, CancellationToken cancellationToken)
    {
        if (file is null)
        {
            return BadRequest(new { error = "Upload a PDF or DOCX file to review." });
        }

        var validationError = ValidateUpload(file);
        if (validationError is not null)
        {
            return BadRequest(new { error = validationError });
        }

        var ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        if (!ActiveReviewByIp.TryAdd(ip, 0))
        {
            Response.Headers.RetryAfter = "60";
            return StatusCode(StatusCodes.Status429TooManyRequests, new
            {
                error = "ai_review_busy",
                message = "Only one AI review can run at a time for each anonymous visitor.",
            });
        }

        try
        {
            byte[] bytes;
            await using (var stream = file.OpenReadStream())
            using (var memoryStream = new MemoryStream())
            {
                await stream.CopyToAsync(memoryStream, cancellationToken);
                bytes = memoryStream.ToArray();
            }

            var documentHash = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(bytes)).ToLowerInvariant();
            if (_memoryCache.TryGetValue(GetCacheKey(documentHash), out PublicAiEvaluationResponse? cached) &&
                cached is not null)
            {
                return Ok(cached with { Cached = true });
            }

            using var content = new MultipartFormDataContent();
            using var fileContent = new ByteArrayContent(bytes);
            fileContent.Headers.ContentType = MediaTypeHeaderValue.Parse(file.ContentType ?? InferContentType(file.FileName));
            content.Add(fileContent, "file", file.FileName);

            var client = _httpClientFactory.CreateClient("AiService");
            JsonElement payload;
            using var upstream = await client.PostAsync("evaluate/file", content, cancellationToken);
            payload = await upstream.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: cancellationToken);

            if (!upstream.IsSuccessStatusCode)
            {
                var message = payload.ValueKind == JsonValueKind.Object &&
                              payload.TryGetProperty("detail", out var detail)
                    ? detail.GetString()
                    : "AI review is currently unavailable.";
                return StatusCode((int)upstream.StatusCode, new { error = message });
            }

            var response = BuildResponse(payload);
            _memoryCache.Set(GetCacheKey(documentHash), response, TimeSpan.FromHours(12));
            return Ok(response);
        }
        catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return StatusCode(StatusCodes.Status504GatewayTimeout, new
            {
                error = "ai_review_timeout",
                message = "The AI review service took too long to respond. Please try again with a shorter document or retry later.",
            });
        }
        catch (HttpRequestException)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new
            {
                error = "ai_review_unavailable",
                message = "The AI review service is currently unavailable. Please try again later.",
            });
        }
        finally
        {
            ActiveReviewByIp.TryRemove(ip, out _);
        }
    }

    private static PublicAiEvaluationResponse BuildResponse(JsonElement payload)
    {
        var score = ExtractScore(payload);
        var clauses = ExtractClauses(payload);
        var unfair = clauses.Where(c => string.Equals(c.Label, "unfair", StringComparison.OrdinalIgnoreCase)).ToList();
        var selected = unfair.Count > 0 ? unfair.Take(MaxAnonymousClauses).ToList() : clauses.Take(Math.Min(3, clauses.Count)).ToList();

        return new PublicAiEvaluationResponse(
            score,
            selected,
            clauses.Count,
            unfair.Count,
            Math.Max(0, clauses.Count - unfair.Count),
            clauses.Count > selected.Count,
            false
        );
    }

    private static int ExtractScore(JsonElement payload)
    {
        if (TryGetNumber(payload, "fairness_score", out var score) ||
            TryGetNumber(payload, "score", out score) ||
            TryGetNumber(payload, "overall_score", out score))
        {
            return score <= 1m
                ? (int)Math.Round(score * 100m, MidpointRounding.AwayFromZero)
                : (int)Math.Round(score, MidpointRounding.AwayFromZero);
        }

        return 0;
    }

    private static List<PublicAiClauseResponse> ExtractClauses(JsonElement payload)
    {
        if (!TryGetArray(payload, "clauses", out var clausesArray) &&
            !TryGetArray(payload, "analysis", out clausesArray) &&
            !TryGetArray(payload, "results", out clausesArray))
        {
            return [];
        }

        var results = new List<PublicAiClauseResponse>();
        foreach (var item in clausesArray.EnumerateArray())
        {
            var clauseText = GetString(item, "clause")
                ?? GetString(item, "text")
                ?? GetString(item, "title")
                ?? "Clause";

            var label = (GetString(item, "label") ?? GetString(item, "verdict") ?? "fair").Trim();
            var suggestion = GetString(item, "suggestion") ?? GetString(item, "recommendation");
            var issue = GetString(item, "issue");
            var reason = GetString(item, "reason");

            if (string.Equals(label, "unfair", StringComparison.OrdinalIgnoreCase) && string.IsNullOrWhiteSpace(reason))
            {
                reason = issue
                    ?? suggestion
                    ?? "This clause may put one party at a disadvantage or leave important obligations unclear.";
            }

            int? confidence = null;
            if (TryGetNumber(item, "confidence", out var rawConfidence))
            {
                confidence = rawConfidence <= 1m
                    ? (int)Math.Round(rawConfidence * 100m, MidpointRounding.AwayFromZero)
                    : (int)Math.Round(rawConfidence, MidpointRounding.AwayFromZero);
            }

            results.Add(new PublicAiClauseResponse(
                clauseText,
                label,
                confidence,
                reason,
                suggestion,
                issue
            ));
        }

        return results;
    }

    private static bool TryGetArray(JsonElement element, string propertyName, out JsonElement value)
    {
        if (element.ValueKind == JsonValueKind.Object &&
            element.TryGetProperty(propertyName, out value) &&
            value.ValueKind == JsonValueKind.Array)
        {
            return true;
        }

        value = default;
        return false;
    }

    private static bool TryGetNumber(JsonElement element, string propertyName, out decimal value)
    {
        value = 0m;
        if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(propertyName, out var property))
        {
            return false;
        }

        if (property.ValueKind == JsonValueKind.Number && property.TryGetDecimal(out value))
        {
            return true;
        }

        return false;
    }

    private static string? GetString(JsonElement element, string propertyName)
    {
        if (element.ValueKind == JsonValueKind.Object &&
            element.TryGetProperty(propertyName, out var property) &&
            property.ValueKind == JsonValueKind.String)
        {
            return property.GetString();
        }

        return null;
    }

    private static string? ValidateUpload(IFormFile file)
    {
        if (file.Length <= 0)
        {
            return "Uploaded file is empty.";
        }

        if (file.Length > MaxAnonymousFileBytes)
        {
            return "Anonymous AI review supports files up to 3 MB.";
        }

        var extension = Path.GetExtension(file.FileName);
        if (string.IsNullOrWhiteSpace(extension) || !AllowedExtensions.Contains(extension))
        {
            return "Only PDF and DOCX files are supported.";
        }

        return null;
    }

    private static string InferContentType(string fileName)
    {
        return string.Equals(Path.GetExtension(fileName), ".pdf", StringComparison.OrdinalIgnoreCase)
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }

    private static string GetCacheKey(string documentHash) => $"public-ai-review:{documentHash}";
}
