import io
from fastapi.testclient import TestClient
from PIL import Image
from backend.main import app


def _make_leaf_png_bytes(diseased: bool = True) -> bytes:
    img = Image.new("RGB", (220, 180), color=(244, 245, 240))
    px = img.load()
    for y in range(25, 155):
        for x in range(35, 185):
            px[x, y] = (46, 128, 54)
    if diseased:
        for y in range(60, 110):
            for x in range(70, 120):
                px[x, y] = (72, 42, 26)
        for y in range(52, 60):
            for x in range(65, 125):
                px[x, y] = (204, 178, 44)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_health_and_registration_and_rbac():
    with TestClient(app) as client:
        h = client.get("/health")
        assert h.status_code == 200
        assert h.json()["status"] == "ok"

        # Farmer registration forces lowest-privilege 'farmer' role
        reg = client.post(
            "/api/auth/register",
            json={
                "name": "Test Farmer",
                "email": "farmer_test_1@sasyaraksha.local",
                "password": "StrongPassword123",
                "region": "Nashik",
            },
        )
        assert reg.status_code in (201, 409)
        if reg.status_code == 201:
            token = reg.json()["token"]
            assert reg.json()["user"]["role"] == "farmer"

            # Farmer must be blocked (403) from expert & admin endpoints
            exp = client.get("/api/expert/queue", headers={"Authorization": f"Bearer {token}"})
            assert exp.status_code == 403
            adm = client.post("/api/admin/backups", headers={"Authorization": f"Bearer {token}"})
            assert adm.status_code == 403

        # Unauthenticated request must return 401
        unauth = client.get("/api/expert/queue")
        assert unauth.status_code == 401


def test_unsafe_upload_rejected_and_multi_image_persisted():
    with TestClient(app) as client:
        # Spoofed executable disguised as .jpg must fail magic-byte verification
        bad = client.post(
            "/api/analyze-multi",
            files=[("files", ("fake.jpg", b"MZ\x90\x00not_an_image_payload", "image/jpeg"))],
        )
        assert bad.status_code == 400

        # Valid multi-image screening persists to SQLite and reloads cleanly
        png_bytes = _make_leaf_png_bytes(diseased=True)
        ok = client.post(
            "/api/analyze-multi",
            files=[
                ("files", ("upper.png", png_bytes, "image/png")),
                ("files", ("lower.png", png_bytes, "image/png")),
            ],
            data={
                "surface_types": '["upper_leaf", "lower_leaf"]',
                "symptoms": '["Brown or black spots", "Yellow leaves"]',
                "symptom_duration_value": "5",
                "symptom_duration_unit": "days",
                "soil_moisture": "Moist",
                "soil_ph": "6.5",
                "soil_type": "Loam",
            },
        )
        assert ok.status_code == 200
        body = ok.json()
        pred_id = body["prediction_id"]
        assert body["passport_code"].startswith("SRP-")
        assert body["images_consistent"] is True

        # Post-screening confirmation stored separately
        conf = client.post(
            f"/api/predictions/{pred_id}/confirm",
            json={
                "same_plant_confirmed": True,
                "user_confirmation": "confirmed",
                "user_feedback_notes": "Verified on plot 2",
            },
        )
        assert conf.status_code == 200

        # Persistence verification: reload saved record from SQLite
        fetched = client.get(f"/api/predictions/{pred_id}")
        assert fetched.status_code == 200
        assert fetched.json()["user_confirmation"] == "confirmed"
        assert fetched.json()["images_count"] == 2
