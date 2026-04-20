using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/[controller]")]
public sealed class FilesController : ControllerBase
{
    private readonly FileService _fileService;

    public FilesController(FileService fileService)
    {
        _fileService = fileService;
    }

    [HttpPost("upload")]
    [DisableRequestSizeLimit]
    [Authorize]
    public async Task<IActionResult> Upload([FromForm] IFormFile file, CancellationToken cancellationToken)
    {
        var result = await _fileService.UploadAsync(file, cancellationToken);
        if (!result.IsSuccess)
        {
            return BadRequest(result.Error);
        }

        return Ok(new
        {
            fileName = result.Value!.FileName,
            contentType = result.Value.ContentType,
            length = result.Value.Length,
            key = result.Value.Key,
            hash = result.Value.Hash,
        });
    }
}
