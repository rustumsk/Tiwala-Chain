using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/[controller]")]
public sealed partial class AuthController : ControllerBase
{
    private readonly AuthService _authService;
    private readonly CurrentUserService _currentUserService;

    public AuthController(
        AuthService authService,
        CurrentUserService currentUserService)
    {
        _authService = authService;
        _currentUserService = currentUserService;
    }

    [HttpPost("nonce")]
    public ActionResult<NonceResponse> CreateNonce([FromBody] NonceRequest request)
    {
        var host = Request.Host.HasValue ? Request.Host.Value : "localhost";
        var scheme = Request.Scheme ?? "http";
        var domain = Request.Host.HasValue ? Request.Host.Host : "localhost";

        var result = _authService.CreateNonce(request, host, scheme, domain);
        return ToActionResult(result);
    }

    [HttpPost("verify")]
    public async Task<ActionResult<AuthResponse>> VerifySignature([FromBody] VerifyRequest request)
    {
        var result = await _authService.VerifySignatureAsync(request, HttpContext.RequestAborted);
        return ToActionResult(result);
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<ActionResult<UserResponse>> Me()
    {
        var user = await _currentUserService.GetAsync(User, HttpContext.RequestAborted);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        return Ok(await _authService.GetCurrentUserResponseAsync(user, HttpContext.RequestAborted));
    }

    [Authorize]
    [HttpDelete("account")]
    public async Task<IActionResult> DeleteOwnAccount()
    {
        var user = await _currentUserService.GetAsync(User, HttpContext.RequestAborted);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var result = await _authService.DeleteOwnAccountAsync(user, HttpContext.RequestAborted);
        return ToNoContentActionResult(result);
    }

    [Authorize]
    [HttpPut("profile")]
    public async Task<ActionResult<UserResponse>> UpdateProfile([FromBody] UpdateProfileRequest request)
    {
        var user = await _currentUserService.GetAsync(User, HttpContext.RequestAborted);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var result = await _authService.UpdateProfileAsync(user, request, HttpContext.RequestAborted);
        return ToActionResult(result);
    }

    [Authorize]
    [HttpPost("logout")]
    public IActionResult Logout()
    {
        return Ok();
    }

    [Authorize]
    [HttpGet("admin/users")]
    public async Task<ActionResult<List<AdminUserResponse>>> AdminListUsers()
    {
        var admin = await _currentUserService.GetAsync(User, HttpContext.RequestAborted);
        if (admin is null)
        {
            return Forbid();
        }

        var result = await _authService.AdminListUsersAsync(admin, HttpContext.RequestAborted);
        return ToActionResult(result);
    }

    [Authorize]
    [HttpDelete("admin/users/{id:int}")]
    public async Task<IActionResult> AdminDeleteUser(int id)
    {
        var admin = await _currentUserService.GetAsync(User, HttpContext.RequestAborted);
        if (admin is null)
        {
            return Forbid();
        }

        var result = await _authService.AdminDeleteUserAsync(admin, id, HttpContext.RequestAborted);
        return ToNoContentActionResult(result);
    }

    [Authorize]
    [HttpPut("admin/users/{id:int}/approve")]
    public async Task<ActionResult<UserResponse>> AdminApproveUser(int id, [FromBody] ApproveRequest request)
    {
        var admin = await _currentUserService.GetAsync(User, HttpContext.RequestAborted);
        if (admin is null)
        {
            return Forbid();
        }

        var result = await _authService.AdminApproveUserAsync(admin, id, request, HttpContext.RequestAborted);
        return ToActionResult(result);
    }

    [Authorize]
    [HttpPut("admin/users/{id:int}/role")]
    public async Task<ActionResult<UserResponse>> AdminUpdateUserRole(int id, [FromBody] UpdateRoleRequest request)
    {
        var admin = await _currentUserService.GetAsync(User, HttpContext.RequestAborted);
        if (admin is null)
        {
            return Forbid();
        }

        var result = await _authService.AdminUpdateUserRoleAsync(admin, id, request, HttpContext.RequestAborted);
        return ToActionResult(result);
    }

    private ActionResult<T> ToActionResult<T>(AuthServiceResult<T> result)
    {
        return result.Status switch
        {
            AuthServiceResultStatus.Success => Ok(result.Value),
            AuthServiceResultStatus.BadRequest => BadRequest(result.Error),
            AuthServiceResultStatus.NotFound => NotFound(result.Error),
            AuthServiceResultStatus.Unauthorized => Unauthorized(result.Error),
            AuthServiceResultStatus.Forbidden when result.Error is not null => StatusCode(403, result.Error),
            AuthServiceResultStatus.Forbidden => Forbid(),
            _ => StatusCode(StatusCodes.Status500InternalServerError),
        };
    }

    private IActionResult ToNoContentActionResult(AuthServiceResult<bool> result)
    {
        return result.Status switch
        {
            AuthServiceResultStatus.Success => NoContent(),
            AuthServiceResultStatus.BadRequest => BadRequest(result.Error),
            AuthServiceResultStatus.NotFound => NotFound(result.Error),
            AuthServiceResultStatus.Unauthorized => Unauthorized(result.Error),
            AuthServiceResultStatus.Forbidden when result.Error is not null => StatusCode(403, result.Error),
            AuthServiceResultStatus.Forbidden => Forbid(),
            _ => StatusCode(StatusCodes.Status500InternalServerError),
        };
    }
}
