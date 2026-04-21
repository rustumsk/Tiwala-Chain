using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Nethereum.Signer;

public sealed class AuthService
{
    private const int DefaultChainId = 11155111;
    private const string NonceCacheKeyPrefix = "auth:nonce:";

    private readonly AppDbContext _dbContext;
    private readonly IMemoryCache _cache;
    private readonly JwtTokenService _tokenService;
    private readonly HashSet<string> _adminWallets;

    public AuthService(
        AppDbContext dbContext,
        IMemoryCache cache,
        JwtTokenService tokenService,
        IConfiguration configuration)
    {
        _dbContext = dbContext;
        _cache = cache;
        _tokenService = tokenService;
        _adminWallets = (configuration.GetSection("AdminWallets").Get<string[]>() ?? [])
            .Select(w => w.Trim().ToLowerInvariant())
            .Where(w => WalletNormalizer.NormalizeWalletAddress(w) is not null)
            .ToHashSet();
    }

    public AuthServiceResult<NonceResponse> CreateNonce(
        NonceRequest request,
        string hostValue,
        string scheme,
        string domain)
    {
        var normalizedWallet = WalletNormalizer.NormalizeWalletAddress(request.WalletAddress);
        if (normalizedWallet is null)
        {
            return AuthServiceResult<NonceResponse>.BadRequest("Invalid wallet address.");
        }

        var nonce = Guid.NewGuid().ToString("N")[..12];
        var chainId = request.ChainId > 0 ? request.ChainId : DefaultChainId;
        var now = DateTimeOffset.UtcNow;
        var expiresAt = now.AddMinutes(5);
        var uri = $"{scheme}://{hostValue}";

        var message = $"{normalizedWallet} wants to sign in with their Ethereum account:\n{normalizedWallet}\n\nSign this message to authenticate with TiwalaChain.\n\nURI: {uri}\nVersion: 1\nChain ID: {chainId}\nNonce: {nonce}\nIssued At: {now:O}";

        _cache.Set(GetNonceCacheKey(normalizedWallet), new PendingNonce(message, nonce), expiresAt);

        return AuthServiceResult<NonceResponse>.Success(new NonceResponse(message, nonce, expiresAt.UtcDateTime, domain, uri, chainId));
    }

    public async Task<AuthServiceResult<AuthResponse>> VerifySignatureAsync(
        VerifyRequest request,
        CancellationToken cancellationToken)
    {
        var normalizedWallet = WalletNormalizer.NormalizeWalletAddress(request.WalletAddress);
        if (normalizedWallet is null)
        {
            return AuthServiceResult<AuthResponse>.BadRequest("Invalid wallet address.");
        }

        if (!_cache.TryGetValue(GetNonceCacheKey(normalizedWallet), out PendingNonce? pendingNonce) || pendingNonce is null)
        {
            return AuthServiceResult<AuthResponse>.Unauthorized("Auth challenge expired. Request a new nonce.");
        }

        if (!string.Equals(pendingNonce.Message, request.Message, StringComparison.Ordinal))
        {
            return AuthServiceResult<AuthResponse>.Unauthorized("Message mismatch.");
        }

        if (!request.Message.Contains($"Nonce: {pendingNonce.Nonce}", StringComparison.Ordinal))
        {
            return AuthServiceResult<AuthResponse>.Unauthorized("Nonce mismatch.");
        }

        string recoveredAddress;
        try
        {
            recoveredAddress = new EthereumMessageSigner().EncodeUTF8AndEcRecover(request.Message, request.Signature);
        }
        catch
        {
            return AuthServiceResult<AuthResponse>.Unauthorized("Invalid signature.");
        }

        var normalizedRecoveredAddress = WalletNormalizer.NormalizeWalletAddress(recoveredAddress);
        if (normalizedRecoveredAddress is null || !string.Equals(normalizedRecoveredAddress, normalizedWallet, StringComparison.Ordinal))
        {
            return AuthServiceResult<AuthResponse>.Unauthorized("Signature does not match wallet.");
        }

        _cache.Remove(GetNonceCacheKey(normalizedWallet));

        var user = await _dbContext.Users
            .FirstOrDefaultAsync(u => u.WalletAddress == normalizedWallet, cancellationToken);

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
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        else if (isAdminWallet && user.Role != UserRole.Admin)
        {
            user.Role = UserRole.Admin;
            user.IsApproved = true;
            await _dbContext.SaveChangesAsync(cancellationToken);
        }

        var (token, expiresAtUtc) = _tokenService.CreateToken(user);
        return AuthServiceResult<AuthResponse>.Success(AuthMapper.ToAuthResponse(user, token, expiresAtUtc));
    }

