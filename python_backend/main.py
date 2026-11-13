"""
AgriGuard AI - Local PyTorch MobileNetV3 + OpenCV FastAPI Inference Server
Run on Windows/Linux:
  uvicorn main:app --host 127.0.0.1 --port 8000
"""

from __future__ import annotations

import base64
import io
import json
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
import torch
import torch.nn as nn
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from PIL import Image
from torchvision import models, transforms

app = FastAPI(title="AgriGuard AI Vision Backend", version="1.0.0")

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "models" / "plantvillage_mobilenetv3.pth"
CLASSES_PATH = BASE_DIR / "models" / "classes.json"

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

INFERENCE_TRANSFORM = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])

_model: Optional[nn.Module] = None
_classes: list[str] = []


def load_model() -> tuple[Optional[nn.Module], list[str]]:
    global _model, _classes
    if _model is not None and _classes:
        return _model, _classes

    if not MODEL_PATH.exists() or not CLASSES_PATH.exists():
        return None, []

    with open(CLASSES_PATH, "r", encoding="utf-8") as f:
        _classes = json.load(f)

    model = models.mobilenet_v3_large(weights=None)
    in_features = model.classifier[3].in_features
    model.classifier[3] = nn.Linear(in_features, len(_classes))
    state = torch.load(MODEL_PATH, map_location=DEVICE)
    model.load_state_dict(state)
    model.to(DEVICE)
    model.eval()
    _model = model
    return _model, _classes


def parse_class_label(raw_label: str) -> tuple[str, str]:
    """Converts PlantVillage format 'Tomato___Early_blight' -> ('Tomato', 'Early Blight')."""
    if "___" in raw_label:
        crop, disease = raw_label.split("___", 1)
    else:
        crop, disease = "Unknown", raw_label
    crop_clean = crop.replace("_", " ").strip().title()
    disease_clean = disease.replace("_", " ").strip().title()
    if disease_clean.lower() == "healthy":
        disease_clean = "Healthy"
    return crop_clean, disease_clean


