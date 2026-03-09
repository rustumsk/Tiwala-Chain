using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

public sealed class JwtTokenService
{
    private readonly IConfiguration _configuration;

    public JwtTokenService(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public (string token, DateTime expiresAtUtc) CreateToken(User user)
    {
        var issuer = _configuration["Jwt:Issuer"]
            ?? throw new InvalidOperationException("Missing Jwt:Issuer configuration.");
        var audience = _configuration["Jwt:Audience"]
            ?? throw new InvalidOperationException("Missing Jwt:Audience configuration.");
        var key = _configuration["Jwt:Key"]
            ?? throw new InvalidOperationException("Missing Jwt:Key configuration.");
        var lifetimeMinutes = _configuration.GetValue<int?>("Jwt:AccessTokenMinutes") ?? 120;
        var expiresAt = DateTime.UtcNow.AddMinutes(lifetimeMinutes);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new("wallet", user.WalletAddress),
            new(ClaimTypes.Role, user.Role.ToString()),
        };

        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)),
            SecurityAlgorithms.HmacSha256);

        var descriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = expiresAt,
            SigningCredentials = credentials,
            Issuer = issuer,
            Audience = audience,
        };

        var tokenHandler = new JwtSecurityTokenHandler();
        var token = tokenHandler.CreateToken(descriptor);
        return (tokenHandler.WriteToken(token), expiresAt);
    }
}
