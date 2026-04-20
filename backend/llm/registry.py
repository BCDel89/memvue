from __future__ import annotations

from .base import LLMAdapter
from .ollama import OllamaAdapter
from .openai_compatible import OpenAICompatibleAdapter
from .anthropic import AnthropicAdapter


def build_llm_adapter(config: dict) -> LLMAdapter | None:
    provider = (config or {}).get("provider", "")
    if not provider:
        return None

    if provider == "ollama":
        base_url = config.get("base_url", "http://localhost:11434")
        model = config.get("model", "")
        return OllamaAdapter(base_url, model) if model else None

    if provider == "openai_compatible":
        base_url = config.get("base_url", "https://api.openai.com")
        api_key = config.get("api_key", "")
        model = config.get("model", "")
        return OpenAICompatibleAdapter(base_url, api_key, model) if model else None

    if provider == "anthropic":
        api_key = config.get("api_key", "")
        model = config.get("model", "claude-sonnet-4-6")
        return AnthropicAdapter(api_key, model) if api_key else None

    return None
