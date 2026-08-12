"""Runtime settings.

The web app talks to MongoDB and nothing else. There is deliberately no wandb
configuration here: pulling from wandb is an offline concern that lives in
``backend.ingest`` and is never imported by the server.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Works unchanged for a local docker mongo or a hosted Atlas cluster.
    # For the public deployment point this at a read-only Atlas user.
    mongo_uri: str = "mongodb://localhost:27017"
    mongo_db: str = "gromotion"

    # Comma-separated list of allowed browser origins.
    cors_origins: str = "http://localhost:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
