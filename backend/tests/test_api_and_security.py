import base64
import io
import os
import sys
from pathlib import Path
from PIL import Image
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ["SASYA_DB_URL"] = f"sqlite:///{(BACKEND_DIR / 'test_sasyaraksha.db').as_posix()}"

from auth import hash_password  # noqa: E402
from database import Base, SessionLocal, engine  # noqa: E402
from main import app  # noqa: E402
from models import User  # noqa: E402

client = TestClient(app)


def setup_module(_module):
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def teardown_module(_module):
    db_file = BACKEND_DIR / "test_sasyaraksha.db"
    if db_file.exists():
        db_file.unlink()


def _make_leaf_data_url() -> str:
    img = Image.new("RGB", (240, 240), (242, 242, 240))
    px = img.load()
    for y in range(40, 200):
        for x in range(40, 200):
            if 95 <= x <= 135 and 95 <= y <= 135:
                px[x, y] = (120, 75, 40)  # necrotic spot
            else:
                px[x, y] = (48, 138, 62)  # green leaf
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def test_health_and_rbac_security():
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["appName"] == "SasyaRaksha"

    # Unauthenticated access to expert & backup routes must return 401
    assert client.get("/api/expert/queue").status_code == 401
    assert client.get("/api/admin/backups").status_code == 401

    # Register farmer (must strictly ignore any elevated role attempt and assign 'farmer')
    reg = client.post(
        "/api/auth/register",
        json={
            "name": "Asha Farmer",
            "email": "asha@farm.in",
            "password": "StrongPassword123",
            "region": "Mandya",
            "preferredLanguage": "kn",
        },
    )
    assert reg.status_code == 201
    farmer_data = reg.json()
    assert farmer_data["user"]["role"] == "farmer"
    assert farmer_data["user"]["preferred_language"] == "kn"
    farmer_token = farmer_data["token"]

    # Farmer cannot access expert or admin backup endpoints -> 403
    assert client.get("/api/expert/queue", headers={"Authorization": f"Bearer {farmer_token}"}).status_code == 403
    assert client.post("/api/admin/backup", headers={"Authorization": f"Bearer {farmer_token}"}).status_code == 403


def test_invalid_file_upload_and_path_traversal():
    bad = client.post(
        "/api/analyze",
        json={"imageBase64": "data:application/pdf;base64,JVBERi0xLjQ=", "filename": "evil.pdf"},
    )
    assert bad.status_code == 400

    # Path traversal blocked on upload serving
    trav = client.get("/api/uploads/plants/..%2Fmain.py")
    assert trav.status_code in (400, 404)


def test_multi_image_screening_feedback_and_admin_backup():
    leaf = _make_leaf_data_url()
    resp = client.post(
        "/api/analyze",
        json={
            "images": [
                {"imageBase64": leaf, "filename": "leaf_top.png", "role": "closeup_leaf"},
                {"imageBase64": leaf, "filename": "leaf_bottom.png", "role": "underside_leaf"},
            ],
            "symptoms": ["brown_black_spots"],
            "durationValue": 4,
            "durationUnit": "days",
            "manualSoil": {"moisture": "moist", "ph": "6.5", "soilType": "loam"},
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    pred_id = data["prediction"]["id"]
    assert data["prediction"]["passport_code"].startswith("SRP-")

    # Farmer feedback does not overwrite predicted_disease
    fb = client.post(
        f"/api/predictions/{pred_id}/feedback",
        json={"feedbackStatus": "confirmed", "samePlantConfirmed": True, "notes": "Clear spots"},
    )
    assert fb.status_code == 200
    assert fb.json()["prediction"]["predicted_disease"] == data["prediction"]["predicted_disease"]
    assert fb.json()["prediction"]["user_feedback_status"] == "confirmed"

    # Seed admin directly in SQLite and verify backup creation works for admin only
    db = SessionLocal()
    try:
        admin = User(
            name="System Admin",
            email="admin@sasyaraksha.local",
            password_hash=hash_password("AdminSecret123"),
            role="admin",
        )
        db.add(admin)
        db.commit()
    finally:
        db.close()

    login = client.post("/api/auth/login", json={"email": "admin@sasyaraksha.local", "password": "AdminSecret123"})
    assert login.status_code == 200
    admin_token = login.json()["token"]

    bk = client.post("/api/admin/backup", headers={"Authorization": f"Bearer {admin_token}"})
    assert bk.status_code == 201
    filename = bk.json()["backup"]["filename"]
    assert filename.endswith(".db")
    dl = client.get(f"/api/admin/backup/download/{filename}", headers={"Authorization": f"Bearer {admin_token}"})
    assert dl.status_code == 200
