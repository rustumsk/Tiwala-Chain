using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

[Table("job_deliverables")]
public class Deliverable
{
    [Key]
    public int Id { get; set; }

    public int JobId { get; set; }
    public Job Job { get; set; } = null!;

    [MaxLength(2000)]
    public string? Note { get; set; }

    public DeliverableStatus Status { get; set; } = DeliverableStatus.PendingReview;

    [MaxLength(2000)]
    public string? ReviewNote { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    public List<DeliverableAttachment> Attachments { get; set; } = [];
}

[Table("job_deliverable_attachments")]
public class DeliverableAttachment
{
    [Key]
    public int Id { get; set; }

    public int DeliverableId { get; set; }
    public Deliverable Deliverable { get; set; } = null!;

    public DeliverableAttachmentType Type { get; set; }

    [MaxLength(2048)]
    public string Value { get; set; } = string.Empty; // URL (for links) or S3 key (for files)

    [MaxLength(255)]
    public string? FileName { get; set; }

    [MaxLength(200)]
    public string? ContentType { get; set; }

    public long? SizeBytes { get; set; }

    [MaxLength(128)]
    public string? Sha256Hash { get; set; }
}
