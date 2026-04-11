using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

[Index(nameof(ContractHash), IsUnique = true)]
[Table("job_disputes")]
public class JobDispute
{
    [Key]
    public int Id { get; set; }

    /// <summary>Contract hash without 0x prefix, lowercase.</summary>
    [Required]
    [MaxLength(64)]
    public string ContractHash { get; set; } = string.Empty;

    [Required]
    [MaxLength(40)]
    public string OnChainJobId { get; set; } = string.Empty;

    [Required]
    [MaxLength(44)]
    public string RaisedByWallet { get; set; } = string.Empty;

    [Required]
    [MaxLength(32)]
    public string ReasonCode { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string? Details { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
