using Amazon;
using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;

public sealed class S3StorageService
{
    private readonly IAmazonS3 _s3;
    private readonly string _bucketName;

    public S3StorageService(IConfiguration configuration)
    {
        var regionName = configuration["AWS:Region"]
            ?? throw new InvalidOperationException("Missing AWS:Region configuration.");
        _bucketName = configuration["AWS:S3Bucket"]
            ?? throw new InvalidOperationException("Missing AWS:S3Bucket configuration.");
        var accessKey = configuration["AWS:AccessKeyId"]
            ?? throw new InvalidOperationException("Missing AWS:AccessKeyId configuration.");
        var secretKey = configuration["AWS:SecretAccessKey"]
            ?? throw new InvalidOperationException("Missing AWS:SecretAccessKey configuration.");

        var credentials = new BasicAWSCredentials(accessKey, secretKey);
        var region = RegionEndpoint.GetBySystemName(regionName);
        _s3 = new AmazonS3Client(credentials, region);
    }

    public async Task UploadAsync(
        Stream content,
        string key,
        string contentType,
        CancellationToken cancellationToken = default)
    {
        var putRequest = new PutObjectRequest
        {
            BucketName = _bucketName,
            Key = key,
            InputStream = content,
            ContentType = contentType,
        };

        await _s3.PutObjectAsync(putRequest, cancellationToken);
    }

    public string GetPublicUrl(string key)
    {
        return $"https://{_bucketName}.s3.amazonaws.com/{Uri.EscapeDataString(key)}";
    }

    public async Task<(Stream Stream, string ContentType)> GetAsync(
        string key,
        CancellationToken cancellationToken = default)
    {
        var response = await _s3.GetObjectAsync(_bucketName, key, cancellationToken);
        var ms = new MemoryStream();
        await response.ResponseStream.CopyToAsync(ms, cancellationToken);
        ms.Position = 0;
        var contentType = string.IsNullOrEmpty(response.Headers.ContentType)
            ? "application/octet-stream"
            : response.Headers.ContentType;
        return (ms, contentType);
    }
}

