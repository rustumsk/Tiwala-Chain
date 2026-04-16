# ── Stage 1: Build ──────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:10.0-alpine AS build
WORKDIR /src

COPY *.csproj ./
RUN dotnet restore

COPY . ./
RUN dotnet publish -c Release -o /app/publish \
    --no-restore \
    /p:DebugType=None \
    /p:DebugSymbols=false

# ── Stage 2: Runtime ───────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine AS runtime
WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=build /app/publish .

RUN chown -R appuser:appgroup /app
USER appuser

ENV ASPNETCORE_ENVIRONMENT=Production

EXPOSE 10000

CMD sh -c "ASPNETCORE_HTTP_PORTS=${PORT:-10000} dotnet TiwalaChain.API.dll"
