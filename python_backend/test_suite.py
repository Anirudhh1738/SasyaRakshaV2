"""
AgriGuard AI - Automated Verification Test Suite
Tests leaf segmentation, image suitability validation, severity boundaries, and FastAPI endpoints.
Run: pytest test_suite.py -v
"""

import io
import numpy as np
import cv2
from fastapi.testclient import TestClient
from main import app, segment_leaf_and_lesions

client = TestClient(app)


def make_leaf_bgr(lesion_ratio: float = 0.0) -> np.ndarray:
    img = np.full((240, 320, 3), (242, 244, 240), dtype=np.uint8)
    cv2.ellipse(img, (160, 120), (95, 70), 0, 0, 360, (48, 128, 52), -1)
    if lesion_ratio > 0:
        radius = int(18 + lesion_ratio * 55)
        cv2.circle(img, (160, 120), radius, (26, 42, 68), -1)
    return img


def test_health_endpoint():
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "model_ready" in data


def test_reject_non_leaf_image():
    blank_gray = np.full((240, 320, 3), 180, dtype=np.uint8)
    result = segment_leaf_and_lesions(blank_gray)
    assert result["suitable"] is False


def test_healthy_leaf_segmentation():
    leaf = make_leaf_bgr(lesion_ratio=0.0)
    result = segment_leaf_and_lesions(leaf)
    assert result["suitable"] is True
    assert result["severity"] == "Healthy"
    assert result["affected_area_pct"] < 1.5


def test_diseased_leaf_severity_scaling():
    low_leaf = make_leaf_bgr(lesion_ratio=0.1)
    high_leaf = make_leaf_bgr(lesion_ratio=0.75)
    low_res = segment_leaf_and_lesions(low_leaf)
    high_res = segment_leaf_and_lesions(high_leaf)
    assert low_res["suitable"] is True
    assert high_res["suitable"] is True
    assert high_res["affected_area_pct"] > low_res["affected_area_pct"]
    assert high_res["severity"] in ("Medium", "High")
