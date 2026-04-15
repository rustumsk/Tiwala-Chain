using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text.Json;

[ApiController]
[Route("api/[controller]")]
public sealed class NotificationsController : ControllerBase
{
    private readonly AppDbContext _dbContext;

    public NotificationsController(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    [Authorize]
    [HttpGet]
    public async Task<ActionResult<List<NotificationResponse>>> GetNotifications(
        [FromQuery] int limit = 25,
        CancellationToken cancellationToken = default)
    {
        var user = await ResolveCurrentUser();
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        limit = Math.Clamp(limit, 1, 100);
        var notifications = await _dbContext.Notifications
            .AsNoTracking()
            .Where(n => n.RecipientWallet == user.WalletAddress)
            .OrderByDescending(n => n.CreatedAt)
            .Take(limit)
            .ToListAsync(cancellationToken);

        return Ok(notifications.Select(ToNotificationResponse).ToList());
    }

    [Authorize]
    [HttpGet("unread-count")]
    public async Task<ActionResult<UnreadNotificationCountResponse>> GetUnreadCount(CancellationToken cancellationToken)
    {
        var user = await ResolveCurrentUser();
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var unreadCount = await _dbContext.Notifications.CountAsync(
            n => n.RecipientWallet == user.WalletAddress && !n.IsRead,
            cancellationToken);

        return Ok(new UnreadNotificationCountResponse(unreadCount));
    }

    [Authorize]
    [HttpPost("{id:int}/read")]
    public async Task<ActionResult<NotificationResponse>> MarkAsRead(int id, CancellationToken cancellationToken)
    {
        var user = await ResolveCurrentUser();
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var notification = await _dbContext.Notifications
            .FirstOrDefaultAsync(n => n.Id == id && n.RecipientWallet == user.WalletAddress, cancellationToken);
        if (notification is null)
        {
            return NotFound("Notification not found.");
        }

        if (!notification.IsRead)
        {
            notification.IsRead = true;
            notification.ReadAt = DateTime.UtcNow;
            await _dbContext.SaveChangesAsync(cancellationToken);
        }

        return Ok(ToNotificationResponse(notification));
    }

    [Authorize]
    [HttpPost("read-all")]
    public async Task<ActionResult<UnreadNotificationCountResponse>> MarkAllAsRead(CancellationToken cancellationToken)
    {
        var user = await ResolveCurrentUser();
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var notifications = await _dbContext.Notifications
            .Where(n => n.RecipientWallet == user.WalletAddress && !n.IsRead)
            .ToListAsync(cancellationToken);

        if (notifications.Count > 0)
        {
            var now = DateTime.UtcNow;
            foreach (var notification in notifications)
            {
                notification.IsRead = true;
                notification.ReadAt = now;
            }

            await _dbContext.SaveChangesAsync(cancellationToken);
        }

        return Ok(new UnreadNotificationCountResponse(0));
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

    private static NotificationResponse ToNotificationResponse(Notification notification)
    {
        return new NotificationResponse(
            notification.Id,
            notification.Type,
            notification.Message,
            DeserializeJson(notification.DataJson),
            notification.IsRead,
            notification.CreatedAt,
            notification.ReadAt);
    }

    private static Dictionary<string, object?> DeserializeJson(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return [];
        }

        try
        {
            return JsonSerializer.Deserialize<Dictionary<string, object?>>(raw) ?? [];
        }
        catch
        {
            return [];
        }
    }
}

public sealed record NotificationResponse(
    int Id,
    string Type,
    string Message,
    Dictionary<string, object?> Data,
    bool IsRead,
    DateTime CreatedAt,
    DateTime? ReadAt
);

public sealed record UnreadNotificationCountResponse(int Count);
