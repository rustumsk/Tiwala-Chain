public sealed record PublicContractVerificationResponse(
    string Status,
    string MatchedHash,
    string? UploadedHash,
    PublicContractTrustMetadata? Metadata,
    string Message
);
