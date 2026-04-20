public sealed record PublicContractTrustMetadata(
    string Title,
    string JobStatus,
    decimal AmountUsdt,
    DateTime RecordedAt,
    string EmployerWallet,
    string FreelancerWallet
);
