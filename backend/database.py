import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

BASE_DIR = Path(__file__).resolve().parent
RAW_DATABASE_URL = (os.getenv("DATABASE_URL") or os.getenv("SASYA_DB_URL") or "").strip()
if not RAW_DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is required for SasyaRaksha Python backend. "
        "Provide your Supabase PostgreSQL URI in backend/.env."
    )

# Normalize postgres:// to postgresql+psycopg:// for SQLAlchemy 2 + psycopg3
if RAW_DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = RAW_DATABASE_URL.replace("postgres://", "postgresql+psycopg://", 1)
elif RAW_DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = RAW_DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)
else:
    DATABASE_URL = RAW_DATABASE_URL

UPLOADS_DIR = BASE_DIR / "uploads"
PLANTS_UPLOAD_DIR = UPLOADS_DIR / "plants"
SOIL_UPLOAD_DIR = UPLOADS_DIR / "soil"
PROCESSED_UPLOAD_DIR = UPLOADS_DIR / "processed"
BACKUPS_DIR = BASE_DIR / "backups"

for directory in (PLANTS_UPLOAD_DIR, SOIL_UPLOAD_DIR, PROCESSED_UPLOAD_DIR, BACKUPS_DIR):
    directory.mkdir(parents=True, exist_ok=True)

connect_args = {"sslmode": "require"} if ("supabase." in DATABASE_URL and "sslmode=" not in DATABASE_URL) else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
