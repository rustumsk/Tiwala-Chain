using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

[Index(nameof(WalletAddress), IsUnique = true)] 
[Table("app_users")] 
public class User
{
    [Key]
    public int Id { get; set; }

    [Required]
    [MaxLength(44)]
    public string WalletAddress { get; set; } = string.Empty;

    public string? DisplayName { get; set; }
    public UserRole Role { get; set; }
    public bool IsApproved { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public enum UserRole
{
    Freelancer,
    Employer,
    Both,
    Admin
}