    public async Task<UserResponse> GetCurrentUserResponseAsync(
        User user,
        CancellationToken cancellationToken)
    {
        var canDeleteAccount = await CanUserDeleteOwnAccountAsync(user, cancellationToken);
        return AuthMapper.ToUserResponse(user, canDeleteAccount);
    }

    public async Task<AuthServiceResult<UserResponse>> UpdateProfileAsync(
        User user,
        UpdateProfileRequest request,
        CancellationToken cancellationToken)
    {
        var normalizedName = request.DisplayName?.Trim();
        if (string.IsNullOrWhiteSpace(normalizedName) || normalizedName.Length < 2)
        {
            return AuthServiceResult<UserResponse>.BadRequest("Display name must be at least 2 characters.");
        }

        if (!AuthPolicy.TryParseRole(request.Role, out var parsedRole))
        {
            return AuthServiceResult<UserResponse>.BadRequest("Role must be freelancer, employer, or both.");
        }

        user.DisplayName = normalizedName;
        user.Role = parsedRole;
        await _dbContext.SaveChangesAsync(cancellationToken);

        var canDeleteAccount = await CanUserDeleteOwnAccountAsync(user, cancellationToken);
        return AuthServiceResult<UserResponse>.Success(AuthMapper.ToUserResponse(user, canDeleteAccount));
    }

    public async Task<AuthServiceResult<bool>> DeleteOwnAccountAsync(
        User user,
        CancellationToken cancellationToken)
    {
        if (user.Role == UserRole.Admin)
        {
            return AuthServiceResult<bool>.BadRequest("Admin accounts cannot be deleted here. Contact support if needed.");
        }

        if (!AuthPolicy.IsSelfServeDeletableRole(user.Role))
        {
            return AuthServiceResult<bool>.BadRequest("This account type cannot be deleted automatically.");
        }

        if (await HasOngoingJobsForWalletAsync(user.WalletAddress, cancellationToken))
        {
            return AuthServiceResult<bool>.BadRequest("Finish or resolve pending offers and accepted jobs before deleting your account.");
        }

        _dbContext.Users.Remove(user);
        await _dbContext.SaveChangesAsync(cancellationToken);
        return AuthServiceResult<bool>.Success(true);
    }

    public async Task<AuthServiceResult<List<AdminUserResponse>>> AdminListUsersAsync(
        User admin,
        CancellationToken cancellationToken)
    {
        if (admin.Role != UserRole.Admin)
        {
            return AuthServiceResult<List<AdminUserResponse>>.Forbidden();
        }

        var users = await _dbContext.Users
            .OrderByDescending(u => u.CreatedAt)
            .ToListAsync(cancellationToken);

        var ongoingJobs = await _dbContext.Jobs.AsNoTracking()
            .Where(j => j.Status == JobStatus.PendingOffer || j.Status == JobStatus.Accepted)
            .ToListAsync(cancellationToken);

        var walletsWithOngoingJobs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var job in ongoingJobs)
        {
            walletsWithOngoingJobs.Add(job.EmployerWallet);
            walletsWithOngoingJobs.Add(job.FreelancerWallet);
        }

        var result = users.Select(u =>
        {
            var canDelete = u.Role != UserRole.Admin
                && u.Id != admin.Id
                && !walletsWithOngoingJobs.Contains(u.WalletAddress);
            return AuthMapper.ToAdminUserResponse(u, canDelete);
        }).ToList();

