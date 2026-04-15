using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

[Table("jobs")]
public class Job
{
    [Key]
    public int Id { get; set; }

    [Required]
    [MaxLength(44)]
    public string EmployerWallet { get; set; } = string.Empty;

    [Required]
    [MaxLength(44)]
    public string FreelancerWallet { get; set; } = string.Empty;

    [Required]
    [MaxLength(200)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(4000)]
    public string? Description { get; set; }

    [Required]
    [MaxLength(512)]
    public string ContractKey { get; set; } = string.Empty;

    [Required]
    [MaxLength(128)]
    public string ContractHash { get; set; } = string.Empty;

    [Column(TypeName = "numeric(18,6)")]
    public decimal AmountUsdt { get; set; }

    [Required]
    public JobStatus Status { get; set; } = JobStatus.PendingOffer;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
    public int? PostingId { get; set; }
    public int? ProposalId { get; set; }
}

public enum JobStatus
{
    PendingOffer = 0,
    Accepted = 1,
    Declined = 2,
    Cancelled = 3,
}

