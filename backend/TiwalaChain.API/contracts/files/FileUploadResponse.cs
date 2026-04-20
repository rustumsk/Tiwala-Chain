public sealed record FileUploadResponse(
    string FileName,
    string ContentType,
    long Length,
    string Key,
    string Hash
);
