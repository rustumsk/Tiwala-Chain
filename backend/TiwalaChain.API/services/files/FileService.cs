using System.Security.Cryptography;
using System.Text;

public sealed class FileService
{
    private readonly S3StorageService _storage;

    public FileService(S3StorageService storage)
    {
        _storage = storage;
    }

    public async Task<FileUploadResult> UploadAsync(IFormFile? file, CancellationToken cancellationToken)
    {
        if (file is null || file.Length == 0)
        {
            return FileUploadResult.BadRequest("No file uploaded.");
        }

        await using var stream = file.OpenReadStream();
        await using var buffer = new MemoryStream();
        await stream.CopyToAsync(buffer, cancellationToken);
        buffer.Position = 0;

        var hashHex = ComputeSha256Hash(buffer);

        buffer.Position = 0;
        var key = $"uploads/{DateTime.UtcNow:yyyyMMddHHmmssfff}-{Guid.NewGuid():N}-{file.FileName}";

        await _storage.UploadAsync(buffer, key, file.ContentType, cancellationToken);

        return FileUploadResult.Success(new FileUploadResponse(
            file.FileName,
            file.ContentType,
            file.Length,
            key,
            hashHex));
    }

    private static string ComputeSha256Hash(MemoryStream buffer)
    {
        using var sha = SHA256.Create();
        var hash = sha.ComputeHash(buffer.ToArray());
        var sb = new StringBuilder(hash.Length * 2);
        foreach (var b in hash)
        {
            sb.Append(b.ToString("x2"));
        }

        return sb.ToString();
    }
}

public sealed record FileUploadResult(bool IsSuccess, FileUploadResponse? Value, string? Error)
{
    public static FileUploadResult Success(FileUploadResponse value) => new(true, value, null);
    public static FileUploadResult BadRequest(string error) => new(false, null, error);
}
