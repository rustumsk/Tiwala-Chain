using Microsoft.EntityFrameworkCore;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<User> Users => Set<User>();
    public DbSet<Job> Jobs => Set<Job>();
    public DbSet<JobDispute> JobDisputes => Set<JobDispute>();
    public DbSet<Deliverable> Deliverables => Set<Deliverable>();
    public DbSet<DeliverableAttachment> DeliverableAttachments => Set<DeliverableAttachment>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<User>()
            .HasIndex(u => u.WalletAddress)
            .IsUnique();

        modelBuilder.Entity<User>()
            .Property(u => u.Role)
            .HasConversion<string>();

        modelBuilder.Entity<Job>()
            .Property(j => j.Status)
            .HasConversion<string>();

        modelBuilder.Entity<Deliverable>()
            .Property(d => d.Status)
            .HasConversion<string>();

        modelBuilder.Entity<DeliverableAttachment>()
            .Property(a => a.Type)
            .HasConversion<string>();
    }
}