import llm_suggestions


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


def test_openai_compatible_provider_with_no_auth(monkeypatch):
    monkeypatch.setenv("LLM_SUGGESTIONS_ENABLED", "true")
    monkeypatch.setenv("LLM_SUGGESTIONS_PROVIDER", "openai_compatible")
    monkeypatch.setenv("LLM_SUGGESTIONS_AUTH_MODE", "none")
    monkeypatch.setenv("LLM_SUGGESTIONS_ENDPOINT", "http://127.0.0.1:1234/v1/chat/completions")

    captured = {}

    def _fake_post(url, headers, json, timeout):
        captured["url"] = url
        captured["headers"] = headers
        captured["body"] = json
        return _FakeResponse(
            {
                "choices": [
                    {"message": {"content": '[{"index": 0, "suggestion": "Add mutual notice period."}]'}}
                ]
            }
        )

    monkeypatch.setattr(llm_suggestions.httpx, "post", _fake_post)

    out = llm_suggestions.generate_llm_suggestions_batch(
        [{"index": 0, "clause": "x", "label": "unfair", "confidence": 0.6}]
    )
    assert out == ["Add mutual notice period."]
    assert captured["url"] == "http://127.0.0.1:1234/v1/chat/completions"
    assert captured["headers"].get("Authorization") is None


def test_anthropic_provider_parsing(monkeypatch):
    monkeypatch.setenv("LLM_SUGGESTIONS_ENABLED", "true")
    monkeypatch.setenv("LLM_SUGGESTIONS_PROVIDER", "anthropic")
    monkeypatch.setenv("LLM_SUGGESTIONS_AUTH_MODE", "x_api_key")
    monkeypatch.setenv("LLM_SUGGESTIONS_API_KEY", "test-key")
    monkeypatch.setenv("LLM_SUGGESTIONS_ENDPOINT", "https://api.anthropic.com/v1/messages")

    def _fake_post(url, headers, json, timeout):
        assert url.endswith("/messages")
        assert headers.get("x-api-key") == "test-key"
        return _FakeResponse(
            {
                "content": [
                    {
                        "type": "text",
                        "text": '[{"index": 0, "suggestion": "Clarify objective termination criteria."}]',
                    }
                ]
            }
        )

    monkeypatch.setattr(llm_suggestions.httpx, "post", _fake_post)

    out = llm_suggestions.generate_llm_suggestions_batch(
        [{"index": 0, "clause": "y", "label": "unfair", "confidence": 0.7}]
    )
    assert out == ["Clarify objective termination criteria."]
