# TiwalaChain API

The backend is an ASP.NET Core API for authentication, marketplace data, job offers, file storage, AI-service proxying, notifications, deliverables, disputes, and account management.

## Stack

- .NET 10
- ASP.NET Core controllers
- Entity Framework Core
- PostgreSQL through Npgsql
- JWT bearer authentication
- Nethereum signer utilities for wallet login
- S3-compatible object storage

## Project Layout

```text
TiwalaChain.API/
|-- controllers/       HTTP endpoints grouped by feature
|-- models/            EF Core entities and database context
|-- services/          JWT and storage services
|-- Migrations/        EF Core migrations
|-- Properties/        Local launch settings
|-- Program.cs         App startup, DI, auth, CORS, rate limits
|-- appsettings.json   Configuration schema
|-- Dockerfile         Container image
`-- TiwalaChain.API.csproj
```

## Main Controllers

- `AuthController` - wallet authentication, profile, approval, account deletion
- `JobsController` - offers, accepted jobs, sync from chain, disputes
- `PostingsController` - authenticated marketplace postings
- `PublicPostingsController` - public browsing
- `ProposalsController` - proposals, messages, selection, offer conversion
- `DeliverablesController` - deliverable submission, attachments, review
- `FilesController` - file upload
- `NotificationsController` - notification list, read state, unread count
- `PublicAiController` - public AI review endpoint
- `PublicContractsController` - public contract verification endpoint

## Configuration

Configuration is loaded from `appsettings.json`, environment variables, and local `.env` files.

Important keys:

```text
ConnectionStrings__DefaultConnection
Jwt__Issuer
Jwt__Audience
Jwt__Key
Jwt__AccessTokenMinutes
AWS__Region
AWS__S3Bucket
AWS__AccessKeyId
AWS__SecretAccessKey
AiService__BaseUrl
AiService__TimeoutSeconds
Cors__AllowedOrigins__0
AdminWallets__0
```

For local development, `Program.cs` provides safe defaults for several values, but production must provide real values for database, JWT, storage, AI service, and allowed origins.

## Local Development

```powershell
dotnet restore
dotnet ef database update
dotnet run
```

OpenAPI is mapped only in development.

## Database

The app uses EF Core migrations and applies migrations on startup:

```powershell
dotnet ef migrations add MigrationName
dotnet ef database update
```

Core tables include users, jobs, job postings, proposals, proposal messages, notifications, deliverables, deliverable attachments, and job disputes.

## Build

```powershell
dotnet build
```

## Docker

```powershell
docker build -t tiwalachain-api .
docker run -p 5067:8080 --env-file .env tiwalachain-api
```

Adjust the exposed port to match the hosting provider.

## Runtime Notes

- Production startup requires non-empty environment configuration.
- The API uses CORS policy `Frontend`; update allowed origins when deploying the frontend.
- Several endpoints are rate-limited to protect public browsing, AI review, proposal creation, and messaging.
- File storage uses S3-compatible object storage for contracts, CVs, and deliverables.
