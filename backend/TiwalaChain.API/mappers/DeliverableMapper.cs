public static class DeliverableMapper
{
    public static DeliverableResponse ToResponse(Deliverable deliverable)
    {
        return new DeliverableResponse(
            deliverable.Id,
            deliverable.JobId,
            deliverable.Note,
            deliverable.Status.ToString(),
            deliverable.ReviewNote,
            deliverable.CreatedAt,
            deliverable.UpdatedAt,
            deliverable.Attachments.Select(a =>
                new DeliverableAttachmentResponse(
                    a.Id,
                    a.Type.ToString(),
                    a.Type == DeliverableAttachmentType.Link ? a.Value : null,
                    a.Type == DeliverableAttachmentType.File ? a.FileName : null,
                    a.Type == DeliverableAttachmentType.File ? a.ContentType : null,
                    a.Type == DeliverableAttachmentType.File ? a.SizeBytes : null
                )).ToList()
        );
    }
}
