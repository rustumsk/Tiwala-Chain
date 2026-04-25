# Directory Guide

This is a simple guide to what the main directories in the repository are used for.

## Top-Level Directories

### `/frontend`
- Contains the web client side of the project.
- The main app lives in `frontend/tiwala-frontend`.
- Built with Next.js, React, Tailwind, wagmi, and viem.

### `/backend`
- Contains the ASP.NET Core API.
- The main API project lives in `backend/TiwalaChain.API`.
- Handles authentication, business rules, database access, notifications, files, and public service endpoints.

### `/ai-service`
- Contains the FastAPI service for contract fairness review.
- Handles document text extraction, clause splitting, classifier inference, and optional LLM suggestion fallback.

### `/blockchain`
- Contains the Foundry smart contract project.
- Holds the escrow contract and test/deployment support files.

### `/docs`
- Contains product notes, architecture notes, and implementation references.

### `/lib`
- Holds external Foundry dependencies, currently including OpenZeppelin contracts.

### `/.github`
- GitHub-specific project automation and workflow files.

### `/.tmp_build`, `/.tmp_pdf_pages`, `/.vs`
- Local or generated folders used during development.
- These are not core application source directories.

## Backend API Directories

Inside `backend/TiwalaChain.API`:

### `/controllers`
- HTTP entry points for API routes.
- Receive requests and call service-layer logic.

### `/services`
- Main business logic layer.
- Organized by domain such as auth, jobs, postings, proposals, notifications, files, and public services.

### `/models`
- Entity classes used by EF Core and the database layer.

### `/contracts`
- Request and response DTOs shared by API endpoints.

### `/mappers`
- Converts database models into API response shapes.

### `/validators`
- Input validation helpers for postings and proposals.

### `/policies`
- Authorization and rule checks.

### `/enums`
- Shared enums for roles, job states, proposal states, and similar constants.

### `/common`
- Shared utility types and helpers used across the API.

### `/Migrations`
- EF Core database migration history.

### `/Properties`
- .NET launch and project runtime settings.

### `/bin`, `/obj`
- Generated build output directories.

## Frontend Directories

Inside `frontend/tiwala-frontend/src`:

### `/app`
- Next.js app router pages, layouts, and route-level UI.

### `/components`
- Reusable UI components.

### `/hooks`
- Custom React hooks.

### `/lib`
- Frontend service helpers for auth, jobs, postings, proposals, contracts, wagmi setup, notifications, and API communication.

### `/types`
- Shared TypeScript type definitions.

### `/resource`
- Static or project-specific frontend resources.

## AI Service Directories

Inside `ai-service`:

### `/dataset`
- Training or evaluation data used for model work.

### `/docs`
- Service-specific documentation.

### `/fine_tuned_model`
- Saved fine-tuned model files used by the classifier.

### `/integration_tests`
- Integration tests for the AI service.

### `/model_output`
- Output artifacts from model runs or evaluation.

### `/sample_documents`
- Example files for testing extraction and review behavior.

### `/scripts`
- Helper scripts for data preparation or model-related tasks.

### `/venv`, `/__pycache__`, `/.pytest_cache`
- Local environment and generated Python cache folders.

## Blockchain Directories

Inside `blockchain/tiwala_chain`:

### `/src`
- Solidity source files, including the escrow contract.

### `/test`
- Foundry test files for contract behavior.

### `/script`
- Foundry scripts for deployment or scripted interactions.

### `/lib`
- Solidity dependency libraries used by the contract project.

### `/.github`
- Contract-project-specific GitHub workflow files if needed by the subproject.

## Quick Mental Model

If you want the shortest possible way to read the repo:

- `frontend` = user interface
- `backend` = app rules and database
- `ai-service` = contract analysis
- `blockchain` = escrow and payment logic
- `docs` = notes and references
- `lib` = external dependencies
