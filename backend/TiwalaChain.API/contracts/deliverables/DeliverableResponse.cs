public sealed record DeliverableResponse(
    int Id,
    int JobId,
    string? Note,
    string Status,
    string? ReviewNote,
    DateTime CreatedAt,
    DateTime? UpdatedAt,
    List<DeliverableAttachmentResponse> Attachments
);
