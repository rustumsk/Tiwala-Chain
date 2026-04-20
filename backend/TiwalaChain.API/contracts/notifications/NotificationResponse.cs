public sealed record NotificationResponse(
    int Id,
    string Type,
    string Message,
    Dictionary<string, object?> Data,
    bool IsRead,
    DateTime CreatedAt,
    DateTime? ReadAt
);
