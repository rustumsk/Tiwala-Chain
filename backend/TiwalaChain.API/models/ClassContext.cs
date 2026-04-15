using Microsoft.EntityFrameworkCore;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<User> Users => Set<User>();
    public DbSet<Job> Jobs => Set<Job>();
    public DbSet<JobPosting> JobPostings => Set<JobPosting>();
    public DbSet<Proposal> Proposals => Set<Proposal>();
    public DbSet<ProposalMessage> ProposalMessages => Set<ProposalMessage>();
    public DbSet<Notification> Notifications => Set<Notification>();
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

        modelBuilder.Entity<Job>()
            .HasIndex(j => j.PostingId);

        modelBuilder.Entity<Job>()
            .HasIndex(j => j.ProposalId);

        modelBuilder.Entity<JobPosting>()
            .Property(p => p.Status)
            .HasConversion<string>();

        modelBuilder.Entity<JobPosting>()
            .HasIndex(p => p.EmployerWallet);

        modelBuilder.Entity<JobPosting>()
            .HasIndex(p => p.Status);

        modelBuilder.Entity<JobPosting>()
            .HasIndex(p => p.Category);

        modelBuilder.Entity<Proposal>()
            .Property(p => p.Status)
            .HasConversion<string>();

        modelBuilder.Entity<Proposal>()
            .HasIndex(p => p.FreelancerWallet);

        modelBuilder.Entity<Proposal>()
            .HasIndex(p => new { p.PostingId, p.FreelancerWallet })
            .HasFilter("\"Status\" <> 'Withdrawn'")
            .IsUnique();

        modelBuilder.Entity<ProposalMessage>()
            .HasIndex(m => m.ProposalId);

        modelBuilder.Entity<Notification>()
            .HasIndex(n => n.RecipientWallet);

        modelBuilder.Entity<Notification>()
            .HasIndex(n => new { n.RecipientWallet, n.IsRead });

        modelBuilder.Entity<Deliverable>()
            .Property(d => d.Status)
            .HasConversion<string>();

        modelBuilder.Entity<DeliverableAttachment>()
            .Property(a => a.Type)
            .HasConversion<string>();
    }
}