        return AuthServiceResult<List<AdminUserResponse>>.Success(result);
    }

    public async Task<AuthServiceResult<bool>> AdminDeleteUserAsync(
        User admin,
        int id,
        CancellationToken cancellationToken)
    {
        if (admin.Role != UserRole.Admin)
        {
            return AuthServiceResult<bool>.Forbidden();
        }

        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == id, cancellationToken);
        if (user is null)
        {
            return AuthServiceResult<bool>.NotFound("User not found.");
        }

        if (user.Id == admin.Id)
        {
            return AuthServiceResult<bool>.BadRequest("Cannot delete your own admin account.");
        }

        if (user.Role == UserRole.Admin)
        {
            return AuthServiceResult<bool>.BadRequest("Admin accounts cannot be deleted.");
        }

        if (user.Role != UserRole.Freelancer && user.Role != UserRole.Employer && user.Role != UserRole.Both)
        {
            return AuthServiceResult<bool>.BadRequest("Only freelancer, employer, or both accounts can be removed this way.");
        }

        if (await HasOngoingJobsForWalletAsync(user.WalletAddress, cancellationToken))
        {
            return AuthServiceResult<bool>.BadRequest("Cannot delete a user who has ongoing jobs (pending offer or accepted).");
        }

        _dbContext.Users.Remove(user);
        await _dbContext.SaveChangesAsync(cancellationToken);
        return AuthServiceResult<bool>.Success(true);
    }

    public async Task<AuthServiceResult<UserResponse>> AdminApproveUserAsync(
        User admin,
        int id,
        ApproveRequest request,
        CancellationToken cancellationToken)
    {
        if (admin.Role != UserRole.Admin)
        {
            return AuthServiceResult<UserResponse>.Forbidden();
        }

        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == id, cancellationToken);
        if (user is null)
        {
            return AuthServiceResult<UserResponse>.NotFound("User not found.");
        }

        user.IsApproved = request.Approved;
        await _dbContext.SaveChangesAsync(cancellationToken);
        return AuthServiceResult<UserResponse>.Success(AuthMapper.ToUserResponse(user));
    }

    public async Task<AuthServiceResult<UserResponse>> AdminUpdateUserRoleAsync(
        User admin,
        int id,
        UpdateRoleRequest request,
        CancellationToken cancellationToken)
    {
        if (admin.Role != UserRole.Admin)
        {
            return AuthServiceResult<UserResponse>.Forbidden();
        }

        if (!AuthPolicy.TryParseRole(request.Role, out var parsedRole))
        {
            return AuthServiceResult<UserResponse>.BadRequest("Role must be freelancer, employer, both, or admin.");
        }

        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == id, cancellationToken);
        if (user is null)
        {
            return AuthServiceResult<UserResponse>.NotFound("User not found.");
        }

        user.Role = parsedRole;
        if (parsedRole == UserRole.Admin)
        {
            user.IsApproved = true;
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
        return AuthServiceResult<UserResponse>.Success(AuthMapper.ToUserResponse(user));
    }

    private async Task<bool> HasOngoingJobsForWalletAsync(
        string wallet,
        CancellationToken cancellationToken)
    {
        return await _dbContext.Jobs.AnyAsync(
            j => (j.EmployerWallet == wallet || j.FreelancerWallet == wallet)
                 && (j.Status == JobStatus.PendingOffer || j.Status == JobStatus.Accepted),
            cancellationToken);
    }

    private async Task<bool> CanUserDeleteOwnAccountAsync(
        User user,
        CancellationToken cancellationToken)
    {
        if (user.Role == UserRole.Admin || !AuthPolicy.IsSelfServeDeletableRole(user.Role))
        {
            return false;
        }

        return !await HasOngoingJobsForWalletAsync(user.WalletAddress, cancellationToken);
    }

    private static string GetNonceCacheKey(string walletAddress) => $"{NonceCacheKeyPrefix}{walletAddress}";
}

public sealed class AuthServiceResult<T>
{
    private AuthServiceResult(AuthServiceResultStatus status, T? value, string? error)
    {
        Status = status;
        Value = value;
        Error = error;
    }

    public AuthServiceResultStatus Status { get; }
    public T? Value { get; }
    public string? Error { get; }

    public static AuthServiceResult<T> Success(T value) => new(AuthServiceResultStatus.Success, value, null);
    public static AuthServiceResult<T> BadRequest(string error) => new(AuthServiceResultStatus.BadRequest, default, error);
    public static AuthServiceResult<T> NotFound(string error) => new(AuthServiceResultStatus.NotFound, default, error);
    public static AuthServiceResult<T> Unauthorized(string error) => new(AuthServiceResultStatus.Unauthorized, default, error);
    public static AuthServiceResult<T> Forbidden(string? error = null) => new(AuthServiceResultStatus.Forbidden, default, error);
}

public enum AuthServiceResultStatus
{
    Success,
    BadRequest,
    NotFound,
    Unauthorized,
    Forbidden,
}
