using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

[ApiController]
[Route("api/public/contracts")]
public sealed class PublicContractsController : ControllerBase
{
    private readonly PublicContractService _publicContractService;

    public PublicContractsController(PublicContractService publicContractService)
    {
        _publicContractService = publicContractService;
    }

    [EnableRateLimiting("public-contract-builder")]
    [HttpPost("evaluate")]
    public async Task<IActionResult> Evaluate(
        [FromBody] PublicContractEvaluationRequest request,
        CancellationToken cancellationToken)
    {
        var result = await _publicContractService.EvaluateAsync(request, cancellationToken);
        return StatusCode(result.StatusCode, result.Payload);
    }

    [EnableRateLimiting("public-contract-verify")]
    [HttpPost("verify")]
    [RequestFormLimits(MultipartBodyLengthLimit = PublicContractService.MaxAnonymousFileBytes)]
    [RequestSizeLimit(PublicContractService.MaxAnonymousFileBytes)]
    public async Task<IActionResult> Verify(
        [FromForm] string? contractHash,
        [FromForm] IFormFile? file,
        CancellationToken cancellationToken)
    {
        var result = await _publicContractService.VerifyAsync(contractHash, file, cancellationToken);
        return StatusCode(result.StatusCode, result.Payload);
    }
}
