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

    public ServiceResult<NonceResponse> CreateNonce(
        NonceRequest request,
        string hostValue,
        string scheme,
        string domain)
    {
        var normalizedWallet = WalletNormalizer.NormalizeWalletAddress(request.WalletAddress);
        if (normalizedWallet is null)
        {
            return ServiceResult<NonceResponse>.BadRequest("Invalid wallet address.");
        }

        var nonce = Guid.NewGuid().ToString("N")[..12];
        var chainId = request.ChainId > 0 ? request.ChainId : DefaultChainId;
        var now = DateTimeOffset.UtcNow;
        var expiresAt = now.AddMinutes(5);
        var uri = $"{scheme}://{hostValue}";

        var message = $"{normalizedWallet} wants to sign in with their Ethereum account:\n{normalizedWallet}\n\nSign this message to authenticate with TiwalaChain.\n\nURI: {uri}\nVersion: 1\nChain ID: {chainId}\nNonce: {nonce}\nIssued At: {now:O}";

        _cache.Set(GetNonceCacheKey(normalizedWallet), new PendingNonce(message, nonce), expiresAt);

        return ServiceResult<NonceResponse>.Success(new NonceResponse(message, nonce, expiresAt.UtcDateTime, domain, uri, chainId));
    }

    public async Task<ServiceResult<AuthResponse>> VerifySignatureAsync(
        VerifyRequest request,
        CancellationToken cancellationToken)
    {
        var normalizedWallet = WalletNormalizer.NormalizeWalletAddress(request.WalletAddress);
        if (normalizedWallet is null)
        {
            return ServiceResult<AuthResponse>.BadRequest("Invalid wallet address.");
        }

        if (!_cache.TryGetValue(GetNonceCacheKey(normalizedWallet), out PendingNonce? pendingNonce) || pendingNonce is null)
        {
            return ServiceResult<AuthResponse>.Unauthorized("Auth challenge expired. Request a new nonce.");
        }

        if (!string.Equals(pendingNonce.Message, request.Message, StringComparison.Ordinal))
        {
            return ServiceResult<AuthResponse>.Unauthorized("Message mismatch.");
        }

        if (!request.Message.Contains($"Nonce: {pendingNonce.Nonce}", StringComparison.Ordinal))
        {
            return ServiceResult<AuthResponse>.Unauthorized("Nonce mismatch.");
        }

        string recoveredAddress;
        try
        {
            recoveredAddress = new EthereumMessageSigner().EncodeUTF8AndEcRecover(request.Message, request.Signature);
        }
        catch
        {
            return ServiceResult<AuthResponse>.Unauthorized("Invalid signature.");
        }

        var normalizedRecoveredAddress = WalletNormalizer.NormalizeWalletAddress(recoveredAddress);
        if (normalizedRecoveredAddress is null || !string.Equals(normalizedRecoveredAddress, normalizedWallet, StringComparison.Ordinal))
        {
            return ServiceResult<AuthResponse>.Unauthorized("Signature does not match wallet.");
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
        return ServiceResult<AuthResponse>.Success(AuthMapper.ToAuthResponse(user, token, expiresAtUtc));
    }

    public async Task<UserResponse> GetCurrentUserResponseAsync(
        User user,
        CancellationToken cancellationToken)
    {
        var canDeleteAccount = await CanUserDeleteOwnAccountAsync(user, cancellationToken);
        return AuthMapper.ToUserResponse(user, canDeleteAccount);
    }

    public async Task<ServiceResult<UserResponse>> UpdateProfileAsync(
        User user,
        UpdateProfileRequest request,
        CancellationToken cancellationToken)
    {
        var normalizedName = request.DisplayName?.Trim();
        if (string.IsNullOrWhiteSpace(normalizedName) || normalizedName.Length < 2)
        {
            return ServiceResult<UserResponse>.BadRequest("Display name must be at least 2 characters.");
        }

        if (!AuthPolicy.TryParseRole(request.Role, out var parsedRole))
        {
            return ServiceResult<UserResponse>.BadRequest("Role must be freelancer, employer, or both.");
        }

        user.DisplayName = normalizedName;
        user.Role = parsedRole;
        await _dbContext.SaveChangesAsync(cancellationToken);

        var canDeleteAccount = await CanUserDeleteOwnAccountAsync(user, cancellationToken);
        return ServiceResult<UserResponse>.Success(AuthMapper.ToUserResponse(user, canDeleteAccount));
    }

    public async Task<ServiceResult<bool>> DeleteOwnAccountAsync(
        User user,
        CancellationToken cancellationToken)
    {
        if (user.Role == UserRole.Admin)
        {
            return ServiceResult<bool>.BadRequest("Admin accounts cannot be deleted here. Contact support if needed.");
        }

        if (!AuthPolicy.IsSelfServeDeletableRole(user.Role))
        {
            return ServiceResult<bool>.BadRequest("This account type cannot be deleted automatically.");
        }

        if (await HasOngoingJobsForWalletAsync(user.WalletAddress, cancellationToken))
        {
            return ServiceResult<bool>.BadRequest("Finish or resolve pending offers and accepted jobs before deleting your account.");
        }

        _dbContext.Users.Remove(user);
        await _dbContext.SaveChangesAsync(cancellationToken);
        return ServiceResult<bool>.Success(true);
    }

    public async Task<ServiceResult<List<AdminUserResponse>>> AdminListUsersAsync(
        User admin,
        CancellationToken cancellationToken)
    {
        if (admin.Role != UserRole.Admin)
        {
            return ServiceResult<List<AdminUserResponse>>.Forbidden();
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

        return ServiceResult<List<AdminUserResponse>>.Success(result);
    }

    public async Task<ServiceResult<bool>> AdminDeleteUserAsync(
        User admin,
        int id,
        CancellationToken cancellationToken)
    {
        if (admin.Role != UserRole.Admin)
        {
            return ServiceResult<bool>.Forbidden();
        }

        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == id, cancellationToken);
        if (user is null)
        {
            return ServiceResult<bool>.NotFound("User not found.");
        }

        if (user.Id == admin.Id)
        {
            return ServiceResult<bool>.BadRequest("Cannot delete your own admin account.");
        }

        if (user.Role == UserRole.Admin)
        {
            return ServiceResult<bool>.BadRequest("Admin accounts cannot be deleted.");
        }

        if (user.Role != UserRole.Freelancer && user.Role != UserRole.Employer && user.Role != UserRole.Both)
        {
            return ServiceResult<bool>.BadRequest("Only freelancer, employer, or both accounts can be removed this way.");
        }

        if (await HasOngoingJobsForWalletAsync(user.WalletAddress, cancellationToken))
        {
            return ServiceResult<bool>.BadRequest("Cannot delete a user who has ongoing jobs (pending offer or accepted).");
        }

        _dbContext.Users.Remove(user);
        await _dbContext.SaveChangesAsync(cancellationToken);
        return ServiceResult<bool>.Success(true);
    }

    public async Task<ServiceResult<UserResponse>> AdminApproveUserAsync(
        User admin,
        int id,
        ApproveRequest request,
        CancellationToken cancellationToken)
    {
        if (admin.Role != UserRole.Admin)
        {
            return ServiceResult<UserResponse>.Forbidden();
        }

        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == id, cancellationToken);
        if (user is null)
        {
            return ServiceResult<UserResponse>.NotFound("User not found.");
        }

        user.IsApproved = request.Approved;
        await _dbContext.SaveChangesAsync(cancellationToken);
        return ServiceResult<UserResponse>.Success(AuthMapper.ToUserResponse(user));
    }

    public async Task<ServiceResult<UserResponse>> AdminUpdateUserRoleAsync(
        User admin,
        int id,
        UpdateRoleRequest request,
        CancellationToken cancellationToken)
    {
        if (admin.Role != UserRole.Admin)
        {
            return ServiceResult<UserResponse>.Forbidden();
        }

        if (!AuthPolicy.TryParseRole(request.Role, out var parsedRole))
        {
            return ServiceResult<UserResponse>.BadRequest("Role must be freelancer, employer, both, or admin.");
        }

        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == id, cancellationToken);
        if (user is null)
        {
            return ServiceResult<UserResponse>.NotFound("User not found.");
        }

        user.Role = parsedRole;
        if (parsedRole == UserRole.Admin)
        {
            user.IsApproved = true;
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
        return ServiceResult<UserResponse>.Success(AuthMapper.ToUserResponse(user));
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
