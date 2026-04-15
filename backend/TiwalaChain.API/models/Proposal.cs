using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

[Table("proposals")]
public class Proposal
{
    [Key]
    public int Id { get; set; }

    public int PostingId { get; set; }
    public JobPosting Posting { get; set; } = null!;

    [Required]
    [MaxLength(44)]
    public string FreelancerWallet { get; set; } = string.Empty;

    [MaxLength(4000)]
    public string? CoverLetter { get; set; }

    [Column(TypeName = "numeric(18,6)")]
    public decimal ProposedAmount { get; set; }

    [MaxLength(100)]
    public string? EstimatedTimeline { get; set; }

    [MaxLength(2000)]
    public string? PortfolioLinksJson { get; set; }

    [MaxLength(2000)]
    public string? RelevantExperience { get; set; }

    [MaxLength(4000)]
    public string? ScreeningAnswersJson { get; set; }

    [MaxLength(500)]
    public string? CvAttachmentKey { get; set; }

    [Required]
    public ProposalStatus Status { get; set; } = ProposalStatus.Submitted;

    [MaxLength(100)]
    public string? RejectionReason { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
    public DateTime? ViewedAt { get; set; }
    public int? ConvertedJobId { get; set; }
}

public enum ProposalStatus
{
    Submitted = 0,
    Viewed = 1,
    Shortlisted = 2,
    Rejected = 3,
    Withdrawn = 4,
    Selected = 5,
    ConvertedToOffer = 6,
}
