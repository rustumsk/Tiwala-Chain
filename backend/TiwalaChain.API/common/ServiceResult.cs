public sealed class ServiceResult<T>
{
    private ServiceResult(ServiceResultStatus status, T? value, string? error, string? locationHash)
    {
        Status = status;
        Value = value;
        Error = error;
        LocationHash = locationHash;
    }

    public ServiceResultStatus Status { get; }
    public T? Value { get; }
    public string? Error { get; }
    public string? LocationHash { get; }

    public static ServiceResult<T> Success(T value) => new(ServiceResultStatus.Success, value, null, null);
    public static ServiceResult<T> Created(T value, string locationHash) => new(ServiceResultStatus.Created, value, null, locationHash);
    public static ServiceResult<T> BadRequest(string error) => new(ServiceResultStatus.BadRequest, default, error, null);
    public static ServiceResult<T> NotFound(string error) => new(ServiceResultStatus.NotFound, default, error, null);
    public static ServiceResult<T> Conflict(string error) => new(ServiceResultStatus.Conflict, default, error, null);
    public static ServiceResult<T> Unauthorized(string error) => new(ServiceResultStatus.Unauthorized, default, error, null);
    public static ServiceResult<T> Forbidden(string? error = null) => new(ServiceResultStatus.Forbidden, default, error, null);
}

public enum ServiceResultStatus
{
    Success,
    Created,
    BadRequest,
    NotFound,
    Conflict,
    Unauthorized,
    Forbidden,
}
