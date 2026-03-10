using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Cryptography;
using System.Text;

[ApiController]
[Route("api/[controller]")]
public sealed class FilesController : ControllerBase
{
    private readonly S3StorageService _storage;

    public FilesController(S3StorageService storage)
    {
        _storage = storage;
    }

    [HttpPost("upload")]
    [DisableRequestSizeLimit]
    [Authorize]
    public async Task<IActionResult> Upload([FromForm] IFormFile file, CancellationToken cancellationToken)
    {
        if (file is null || file.Length == 0)
        {
            return BadRequest("No file uploaded.");
        }

        await using var stream = file.OpenReadStream();
        await using var buffer = new MemoryStream();
        await stream.CopyToAsync(buffer, cancellationToken);
        buffer.Position = 0;

        // Compute SHA-256 hash of the exact file bytes
        string hashHex;
        using (var sha = SHA256.Create())
        {
            var hash = sha.ComputeHash(buffer.ToArray());
            var sb = new StringBuilder(hash.Length * 2);
            foreach (var b in hash)
            {
                sb.Append(b.ToString("x2"));
            }
            hashHex = sb.ToString();
        }

        buffer.Position = 0;
        var key = $"uploads/{DateTime.UtcNow:yyyyMMddHHmmssfff}-{Guid.NewGuid():N}-{file.FileName}";

        await _storage.UploadAsync(buffer, key, file.ContentType, cancellationToken);

        return Ok(new
        {
            fileName = file.FileName,
            contentType = file.ContentType,
            length = file.Length,
            key,
            hash = hashHex,
        });
    }
}

