# Backend

This directory contains the TiwalaChain ASP.NET Core backend wrapper.

## Contents

```text
backend/
|-- TiwalaChain.API/   Main ASP.NET Core API project
`-- Readme.MD
```

Open `TiwalaChain.API/` for the runnable API, controllers, models, services, migrations, and deployment files.

## Quick Start

```powershell
cd backend/TiwalaChain.API
dotnet restore
dotnet ef database update
dotnet run
```

The frontend expects this API at `http://localhost:5067` during local development.