def segment_leaf_and_lesions(bgr_img: np.ndarray) -> dict:
    """
    OpenCV foliar segmentation & infected lesion estimation:
    1. Computes Excess Green (ExG = 2G - R - B) + HSV green bounds for leaf region.
    2. Expands enclosed chlorotic/necrotic/rust/powdery patches via morphological closing.
    3. Measures affected leaf area % and renders highlighted overlay PNG.
    """
    h_orig, w_orig = bgr_img.shape[:2]
    scale = min(1.0, 400.0 / max(w_orig, h_orig))
    img = cv2.resize(bgr_img, (int(w_orig * scale), int(h_orig * scale))) if scale < 1.0 else bgr_img.copy()

    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    b, g, r = cv2.split(img.astype(np.int16))
    exg = 2 * g - r - b

    # Core chlorophyll mask
    green_hsv = cv2.inRange(hsv, np.array([28, 35, 30]), np.array([90, 255, 255]))
    green_exg = (exg > 16).astype(np.uint8) * 255
    green_mask = cv2.bitwise_or(green_hsv, green_exg)

    total_pixels = img.shape[0] * img.shape[1]
    green_pct = (np.count_nonzero(green_mask) / total_pixels) * 100.0

    if green_pct < 6.0:
        return {
            "suitable": False,
            "rejection_reason": f"Measured chlorophyll foliage is only {green_pct:.1f}%. Upload a close-up plant leaf photo.",
            "leaf_coverage_pct": round(green_pct, 1),
        }

    # Close leaf boundary to include internal necrotic/chlorotic lesions
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    leaf_mask = cv2.morphologyEx(green_mask, cv2.MORPH_CLOSE, kernel)
    leaf_pixels = int(np.count_nonzero(leaf_mask))

    # Lesion segmentation inside leaf_mask
    chlorosis_mask = cv2.bitwise_and(
        cv2.inRange(hsv, np.array([17, 55, 65]), np.array([33, 255, 245])),
        leaf_mask,
    )
    necrosis_mask = cv2.bitwise_and(
        cv2.inRange(hsv, np.array([0, 25, 15]), np.array([22, 255, 120])),
        leaf_mask,
    )
    powdery_mask = cv2.bitwise_and(
        cv2.inRange(hsv, np.array([0, 0, 165]), np.array([180, 52, 245])),
        leaf_mask,
    )

    infected_mask = cv2.bitwise_or(chlorosis_mask, cv2.bitwise_or(necrosis_mask, powdery_mask))
    infected_pixels = int(np.count_nonzero(infected_mask))
    affected_area_pct = (infected_pixels / max(1, leaf_pixels)) * 100.0

    if affected_area_pct >= 35.0:
        severity = "High"
    elif affected_area_pct >= 15.0:
        severity = "Medium"
    elif affected_area_pct >= 1.5:
        severity = "Low"
    else:
        severity = "Healthy"

    # Build visual overlay
    overlay = img.copy()
    overlay[leaf_mask == 0] = (overlay[leaf_mask == 0] * 0.35 + 30).astype(np.uint8)
    overlay[chlorosis_mask > 0] = (overlay[chlorosis_mask > 0] * 0.35 + np.array([6, 119, 217]) * 0.65).astype(np.uint8)
    overlay[necrosis_mask > 0] = (overlay[necrosis_mask > 0] * 0.25 + np.array([38, 38, 220]) * 0.75).astype(np.uint8)
    overlay[powdery_mask > 0] = (overlay[powdery_mask > 0] * 0.25 + np.array([110, 118, 15]) * 0.75).astype(np.uint8)

    contours, _ = cv2.findContours(infected_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cv2.drawContours(overlay, contours, -1, (0, 255, 255), 1)

    _, png_buf = cv2.imencode(".png", overlay)
    b64_png = base64.b64encode(png_buf.tobytes()).decode("ascii")

    return {
        "suitable": True,
        "affected_area_pct": round(affected_area_pct, 2),
        "severity": severity,
        "leaf_coverage_pct": round((leaf_pixels / total_pixels) * 100.0, 1),
        "chlorosis_pct": round((np.count_nonzero(chlorosis_mask) / max(1, leaf_pixels)) * 100.0, 2),
        "necrosis_pct": round((np.count_nonzero(necrosis_mask) / max(1, leaf_pixels)) * 100.0, 2),
        "rust_pct": 0.0,
        "powdery_pct": round((np.count_nonzero(powdery_mask) / max(1, leaf_pixels)) * 100.0, 2),
        "leaf_pixels": leaf_pixels,
        "infected_pixels": infected_pixels,
        "processed_image_base64": b64_png,
    }


@app.get("/health")
def health():
    model, classes = load_model()
    return {
        "status": "ok",
        "architecture": "MobileNetV3-Large",
        "model_ready": model is not None,
        "num_classes": len(classes),
        "classes": classes,
        "model_path": str(MODEL_PATH),
        "device": str(DEVICE),
    }


@app.post("/predict")
async def predict(file: UploadFile = File(...), crop_hint: Optional[str] = Form(None)):
    model, classes = load_model()
    if model is None:
        raise HTTPException(
            status_code=503,
            detail="PyTorch PlantVillage model checkpoint not found. Run train_plantvillage.py first.",
        )

    raw = await file.read()
    np_arr = np.frombuffer(raw, np.uint8)
    bgr = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if bgr is None:
        raise HTTPException(status_code=400, detail="Invalid image file.")

    h_img, w_img = bgr.shape[:2]
    seg = segment_leaf_and_lesions(bgr)
    if not seg["suitable"]:
        return seg

    pil_img = Image.open(io.BytesIO(raw)).convert("RGB")
    tensor = INFERENCE_TRANSFORM(pil_img).unsqueeze(0).to(DEVICE)

    with torch.no_grad():
        logits = model(tensor)
        probs = torch.softmax(logits, dim=1).squeeze(0).cpu().numpy()

    ranked_indices = np.argsort(probs)[::-1]
    if crop_hint:
        filtered = [i for i in ranked_indices if parse_class_label(classes[i])[0].lower() == crop_hint.lower()]
        if filtered:
            ranked_indices = np.array(filtered)

    top_idx = int(ranked_indices[0])
    top_crop, top_disease = parse_class_label(classes[top_idx])
    top_conf = round(float(probs[top_idx]) * 100.0, 1)

    alternatives = []
    for idx in ranked_indices[1:4]:
        c_name, d_name = parse_class_label(classes[int(idx)])
        alternatives.append({
            "crop": c_name,
            "disease": d_name,
            "confidence": round(float(probs[int(idx)]) * 100.0, 1),
        })

    second_conf = alternatives[0]["confidence"] if alternatives else 0.0
    uncertain = bool(top_conf < 55.0 or (top_conf - second_conf) < 8.0)
    uncertainty_reason = (
        "Model confidence is moderate or close to an alternative condition. Consider uploading a clearer close-up or requesting expert verification."
        if uncertain
        else ""
    )

    return {
        **seg,
        "crop": top_crop,
        "predicted_disease": top_disease,
        "confidence": top_conf,
        "uncertain": uncertain,
        "uncertainty_reason": uncertainty_reason,
        "alternative_predictions": alternatives,
        "image_width": int(w_img),
        "image_height": int(h_img),
        "model_engine": "pytorch-mobilenetv3-opencv",
    }
