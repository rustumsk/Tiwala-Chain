using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.Text.Json;
using System.Text;
using System.Threading.RateLimiting;
using DotNetEnv;

// Load environment variables from .env before building configuration so
// ASPNETCORE_ENVIRONMENT and other settings are available during startup.
try
{
    Env.TraversePath().Load();
}
catch
{
    // Never fail startup purely because .env is missing in non-local setups.
}

var builder = WebApplication.CreateBuilder(args);
builder.Configuration.AddEnvironmentVariables();
var isLocal = builder.Environment.IsDevelopment();

static string RequireConfig(IConfiguration configuration, string key, bool isLocal, string? localFallback = null)
{
    var value = configuration[key];
    if (!string.IsNullOrWhiteSpace(value))
    {
        return value;
    }
    if (isLocal && !string.IsNullOrWhiteSpace(localFallback))
    {
        return localFallback;
    }

    throw new InvalidOperationException($"Missing required configuration: {key}");
}

// Add services to the container.
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();
builder.Services.AddControllers();
builder.Services.AddMemoryCache();
builder.Services.AddAuthorization();
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (context, cancellationToken) =>
    {
        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
        {
            context.HttpContext.Response.Headers.RetryAfter =
                Math.Max(1, (int)Math.Ceiling(retryAfter.TotalSeconds)).ToString();
        }

        context.HttpContext.Response.ContentType = "application/json";
        var payload = JsonSerializer.Serialize(new
        {
            error = "rate_limited",
            message = "Too many requests. Please try again later.",
        });

        await context.HttpContext.Response.WriteAsync(payload, cancellationToken);
    };

    options.AddPolicy("public-postings-browse", httpContext =>
    {
        var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: ip,
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 60,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
                AutoReplenishment = true,
            });
    });

    options.AddPolicy("public-contract-verify", httpContext =>
    {
        var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: $"contract-verify:{ip}",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromHours(1),
                QueueLimit = 0,
                AutoReplenishment = true,
            });
    });

    options.AddPolicy("public-ai-review", httpContext =>
    {
        var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: $"public-ai-review:{ip}",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 3,
                Window = TimeSpan.FromDays(1),
                QueueLimit = 0,
                AutoReplenishment = true,
            });
    });

    options.AddPolicy("public-contract-builder", httpContext =>
    {
        var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: $"public-contract-builder:{ip}",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 3,
                Window = TimeSpan.FromDays(1),
                QueueLimit = 0,
                AutoReplenishment = true,
            });
    });

    options.AddPolicy("postings-browse", httpContext =>
    {
        var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: $"browse:{ip}",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 30,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
                AutoReplenishment = true,
            });
    });

    options.AddPolicy("postings-create", httpContext =>
    {
        var subject = httpContext.User?.Identity?.IsAuthenticated == true
            ? httpContext.User.FindFirst("sub")?.Value ?? httpContext.User.FindFirst("nameid")?.Value ?? "authenticated"
            : httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: $"postings-create:{subject}",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(10),
                QueueLimit = 0,
                AutoReplenishment = true,
            });
    });

    options.AddPolicy("proposals-create", httpContext =>
    {
        var subject = httpContext.User?.Identity?.IsAuthenticated == true
            ? httpContext.User.FindFirst("sub")?.Value ?? httpContext.User.FindFirst("nameid")?.Value ?? "authenticated"
            : httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: $"proposals-create:{subject}",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 20,
                Window = TimeSpan.FromMinutes(10),
                QueueLimit = 0,
                AutoReplenishment = true,
            });
    });

    options.AddPolicy("messages-send", httpContext =>
    {
        var subject = httpContext.User?.Identity?.IsAuthenticated == true
            ? httpContext.User.FindFirst("sub")?.Value ?? httpContext.User.FindFirst("nameid")?.Value ?? "authenticated"
            : httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: $"messages-send:{subject}",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 40,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
                AutoReplenishment = true,
            });
    });
});

var aiServiceUrl = RequireConfig(builder.Configuration, "AiService:BaseUrl", isLocal, "http://localhost:8000/");
var aiServiceTimeoutSecondsRaw = builder.Configuration.GetValue<int?>("AiService:TimeoutSeconds");
var aiServiceTimeoutSeconds = aiServiceTimeoutSecondsRaw.GetValueOrDefault();
if (aiServiceTimeoutSeconds <= 0)
{
    if (isLocal)
    {
        aiServiceTimeoutSeconds = 120;
    }
    else
    {
        throw new InvalidOperationException("Missing required configuration: AiService:TimeoutSeconds");
    }
}
aiServiceTimeoutSeconds = Math.Max(aiServiceTimeoutSeconds, 120);
builder.Services.AddHttpClient("AiService", client =>
{
    client.BaseAddress = new Uri(aiServiceUrl);
    client.Timeout = TimeSpan.FromSeconds(aiServiceTimeoutSeconds);
});

var frontendOrigins = builder.Configuration
    .GetSection("Cors:AllowedOrigins")
    .Get<string[]>() ??
    [
        "http://localhost:3000",
        "https://localhost:3000",
        "http://127.0.0.1:3000",
        "https://127.0.0.1:3000",
    ];

builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        policy.WithOrigins(frontendOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

var jwtKey = RequireConfig(builder.Configuration, "Jwt:Key", isLocal, "replace-this-dev-jwt-key-with-a-long-random-secret");
var jwtIssuer = RequireConfig(builder.Configuration, "Jwt:Issuer", isLocal, "TiwalaChain.API");
var jwtAudience = RequireConfig(builder.Configuration, "Jwt:Audience", isLocal, "TiwalaChain.Frontend");
var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtIssuer,
            ValidAudience = jwtAudience,
            IssuerSigningKey = signingKey,
            ClockSkew = TimeSpan.FromSeconds(30),
        };
    });

var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
if (string.IsNullOrWhiteSpace(connectionString))
{
    connectionString = isLocal
        ? "Host=localhost;Database=tiwalachain;Username=postgres;Password=postgres"
        : throw new InvalidOperationException("Missing required configuration: ConnectionStrings:DefaultConnection");
}
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(connectionString));

builder.Services.AddScoped<CurrentUserService>();
builder.Services.AddScoped<DeliverableService>();
builder.Services.AddScoped<FileService>();
builder.Services.AddScoped<JobService>();
builder.Services.AddScoped<NotificationService>();
builder.Services.AddScoped<ProposalMapper>();
builder.Services.AddScoped<PostingMapper>();
builder.Services.AddScoped<PublicAiService>();
builder.Services.AddScoped<PublicContractService>();
builder.Services.AddScoped<PublicPostingService>();
builder.Services.AddScoped<JwtTokenService>();
builder.Services.AddSingleton<S3StorageService>();
var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await dbContext.Database.MigrateAsync();
}

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}
app.UseCors("Frontend");
app.Use(async (context, next) =>
{
    try
    {
        await next();
    }
    catch (Exception exception)
    {
        app.Logger.LogError(exception, "Unhandled API request failure.");

        if (context.Response.HasStarted)
        {
            throw;
        }

        context.Response.Clear();
        var origin = context.Request.Headers.Origin.ToString();
        if (!string.IsNullOrWhiteSpace(origin) && frontendOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase))
        {
            context.Response.Headers.AccessControlAllowOrigin = origin;
            context.Response.Headers.Vary = "Origin";
        }

        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        context.Response.ContentType = "application/json";

        await context.Response.WriteAsJsonAsync(new
        {
            error = "server_error",
            message = "The API failed while processing the request.",
        });
    }
});
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
