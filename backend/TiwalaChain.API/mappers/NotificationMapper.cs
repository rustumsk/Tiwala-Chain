using System.Text.Json;

public static class NotificationMapper
{
    public static NotificationResponse ToResponse(Notification notification)
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
        catch (JsonException)
        {
            return [];
        }
    }
}
