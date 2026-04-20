using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Nethereum.Signer;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text.RegularExpressions;

[ApiController]
[Route("api/[controller]")]
public sealed partial class AuthController : ControllerBase
{
    private const int DefaultChainId = 11155111;
    private const string NonceCacheKeyPrefix = "auth:nonce:";

    private readonly AppDbContext _dbContext;
    private readonly IMemoryCache _cache;
    private readonly JwtTokenService _tokenService;
    private readonly HashSet<string> _adminWallets;

    public AuthController(AppDbContext dbContext, IMemoryCache cache, JwtTokenService tokenService, IConfiguration configuration)
    {
        _dbContext = dbContext;
        _cache = cache;
        _tokenService = tokenService;
        _adminWallets = (configuration.GetSection("AdminWallets").Get<string[]>() ?? [])
            .Select(w => w.Trim().ToLowerInvariant())
            .Where(w => WalletRegex().IsMatch(w))
            .ToHashSet();
    }

    [HttpPost("nonce")]
    public ActionResult<NonceResponse> CreateNonce([FromBody] NonceRequest request)
    {
        var normalizedWallet = NormalizeWalletAddress(request.WalletAddress);
        if (normalizedWallet is null)
        {
            return BadRequest("Invalid wallet address.");
        }

        var nonce = Guid.NewGuid().ToString("N")[..12];
        var chainId = request.ChainId > 0 ? request.ChainId : DefaultChainId;
        var now = DateTimeOffset.UtcNow;
        var expiresAt = now.AddMinutes(5);
        var host = Request.Host.HasValue ? Request.Host.Value : "localhost";
        var scheme = Request.Scheme ?? "http";
        var uri = $"{scheme}://{host}";
        var domain = Request.Host.HasValue ? Request.Host.Host : "localhost";

        var message = $"{normalizedWallet} wants to sign in with their Ethereum account:\n{normalizedWallet}\n\nSign this message to authenticate with TiwalaChain.\n\nURI: {uri}\nVersion: 1\nChain ID: {chainId}\nNonce: {nonce}\nIssued At: {now:O}";

        _cache.Set(GetNonceCacheKey(normalizedWallet), new PendingNonce(message, nonce), expiresAt);

        return Ok(new NonceResponse(message, nonce, expiresAt.UtcDateTime, domain, uri, chainId));
    }

