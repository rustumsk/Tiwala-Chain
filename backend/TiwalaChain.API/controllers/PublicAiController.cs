using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

[ApiController]
[Route("api/public/ai")]
public sealed class PublicAiController : ControllerBase
{
    private readonly PublicAiService _publicAiService;

    public PublicAiController(PublicAiService publicAiService)
    {
        _publicAiService = publicAiService;
    }

    [EnableRateLimiting("public-ai-review")]
    [HttpPost("evaluate-file")]
    [RequestFormLimits(MultipartBodyLengthLimit = PublicAiService.MaxAnonymousFileBytes)]
    [RequestSizeLimit(PublicAiService.MaxAnonymousFileBytes)]
    public async Task<IActionResult> EvaluateFile([FromForm] IFormFile? file, CancellationToken cancellationToken)
    {
        var ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        var result = await _publicAiService.EvaluateFileAsync(file, ip, cancellationToken);
        if (result.RetryAfter)
        {
            Response.Headers.RetryAfter = "60";
        }

        return StatusCode(result.StatusCode, result.Payload);
    }
}
