import os
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from database import Base, PLANTS_UPLOAD_DIR, PROCESSED_UPLOAD_DIR, SOIL_UPLOAD_DIR, engine
from routes.auth_routes import router as auth_router
from routes.expert_routes import router as expert_router
from routes.passport_routes import router as passport_router
from routes.screening_routes import router as screening_router
from routes.weather_routes import router as weather_router
from services.vision_service import MODEL_MANAGER

load_dotenv()

ALLOWED_UPLOAD_DIRS = {
    "plants": PLANTS_UPLOAD_DIR.resolve(),
    "soil": SOIL_UPLOAD_DIR.resolve(),
    "processed": PROCESSED_UPLOAD_DIR.resolve(),
}


def create_app() -> FastAPI:
    Base.metadata.create_all(bind=engine)

    app = FastAPI(
        title="SasyaRaksha Plant Health API",
        version="1.0.0",
        description="Modular FastAPI + SQLAlchemy backend for multi-image crop screening, soil surface inspection, weather risk, and RBAC.",
    )

    origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    def health():
        return {
            "status": "ok",
            "appName": "SasyaRaksha",
            "database": "postgresql-sqlalchemy",
            "modelReady": MODEL_MANAGER.model is not None,
        }

    @app.get("/api/uploads/{subdir}/{filename}")
    def serve_safe_upload(subdir: str, filename: str):
        base_dir = ALLOWED_UPLOAD_DIRS.get(subdir)
        if not base_dir:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid upload directory.")
        safe_name = Path(filename).name
        if safe_name != filename or ".." in filename:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid filename.")
        target = (base_dir / safe_name).resolve()
        if target.parent != base_dir or not target.exists():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found.")
        return FileResponse(target)

    app.include_router(auth_router)
    app.include_router(screening_router)
    app.include_router(expert_router)
    app.include_router(passport_router)
    app.include_router(weather_router)
    return app


app = create_app()
