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

    public AuthController(AppDbContext dbContext, IMemoryCache cache, JwtTokenService tokenService)
    {
        _dbContext = dbContext;
        _cache = cache;
        _tokenService = tokenService;
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

        if (user is null)
        {
            user = new User
            {
                WalletAddress = normalizedWallet,
                Role = UserRole.Freelancer,
            };
            _dbContext.Users.Add(user);
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

        return Ok(ToUserResponse(user));
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

        return Ok(ToUserResponse(user));
    }

    [Authorize]
    [HttpPost("logout")]
    public IActionResult Logout()
    {
        return Ok();
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
            _ => false,
        };
    }

    private static AuthResponse ToAuthResponse(User user, string token, DateTime expiresAtUtc)
    {
        return new AuthResponse(token, expiresAtUtc, ToUserResponse(user));
    }

    private static UserResponse ToUserResponse(User user)
    {
        return new UserResponse(user.Id, user.WalletAddress, user.DisplayName, user.Role.ToString().ToLowerInvariant(), user.CreatedAt);
    }

    private static string GetNonceCacheKey(string walletAddress) => $"{NonceCacheKeyPrefix}{walletAddress}";

    [GeneratedRegex("^0x[a-f0-9]{40}$", RegexOptions.Compiled)]
    private static partial Regex WalletRegex();
}

public sealed record NonceRequest(string WalletAddress, int ChainId = 0);
public sealed record NonceResponse(string Message, string Nonce, DateTime ExpiresAtUtc, string Domain, string Uri, int ChainId);
public sealed record VerifyRequest(string WalletAddress, string Message, string Signature);
public sealed record AuthResponse(string AccessToken, DateTime ExpiresAtUtc, UserResponse User);
public sealed record UserResponse(int Id, string WalletAddress, string? DisplayName, string Role, DateTime CreatedAt);
public sealed record UpdateProfileRequest(string DisplayName, string Role);
public sealed record PendingNonce(string Message, string Nonce);
