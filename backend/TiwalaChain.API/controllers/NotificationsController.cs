using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/[controller]")]
public sealed class NotificationsController : ControllerBase
{
    private readonly CurrentUserService _currentUserService;
    private readonly NotificationService _notificationService;

    public NotificationsController(
        CurrentUserService currentUserService,
        NotificationService notificationService)
    {
        _currentUserService = currentUserService;
        _notificationService = notificationService;
    }

    [Authorize]
    [HttpGet]
    public async Task<ActionResult<List<NotificationResponse>>> GetNotifications(
        [FromQuery] int limit = 25,
        CancellationToken cancellationToken = default)
    {
        var user = await _currentUserService.GetAsync(User, cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        return Ok(await _notificationService.GetNotificationsAsync(user, limit, cancellationToken));
    }

    [Authorize]
    [HttpGet("unread-count")]
    public async Task<ActionResult<UnreadNotificationCountResponse>> GetUnreadCount(CancellationToken cancellationToken)
    {
        var user = await _currentUserService.GetAsync(User, cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        return Ok(await _notificationService.GetUnreadCountAsync(user, cancellationToken));
    }

    [Authorize]
    [HttpPost("{id:int}/read")]
    public async Task<ActionResult<NotificationResponse>> MarkAsRead(int id, CancellationToken cancellationToken)
    {
        var user = await _currentUserService.GetAsync(User, cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        var result = await _notificationService.MarkAsReadAsync(user, id, cancellationToken);
        if (result.Status == ServiceResultStatus.NotFound)
        {
            return NotFound(result.Error);
        }

        return Ok(result.Value);
    }

    [Authorize]
    [HttpPost("read-all")]
    public async Task<ActionResult<UnreadNotificationCountResponse>> MarkAllAsRead(CancellationToken cancellationToken)
    {
        var user = await _currentUserService.GetAsync(User, cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid session.");
        }

        return Ok(await _notificationService.MarkAllAsReadAsync(user, cancellationToken));
    }
}