    [HttpPost("verify")]
    public async Task<ActionResult<AuthResponse>> VerifySignature([FromBody] VerifyRequest request)
    {
        var normalizedWallet = NormalizeWalletAddress(request.WalletAddress);
        if (normalizedWallet is null)
        {
            return BadRequest("Invalid wallet address.");
        }

        if (!_cache.TryGetValue(GetNonceCacheKey(normalizedWallet), out PendingNonce? pendingNonce) || pendingNonce is null)
        {
            return Unauthorized("Auth challenge expired. Request a new nonce.");
        }

        if (!string.Equals(pendingNonce.Message, request.Message, StringComparison.Ordinal))
        {
            return Unauthorized("Message mismatch.");
        }

        if (!request.Message.Contains($"Nonce: {pendingNonce.Nonce}", StringComparison.Ordinal))
        {
            return Unauthorized("Nonce mismatch.");
        }

        string recoveredAddress;
        try
        {
            recoveredAddress = new EthereumMessageSigner().EncodeUTF8AndEcRecover(request.Message, request.Signature);
        }
        catch
        {
            return Unauthorized("Invalid signature.");
        }

        var normalizedRecoveredAddress = NormalizeWalletAddress(recoveredAddress);
        if (normalizedRecoveredAddress is null || !string.Equals(normalizedRecoveredAddress, normalizedWallet, StringComparison.Ordinal))
        {
            return Unauthorized("Signature does not match wallet.");
        }

        _cache.Remove(GetNonceCacheKey(normalizedWallet));

        var user = await _dbContext.Users
            .FirstOrDefaultAsync(u => u.WalletAddress == normalizedWallet);

        var isAdminWallet = _adminWallets.Contains(normalizedWallet);

        if (user is null)
        {
            user = new User
            {
                WalletAddress = normalizedWallet,
                Role = isAdminWallet ? UserRole.Admin : UserRole.Freelancer,
                IsApproved = isAdminWallet,
            };
            _dbContext.Users.Add(user);
            await _dbContext.SaveChangesAsync();
        }
        else if (isAdminWallet && user.Role != UserRole.Admin)
        {
            user.Role = UserRole.Admin;
            user.IsApproved = true;
            await _dbContext.SaveChangesAsync();
        }

        var (token, expiresAtUtc) = _tokenService.CreateToken(user);
        return Ok(ToAuthResponse(user, token, expiresAtUtc));
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<ActionResult<UserResponse>> Me()
    {
        var user = await ResolveCurrentUser();
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var canDeleteAccount = await CanUserDeleteOwnAccountAsync(user);
        return Ok(ToUserResponse(user, canDeleteAccount));
    }

    [Authorize]
    [HttpDelete("account")]
    public async Task<IActionResult> DeleteOwnAccount()
    {
        var user = await ResolveCurrentUser();
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        if (user.Role == UserRole.Admin)
        {
            return BadRequest("Admin accounts cannot be deleted here. Contact support if needed.");
        }

        if (!IsSelfServeDeletableRole(user.Role))
        {
            return BadRequest("This account type cannot be deleted automatically.");
        }

        if (await HasOngoingJobsForWalletAsync(user.WalletAddress))
        {
            return BadRequest("Finish or resolve pending offers and accepted jobs before deleting your account.");
        }

        _dbContext.Users.Remove(user);
        await _dbContext.SaveChangesAsync();
        return NoContent();
    }

    [Authorize]
    [HttpPut("profile")]
    public async Task<ActionResult<UserResponse>> UpdateProfile([FromBody] UpdateProfileRequest request)
    {
        var user = await ResolveCurrentUser();
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var normalizedName = request.DisplayName?.Trim();
        if (string.IsNullOrWhiteSpace(normalizedName) || normalizedName.Length < 2)
        {
            return BadRequest("Display name must be at least 2 characters.");
        }

        if (!TryParseRole(request.Role, out var parsedRole))
        {
            return BadRequest("Role must be freelancer, employer, or both.");
        }

        user.DisplayName = normalizedName;
        user.Role = parsedRole;
        await _dbContext.SaveChangesAsync();

        var canDeleteAccount = await CanUserDeleteOwnAccountAsync(user);
        return Ok(ToUserResponse(user, canDeleteAccount));
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
        var admin = await ResolveCurrentUser();
        if (admin is null || admin.Role != UserRole.Admin)
            return Forbid();

        var users = await _dbContext.Users
            .OrderByDescending(u => u.CreatedAt)
            .ToListAsync();

        var ongoingJobs = await _dbContext.Jobs.AsNoTracking()
            .Where(j => j.Status == JobStatus.PendingOffer || j.Status == JobStatus.Accepted)
            .ToListAsync();

        var walletsWithOngoingJobs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var j in ongoingJobs)
        {
            walletsWithOngoingJobs.Add(j.EmployerWallet);
            walletsWithOngoingJobs.Add(j.FreelancerWallet);
        }

        var result = users.Select(u =>
        {
            var canDelete = u.Role != UserRole.Admin
                && u.Id != admin.Id
                && !walletsWithOngoingJobs.Contains(u.WalletAddress);
            return ToAdminUserResponse(u, canDelete);
        }).ToList();

        return Ok(result);
    }

    [Authorize]
    [HttpDelete("admin/users/{id:int}")]
    public async Task<IActionResult> AdminDeleteUser(int id)
    {
        var admin = await ResolveCurrentUser();
        if (admin is null || admin.Role != UserRole.Admin)
            return Forbid();

        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == id);
        if (user is null)
            return NotFound("User not found.");

        if (user.Id == admin.Id)
            return BadRequest("Cannot delete your own admin account.");

        if (user.Role == UserRole.Admin)
            return BadRequest("Admin accounts cannot be deleted.");

        if (user.Role != UserRole.Freelancer && user.Role != UserRole.Employer && user.Role != UserRole.Both)
            return BadRequest("Only freelancer, employer, or both accounts can be removed this way.");

        if (await HasOngoingJobsForWalletAsync(user.WalletAddress))
            return BadRequest("Cannot delete a user who has ongoing jobs (pending offer or accepted).");

