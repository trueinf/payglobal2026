from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../../.env"), extra="ignore")
    database_url: str = "postgresql://postgres@/strada?host=/tmp&port=5433"
    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-sonnet-4-5"
    strada_sys_url: str = "http://localhost:8081"
    elevenlabs_api_key: str | None = None
    elevenlabs_agent_id: str | None = None
    elevenlabs_voice_rep: str = "EXAVITQu4vr4xnSDxMaL"
    replay: bool = False
    owner: str = "Priya Natarajan"
    cors_origins: str = "*"
    demo_secret: str | None = None          # set in hosted environments; the workspace sends it as x-demo-secret
    migrate_on_start: bool = False          # hosted: apply packages/schema/migrations/*.sql and seed when the schema is empty

settings = Settings()
