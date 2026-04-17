"""Configuration management using Pydantic settings."""

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Config(BaseSettings):
    """Application configuration."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # AI Gateway
    ai_gateway_url: str = Field(..., alias="AI_GATEWAY_URL")
    google_api_key: str = Field(..., alias="GOOGLE_API_KEY")

    # Edge Worker
    edge_base_url: str = Field(..., alias="EDGE_BASE_URL")
    edge_api_token: str = Field(..., alias="EDGE_API_TOKEN")

    # R2 Storage
    r2_endpoint: str = Field(..., alias="R2_ENDPOINT")
    r2_access_key_id: str = Field(..., alias="R2_ACCESS_KEY_ID")
    r2_secret_access_key: str = Field(..., alias="R2_SECRET_ACCESS_KEY")
    r2_bucket: str = Field(..., alias="R2_BUCKET")

    # Gemini Models
    gemini_chat_model: str = Field(default="gemini-2.5-flash", alias="GEMINI_CHAT_MODEL")
    gemini_embed_model: str = Field(default="gemini-embedding-001", alias="GEMINI_EMBED_MODEL")
    gemini_embed_dimensions: int = Field(default=768, alias="GEMINI_EMBED_DIMENSIONS")

    # Application
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    health_port: int = Field(default=8080, alias="HEALTH_PORT")
    batch_size: int = Field(default=10, alias="BATCH_SIZE")
    visibility_timeout: int = Field(default=60, alias="VISIBILITY_TIMEOUT")


# Global config instance
_config: Config | None = None


def get_config() -> Config:
    """Get the global configuration instance."""
    global _config
    if _config is None:
        _config = Config()  # type: ignore
    return _config

