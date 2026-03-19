using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using System.Net.Http.Json;

[ApiController]
[Route("api/public/contracts")]
public sealed class PublicContractsController : ControllerBase
{
    private readonly IHttpClientFactory _httpClientFactory;

    public PublicContractsController(IHttpClientFactory httpClientFactory)
    {
        _httpClientFactory = httpClientFactory;
    }

    public sealed record PublicEvaluateTextRequest(string Text);

    [EnableRateLimiting("public-contracts")]
    [HttpPost("evaluate")]
    public async Task<IActionResult> Evaluate([FromBody] PublicEvaluateTextRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Text))
            return BadRequest(new { error = "Text cannot be empty." });

        var client = _httpClientFactory.CreateClient("AiService");

        using var upstream = await client.PostAsJsonAsync(
            "evaluate/text",
            new { text = request.Text },
            cancellationToken);

        var payload = await upstream.Content.ReadFromJsonAsync<object>(cancellationToken: cancellationToken);
        return StatusCode((int)upstream.StatusCode, payload ?? new { error = "AI service returned empty response." });
    }
}

