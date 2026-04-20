using Microsoft.EntityFrameworkCore;

public sealed class NotificationService
{
    private readonly AppDbContext _dbContext;

    public NotificationService(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<List<NotificationResponse>> GetNotificationsAsync(
        User user,
        int limit,
        CancellationToken cancellationToken)
    {
        limit = Math.Clamp(limit, 1, 100);

        var notifications = await _dbContext.Notifications
            .AsNoTracking()
            .Where(n => n.RecipientWallet == user.WalletAddress)
            .OrderByDescending(n => n.CreatedAt)
            .Take(limit)
            .ToListAsync(cancellationToken);

        return notifications.Select(NotificationMapper.ToResponse).ToList();
    }

    public async Task<UnreadNotificationCountResponse> GetUnreadCountAsync(
        User user,
        CancellationToken cancellationToken)
    {
        var unreadCount = await _dbContext.Notifications.CountAsync(
            n => n.RecipientWallet == user.WalletAddress && !n.IsRead,
            cancellationToken);

        return new UnreadNotificationCountResponse(unreadCount);
    }

    public async Task<NotificationServiceResult<NotificationResponse>> MarkAsReadAsync(
        User user,
        int id,
        CancellationToken cancellationToken)
    {
        var notification = await _dbContext.Notifications
            .FirstOrDefaultAsync(n => n.Id == id && n.RecipientWallet == user.WalletAddress, cancellationToken);
        if (notification is null)
        {
            return NotificationServiceResult<NotificationResponse>.NotFound("Notification not found.");
        }

        if (!notification.IsRead)
        {
            notification.IsRead = true;
            notification.ReadAt = DateTime.UtcNow;
            await _dbContext.SaveChangesAsync(cancellationToken);
        }

        return NotificationServiceResult<NotificationResponse>.Success(NotificationMapper.ToResponse(notification));
    }

    public async Task<UnreadNotificationCountResponse> MarkAllAsReadAsync(
        User user,
        CancellationToken cancellationToken)
    {
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

        return new UnreadNotificationCountResponse(0);
    }
}

public sealed class NotificationServiceResult<T>
{
    private NotificationServiceResult(NotificationServiceResultStatus status, T? value, string? error)
    {
        Status = status;
        Value = value;
        Error = error;
    }

    public NotificationServiceResultStatus Status { get; }
    public T? Value { get; }
    public string? Error { get; }

    public static NotificationServiceResult<T> Success(T value) =>
        new(NotificationServiceResultStatus.Success, value, null);

    public static NotificationServiceResult<T> NotFound(string error) =>
        new(NotificationServiceResultStatus.NotFound, default, error);
}

public enum NotificationServiceResultStatus
{
    Success,
    NotFound,
}