        _dbContext.Users.Remove(user);
        await _dbContext.SaveChangesAsync();
        return NoContent();
    }

    [Authorize]
    [HttpPut("admin/users/{id:int}/approve")]
    public async Task<ActionResult<UserResponse>> AdminApproveUser(int id, [FromBody] ApproveRequest request)
    {
        var admin = await ResolveCurrentUser();
        if (admin is null || admin.Role != UserRole.Admin)
            return Forbid();

        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == id);
        if (user is null)
            return NotFound("User not found.");

        user.IsApproved = request.Approved;
        await _dbContext.SaveChangesAsync();
        return Ok(ToUserResponse(user));
    }

    [Authorize]
    [HttpPut("admin/users/{id:int}/role")]
    public async Task<ActionResult<UserResponse>> AdminUpdateUserRole(int id, [FromBody] UpdateRoleRequest request)
    {
        var admin = await ResolveCurrentUser();
        if (admin is null || admin.Role != UserRole.Admin)
            return Forbid();

        if (!TryParseRole(request.Role, out var parsedRole))
            return BadRequest("Role must be freelancer, employer, both, or admin.");

        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == id);
        if (user is null)
            return NotFound("User not found.");

        user.Role = parsedRole;
        if (parsedRole == UserRole.Admin)
            user.IsApproved = true;
        await _dbContext.SaveChangesAsync();
        return Ok(ToUserResponse(user));
    }

    private async Task<User?> ResolveCurrentUser()
    {
        var subjectClaim = User.FindFirstValue(JwtRegisteredClaimNames.Sub)
            ?? User.FindFirstValue(ClaimTypes.NameIdentifier);

        if (!int.TryParse(subjectClaim, out var userId))
        {
            return null;
        }

        return await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == userId);
    }

    private static string? NormalizeWalletAddress(string? walletAddress)
    {
        if (string.IsNullOrWhiteSpace(walletAddress))
        {
            return null;
        }

        var normalized = walletAddress.Trim().ToLowerInvariant();
        return WalletRegex().IsMatch(normalized) ? normalized : null;
    }

    private static bool TryParseRole(string? roleValue, out UserRole role)
    {
        role = UserRole.Freelancer;
        if (string.IsNullOrWhiteSpace(roleValue))
        {
            return false;
        }

        return roleValue.Trim().ToLowerInvariant() switch
        {
            "freelancer" => (role = UserRole.Freelancer) == UserRole.Freelancer,
            "employer" => (role = UserRole.Employer) == UserRole.Employer,
            "both" => (role = UserRole.Both) == UserRole.Both,
            "admin" => (role = UserRole.Admin) == UserRole.Admin,
            _ => false,
        };
    }

    private static AuthResponse ToAuthResponse(User user, string token, DateTime expiresAtUtc)
    {
        return new AuthResponse(token, expiresAtUtc, ToUserResponse(user));
    }

    private static UserResponse ToUserResponse(User user, bool canDeleteAccount = false)
    {
        return new UserResponse(
            user.Id,
            user.WalletAddress,
            user.DisplayName,
            user.Role.ToString().ToLowerInvariant(),
            user.IsApproved,
            user.CreatedAt,
            canDeleteAccount);
    }

    private async Task<bool> HasOngoingJobsForWalletAsync(string wallet, CancellationToken cancellationToken = default)
    {
        return await _dbContext.Jobs.AnyAsync(
            j => (j.EmployerWallet == wallet || j.FreelancerWallet == wallet)
                 && (j.Status == JobStatus.PendingOffer || j.Status == JobStatus.Accepted),
            cancellationToken);
    }

    private static bool IsSelfServeDeletableRole(UserRole role) =>
        role is UserRole.Freelancer or UserRole.Employer or UserRole.Both;

    private async Task<bool> CanUserDeleteOwnAccountAsync(User user, CancellationToken cancellationToken = default)
    {
        if (user.Role == UserRole.Admin || !IsSelfServeDeletableRole(user.Role))
        {
            return false;
        }

        return !await HasOngoingJobsForWalletAsync(user.WalletAddress, cancellationToken);
    }

    private static AdminUserResponse ToAdminUserResponse(User user, bool canDelete)
    {
        return new AdminUserResponse(
            user.Id,
            user.WalletAddress,
            user.DisplayName,
            user.Role.ToString().ToLowerInvariant(),
            user.IsApproved,
            user.CreatedAt,
            canDelete);
    }

    private static string GetNonceCacheKey(string walletAddress) => $"{NonceCacheKeyPrefix}{walletAddress}";

    [GeneratedRegex("^0x[a-f0-9]{40}$", RegexOptions.Compiled)]
    private static partial Regex WalletRegex();
}
