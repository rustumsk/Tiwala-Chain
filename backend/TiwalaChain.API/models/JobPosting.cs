using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

[Table("job_postings")]
public class JobPosting
{
    [Key]
    public int Id { get; set; }

    [Required]
    [MaxLength(44)]
    public string EmployerWallet { get; set; } = string.Empty;

    [Required]
    [MaxLength(200)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Summary { get; set; }

    [MaxLength(8000)]
    public string? Description { get; set; }

    [Required]
    [MaxLength(50)]
    public string Category { get; set; } = string.Empty;

    public List<string> Skills { get; set; } = [];

    [Required]
    [MaxLength(30)]
    public string JobType { get; set; } = "fixed_price";

    [Required]
    [MaxLength(20)]
    public string BudgetType { get; set; } = "fixed";

    [Column(TypeName = "numeric(18,6)")]
    public decimal? BudgetMin { get; set; }

    [Column(TypeName = "numeric(18,6)")]
    public decimal? BudgetMax { get; set; }

    [MaxLength(100)]
    public string? Timeline { get; set; }

    [Required]
    [MaxLength(20)]
    public string ExperienceLevel { get; set; } = "intermediate";

    [Required]
    [MaxLength(20)]
    public string Visibility { get; set; } = "public";

    public DateTime? ProposalDeadline { get; set; }

    [MaxLength(512)]
    public string? BriefAttachmentKey { get; set; }

    [MaxLength(4000)]
    public string? ScreeningQuestionsJson { get; set; }

    [Required]
    public PostingStatus Status { get; set; } = PostingStatus.Draft;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
    public DateTime? PublishedAt { get; set; }
    public DateTime? ClosedAt { get; set; }
    public int ProposalCount { get; set; }
}
