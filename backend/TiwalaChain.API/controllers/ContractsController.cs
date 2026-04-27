using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

[ApiController]
[Route("api/[controller]")]
public sealed class ContractsController : ControllerBase
{
    private readonly CurrentUserService _currentUserService;
    private readonly PublicContractService _publicContractService;

    public ContractsController(
        CurrentUserService currentUserService,
        PublicContractService publicContractService)
    {
        _currentUserService = currentUserService;
        _publicContractService = publicContractService;
    }

    [Authorize]
    [EnableRateLimiting("contracts-evaluate")]
    [HttpPost("evaluate")]
    public async Task<IActionResult> Evaluate(
        [FromBody] PublicContractEvaluationRequest request,
        CancellationToken cancellationToken)
    {
        var user = await _currentUserService.GetAsync(User, cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        if (!user.IsApproved)
        {
            return StatusCode(403, "Your account is pending admin approval.");
        }

        if (!PostingPolicy.CanCreate(user.Role))
        {
            return Forbid();
        }

        var result = await _publicContractService.EvaluateAsync(request, cancellationToken);
        return StatusCode(result.StatusCode, result.Payload);
    }
}
