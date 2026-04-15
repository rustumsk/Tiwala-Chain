using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

[Table("proposal_messages")]
public class ProposalMessage
{
    [Key]
    public int Id { get; set; }

    public int ProposalId { get; set; }
    public Proposal Proposal { get; set; } = null!;

    [Required]
    [MaxLength(44)]
    public string SenderWallet { get; set; } = string.Empty;

    [Required]
    [MaxLength(4000)]
    public string Body { get; set; } = string.Empty;

    [Required]
    [MaxLength(20)]
    public string MessageType { get; set; } = "user";

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ReadAt { get; set; }
}
