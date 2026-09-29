import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from project root if present
env_path = Path(__file__).resolve().parents[2] / ".env"
if env_path.is_file():
    load_dotenv(dotenv_path=env_path)

from typing import List

class Settings:
    PROJECT_NAME: str = "MachineMind Mining Safety Command Center API"
    VERSION: str = "0.1.0"
    CHECKPOINT: str = "CHECKPOINT_8_REAL_TELEMETRY_PIPELINE"
    HOST: str = os.getenv("HOST", "127.0.0.1")
    PORT: int = int(os.getenv("PORT", "8000"))
    
    # PostgreSQL Database URL
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg://postgres:password@localhost:5432/machinemind"
    )
    
    # Allowed CORS origins (React Vite local dev server)
    ALLOWED_ORIGINS: List[str] = [
        origin.strip()
        for origin in os.getenv(
            "ALLOWED_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000"
        ).split(",")
        if origin.strip()
    ]

settings = Settings()
