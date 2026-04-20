public sealed record DeliverableAttachmentResponse(
    int Id,
    string Type,
    string? Url,
    string? FileName,
    string? ContentType,
    long? SizeBytes
);
