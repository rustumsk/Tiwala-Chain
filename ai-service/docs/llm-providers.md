# LLM Suggestions Provider Config

This service supports pluggable LLM providers for clause suggestions through environment variables.

Core toggles:

- `LLM_SUGGESTIONS_ENABLED`
- `LLM_SUGGESTIONS_PROVIDER` (`openai_compatible` or `anthropic`)
- `LLM_SUGGESTIONS_MODEL`
- `LLM_SUGGESTIONS_TIMEOUT_SECONDS`
- `LLM_SUGGESTIONS_FORCE_ALL` (optional: route every clause to LLM)
- `LLM_SUGGESTIONS_BATCH_SIZE` (optional, default `4`)
- `LLM_SUGGESTIONS_MAX_CLAUSE_CHARS` (optional, default `1200`)
- `LLM_SUGGESTIONS_DEBUG` (optional: print LLM routing/errors to server logs)

Auth modes:

- `bearer` (default) -> `Authorization: Bearer <key>`
- `x_api_key` -> `x-api-key: <key>`
- `custom_header` -> custom header and prefix
- `none` -> no auth (for local/tunneled servers)

## 1) OpenAI (OpenAI-compatible)

```env
LLM_SUGGESTIONS_ENABLED=true
LLM_SUGGESTIONS_PROVIDER=openai_compatible
LLM_SUGGESTIONS_BASE_URL=https://api.openai.com/v1
LLM_SUGGESTIONS_MODEL=gpt-4o-mini
LLM_SUGGESTIONS_TIMEOUT_SECONDS=20
LLM_SUGGESTIONS_AUTH_MODE=bearer
LLM_SUGGESTIONS_API_KEY=YOUR_OPENAI_KEY
```

## 2) OpenRouter (OpenAI-compatible)

```env
LLM_SUGGESTIONS_ENABLED=true
LLM_SUGGESTIONS_PROVIDER=openai_compatible
LLM_SUGGESTIONS_BASE_URL=https://openrouter.ai/api/v1
LLM_SUGGESTIONS_MODEL=openai/gpt-4o-mini
LLM_SUGGESTIONS_TIMEOUT_SECONDS=25
LLM_SUGGESTIONS_AUTH_MODE=bearer
LLM_SUGGESTIONS_API_KEY=YOUR_OPENROUTER_KEY
LLM_SUGGESTIONS_EXTRA_HEADERS={"HTTP-Referer":"https://your-app.example","X-Title":"TiwalaChain AI Service"}
```

## 3) Groq (OpenAI-compatible)

```env
LLM_SUGGESTIONS_ENABLED=true
LLM_SUGGESTIONS_PROVIDER=openai_compatible
LLM_SUGGESTIONS_BASE_URL=https://api.groq.com/openai/v1
LLM_SUGGESTIONS_MODEL=llama-3.1-70b-versatile
LLM_SUGGESTIONS_TIMEOUT_SECONDS=20
LLM_SUGGESTIONS_AUTH_MODE=bearer
LLM_SUGGESTIONS_API_KEY=YOUR_GROQ_KEY
```

## 4) Anthropic

```env
LLM_SUGGESTIONS_ENABLED=true
LLM_SUGGESTIONS_PROVIDER=anthropic
LLM_SUGGESTIONS_BASE_URL=https://api.anthropic.com/v1
LLM_SUGGESTIONS_MODEL=claude-3-5-sonnet-latest
LLM_SUGGESTIONS_TIMEOUT_SECONDS=25
LLM_SUGGESTIONS_MAX_TOKENS=700
LLM_SUGGESTIONS_ANTHROPIC_VERSION=2023-06-01
LLM_SUGGESTIONS_AUTH_MODE=x_api_key
LLM_SUGGESTIONS_API_KEY=YOUR_ANTHROPIC_KEY
```

## 5) Ollama (local, OpenAI-compatible)

```env
LLM_SUGGESTIONS_ENABLED=true
LLM_SUGGESTIONS_PROVIDER=openai_compatible
LLM_SUGGESTIONS_ENDPOINT=http://127.0.0.1:11434/v1/chat/completions
LLM_SUGGESTIONS_MODEL=llama3.1:8b
LLM_SUGGESTIONS_TIMEOUT_SECONDS=45
LLM_SUGGESTIONS_AUTH_MODE=none
```

## 6) LM Studio (local, OpenAI-compatible)

```env
LLM_SUGGESTIONS_ENABLED=true
LLM_SUGGESTIONS_PROVIDER=openai_compatible
LLM_SUGGESTIONS_ENDPOINT=http://127.0.0.1:1234/v1/chat/completions
LLM_SUGGESTIONS_MODEL=local-model
LLM_SUGGESTIONS_TIMEOUT_SECONDS=45
LLM_SUGGESTIONS_AUTH_MODE=none
```

## 7) Generic custom gateway

If your provider has a custom auth header:

```env
LLM_SUGGESTIONS_ENABLED=true
LLM_SUGGESTIONS_PROVIDER=openai_compatible
LLM_SUGGESTIONS_ENDPOINT=https://your-gateway.example/v1/chat/completions
LLM_SUGGESTIONS_MODEL=your-model-name
LLM_SUGGESTIONS_TIMEOUT_SECONDS=30
LLM_SUGGESTIONS_AUTH_MODE=custom_header
LLM_SUGGESTIONS_AUTH_HEADER=X-API-Key
LLM_SUGGESTIONS_AUTH_PREFIX=
LLM_SUGGESTIONS_API_KEY=YOUR_GATEWAY_KEY
```

## Quick disable

```env
LLM_SUGGESTIONS_ENABLED=false
```

When disabled (or on provider failure), the service automatically falls back to rule-based suggestions.

## Force LLM for all clauses (optional)

If you want every clause suggestion to come from LLM (not only borderline/default candidates):

```env
LLM_SUGGESTIONS_FORCE_ALL=true
```
