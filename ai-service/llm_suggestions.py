import json
import os
import re
from pathlib import Path
from typing import Any, Dict, List

import httpx
try:
    from dotenv import load_dotenv
except Exception:  # pragma: no cover - optional dependency guard
    load_dotenv = None


def _load_env_file() -> None:
    """
    Load .env from this project directory.
    Falls back to a minimal parser if python-dotenv is unavailable.
    """
    env_path = Path(__file__).resolve().parent / ".env"
    if not env_path.exists():
        return

    if load_dotenv is not None:
        # Do not override process-level vars if already set.
        load_dotenv(dotenv_path=env_path, override=False)
        return

    # Minimal fallback parser: KEY=VALUE, ignores blanks/comments.
    try:
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip("\"' ")
            if key and key not in os.environ:
                os.environ[key] = value
    except Exception:
        # Never hard-fail service startup due to env parsing.
        return


_load_env_file()


def _env_flag(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env(name: str, default: str = "") -> str:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip()


def _provider() -> str:
    return _env("LLM_SUGGESTIONS_PROVIDER", "openai_compatible").lower()


def _auth_mode() -> str:
    return _env("LLM_SUGGESTIONS_AUTH_MODE", "bearer").lower()


def is_llm_suggestions_enabled() -> bool:
    if not _env_flag("LLM_SUGGESTIONS_ENABLED", default=False):
        return False
    mode = _auth_mode()
    if mode == "none":
        return True
    return bool(_env("LLM_SUGGESTIONS_API_KEY"))


def _debug_enabled() -> bool:
    return _env_flag("LLM_SUGGESTIONS_DEBUG", default=False)


def _debug(message: str) -> None:
    if _debug_enabled():
        print(f"[llm_suggestions] {message}", flush=True)


def _strip_code_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _build_messages(batch: List[dict]) -> list:
    system = (
        "You are a legal contract assistant. Return concise replacement wording for unfair contract clauses. "
        "Focus on rewriting the clause text so that obligations are more balanced between the parties. "
        "Respond strictly in JSON."
    )

    payload = {
        "instructions": [
            "For each clause item, provide a short replacement clause the user can paste directly into the contract.",
            "Write the replacement clause itself, not general advice or meta commentary.",
            "Do not give legal advice disclaimers.",
            "Return only valid JSON array: [{\"index\": number, \"suggestion\": string}].",
        ],
        "items": batch,
    }
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=True)},
    ]


def _chat_prompt_text(batch: List[dict]) -> str:
    messages = _build_messages(batch)
    return "\n\n".join(
        [f"{m['role'].upper()}:\n{m['content']}" for m in messages]
    )


def _merge_headers(base: Dict[str, str]) -> Dict[str, str]:
    merged = dict(base)
    extra_headers_raw = _env("LLM_SUGGESTIONS_EXTRA_HEADERS", "")
    if not extra_headers_raw:
        return merged

    try:
        extra = json.loads(extra_headers_raw)
    except Exception:
        return merged

    if isinstance(extra, dict):
        for key, value in extra.items():
            if isinstance(key, str) and isinstance(value, str):
                merged[key] = value
    return merged


def _build_auth_headers() -> Dict[str, str]:
    mode = _auth_mode()
    api_key = _env("LLM_SUGGESTIONS_API_KEY", "")
    if mode == "none":
        return {}
    if not api_key:
        return {}

    if mode == "x_api_key":
        return {"x-api-key": api_key}
    if mode == "custom_header":
        header = _env("LLM_SUGGESTIONS_AUTH_HEADER", "Authorization")
        prefix = _env("LLM_SUGGESTIONS_AUTH_PREFIX", "Bearer")
        return {header: f"{prefix} {api_key}".strip()}

    # default bearer
    return {"Authorization": f"Bearer {api_key}"}


def _openai_request_config(batch: List[dict]) -> tuple[str, Dict[str, str], dict]:
    base_url = _env("LLM_SUGGESTIONS_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    endpoint = _env("LLM_SUGGESTIONS_ENDPOINT", f"{base_url}/chat/completions")
    model = _env("LLM_SUGGESTIONS_MODEL", "gpt-4o-mini")
    body = {
        "model": model,
        "temperature": 0.2,
        "messages": _build_messages(batch),
    }
    headers = _merge_headers(
        {
            "Content-Type": "application/json",
            **_build_auth_headers(),
        }
    )
    return endpoint, headers, body


def _anthropic_request_config(batch: List[dict]) -> tuple[str, Dict[str, str], dict]:
    base_url = _env("LLM_SUGGESTIONS_BASE_URL", "https://api.anthropic.com/v1").rstrip("/")
    endpoint = _env("LLM_SUGGESTIONS_ENDPOINT", f"{base_url}/messages")
    model = _env("LLM_SUGGESTIONS_MODEL", "claude-3-5-sonnet-latest")
    max_tokens = int(_env("LLM_SUGGESTIONS_MAX_TOKENS", "700"))
    anthropic_version = _env("LLM_SUGGESTIONS_ANTHROPIC_VERSION", "2023-06-01")

    system = (
        "You are a legal contract assistant. Return concise, practical clause-improvement suggestions. "
        "Focus on balancing obligations between parties. Respond strictly in JSON."
    )
    user_text = _chat_prompt_text(batch)
    body = {
        "model": model,
        "max_tokens": max_tokens,
        "temperature": 0.2,
        "system": system,
        "messages": [{"role": "user", "content": user_text}],
    }
    headers = _merge_headers(
        {
            "Content-Type": "application/json",
            "anthropic-version": anthropic_version,
            **_build_auth_headers(),
        }
    )
    return endpoint, headers, body


def _extract_response_content(payload: dict) -> str:
    provider = _provider()

    if provider == "anthropic":
        content_blocks = payload.get("content", [])
        if isinstance(content_blocks, list):
            text_parts: list[str] = []
            for block in content_blocks:
                if not isinstance(block, dict):
                    continue
                if block.get("type") == "text" and isinstance(block.get("text"), str):
                    text_parts.append(block["text"])
            return "\n".join(text_parts).strip()
        return ""

    # default: openai-compatible response
    return payload["choices"][0]["message"]["content"]


def _parse_suggestions_content(content: str) -> list:
    cleaned = _strip_code_fences(content)
    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, list):
            return parsed
    except Exception:
        pass

    # Fallback: extract first JSON array in noisy responses.
    match = re.search(r"\[.*\]", cleaned, flags=re.DOTALL)
    if not match:
        return []
    try:
        parsed = json.loads(match.group(0))
        if isinstance(parsed, list):
            return parsed
    except Exception:
        return []
    return []


