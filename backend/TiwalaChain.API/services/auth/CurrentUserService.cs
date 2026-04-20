using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;

public sealed class CurrentUserService
{
    private readonly AppDbContext _dbContext;

    public CurrentUserService(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<User?> GetAsync(ClaimsPrincipal principal, CancellationToken cancellationToken)
    {
        var subjectClaim = principal.FindFirstValue(JwtRegisteredClaimNames.Sub)
            ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);

        if (!int.TryParse(subjectClaim, out var userId))
        {
            return null;
        }

        return await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);
    }
}