def ask_llm_question(question: str) -> dict:
    """
    Direct provider connectivity test endpoint helper.
    Returns: {success, provider, model, content, error}
    """
    provider = _provider()
    model = _env("LLM_SUGGESTIONS_MODEL", "")

    if not is_llm_suggestions_enabled():
        return {
            "success": False,
            "provider": provider,
            "model": model,
            "content": "",
            "error": "LLM suggestions disabled or missing API key.",
        }

    sample_batch = [{"index": 0, "clause": question, "label": "unfair", "confidence": 0.5}]
    timeout = float(_env("LLM_SUGGESTIONS_TIMEOUT_SECONDS", "20"))
    if provider == "anthropic":
        endpoint, headers, body = _anthropic_request_config(sample_batch)
    else:
        endpoint, headers, body = _openai_request_config(sample_batch)

    _debug(
        f"ask_question_start provider={provider} endpoint={endpoint} model={body.get('model')} timeout={timeout}"
    )
    try:
        response = httpx.post(endpoint, headers=headers, json=body, timeout=timeout)
        status_code = getattr(response, "status_code", 200)
        if status_code >= 400:
            preview = response.text[:500].replace("\n", " ")
            _debug(f"ask_question_http_error status={status_code} body_preview={preview}")
            return {
                "success": False,
                "provider": provider,
                "model": body.get("model", model),
                "content": "",
                "error": f"HTTP {status_code}: {preview}",
            }

        payload = response.json()
        content = _extract_response_content(payload).strip()
        if not content:
            _debug("ask_question_empty_content")
            return {
                "success": False,
                "provider": provider,
                "model": body.get("model", model),
                "content": "",
                "error": "Provider returned empty content.",
            }

        _debug("ask_question_success")
        return {
            "success": True,
            "provider": provider,
            "model": body.get("model", model),
            "content": content,
            "error": "",
        }
    except Exception as exc:
        _debug(f"ask_question_exception type={type(exc).__name__} msg={exc}")
        return {
            "success": False,
            "provider": provider,
            "model": body.get("model", model),
            "content": "",
            "error": f"{type(exc).__name__}: {exc}",
        }


def _generate_llm_suggestions_once(batch: List[dict]) -> List[str | None]:
    provider = _provider()
    timeout = float(_env("LLM_SUGGESTIONS_TIMEOUT_SECONDS", "20"))

    if provider == "anthropic":
        endpoint, headers, body = _anthropic_request_config(batch)
    else:
        endpoint, headers, body = _openai_request_config(batch)

    _debug(
        f"request_start provider={provider} endpoint={endpoint} model={body.get('model')} items={len(batch)} timeout={timeout}"
    )

    try:
        response = httpx.post(endpoint, headers=headers, json=body, timeout=timeout)
        status_code = getattr(response, "status_code", 200)
        if status_code >= 400:
            preview = response.text[:300].replace("\n", " ")
            _debug(f"http_error status={status_code} body_preview={preview}")
            return [None] * len(batch)
        payload = response.json()
        content = _extract_response_content(payload)
        if not content:
            _debug("empty_content_from_provider")
            return [None] * len(batch)
        parsed = _parse_suggestions_content(content)
    except Exception as exc:
        _debug(f"request_exception type={type(exc).__name__} msg={exc}")
        return [None] * len(batch)

    mapped: dict[int, str] = {}
    if isinstance(parsed, list):
        for entry in parsed:
            if not isinstance(entry, dict):
                continue
            idx = entry.get("index")
            suggestion = entry.get("suggestion")
            if isinstance(idx, int) and isinstance(suggestion, str) and suggestion.strip():
                mapped[idx] = suggestion.strip()

    resolved = [mapped.get(item["index"]) for item in batch]
    _debug(f"request_done resolved={sum(1 for x in resolved if x)} total={len(resolved)}")
    return resolved


def generate_llm_suggestions_batch(batch: List[dict]) -> List[str | None]:
    """
    Generate suggestions for a list of clause dicts with keys:
    - index (int)
    - clause (str)
    - label (str)
    - confidence (float)
    """
    if not batch:
        return []
    if not is_llm_suggestions_enabled():
        _debug("disabled_or_missing_key")
        return [None] * len(batch)

    batch_size = max(1, int(_env("LLM_SUGGESTIONS_BATCH_SIZE", "4")))
    outputs: List[str | None] = [None] * len(batch)

    for start in range(0, len(batch), batch_size):
        chunk = batch[start : start + batch_size]
        _debug(f"chunk_start start={start} size={len(chunk)}")
        chunk_out = _generate_llm_suggestions_once(chunk)
        for i, item in enumerate(chunk_out):
            outputs[start + i] = item

    _debug(f"batch_done resolved={sum(1 for x in outputs if x)} total={len(outputs)}")
    return outputs