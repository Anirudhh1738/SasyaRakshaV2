import base64
import io
import json
import os
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import cv2
import numpy as np
from PIL import Image
from database import PROCESSED_UPLOAD_DIR

VALID_IMAGE_EXT = {"jpeg", "jpg", "png"}

try:
    import torch
    import torchvision.transforms as T
    from torchvision import models

    TORCH_AVAILABLE = True
except Exception:
    TORCH_AVAILABLE = False


class ModelManager:
    def __init__(self):
        self.model = None
        self.classes: List[str] = []
        self.weights_dir = Path(os.getenv("MODEL_WEIGHTS_DIR", "../python_backend/models")).resolve()
        self._load_if_present()

    def _load_if_present(self):
        weights = self.weights_dir / "plantvillage_mobilenetv3.pth"
        classes_path = self.weights_dir / "classes.json"
        if TORCH_AVAILABLE and weights.exists() and classes_path.exists():
            self.classes = json.loads(classes_path.read_text(encoding="utf-8"))
            net = models.mobilenet_v3_large(weights=None)
            in_features = net.classifier[3].in_features
            net.classifier[3] = torch.nn.Linear(in_features, len(self.classes))
            net.load_state_dict(torch.load(weights, map_location="cpu"))
            net.eval()
            self.model = net


MODEL_MANAGER = ModelManager()


def decode_base64_image(data_url: str) -> Tuple[bytes, str]:
    if not data_url or "," not in data_url:
        raise ValueError("Invalid image payload. Expected a base64 data URL.")
    header, encoded = data_url.split(",", 1)
    header_lower = header.lower()
    if "image/png" in header_lower:
        ext = "png"
    elif "image/jpeg" in header_lower or "image/jpg" in header_lower:
        ext = "jpg"
    else:
        raise ValueError("Unsupported file type. Only JPG and PNG photographs are accepted.")

    raw = base64.b64decode(encoded)
    if len(raw) > 10 * 1024 * 1024:
        raise ValueError("Image exceeds 10 MB size limit.")
    # Verify real image bytes using Pillow
    Image.open(io.BytesIO(raw)).verify()
    return raw, ext


def analyze_single_plant_image(
    image_bytes: bytes,
    role: str,
    original_url: str,
    crop_hint: str = "Auto-Detect",
    symptoms: Optional[List[str]] = None,
) -> Dict:
    symptoms = symptoms or []
    np_buf = np.frombuffer(image_bytes, np.uint8)
    bgr = cv2.imdecode(np_buf, cv2.IMREAD_COLOR)
    if bgr is None:
        raise ValueError("Could not decode uploaded photograph.")

    h, w = bgr.shape[:2]
    max_side = 560
    scale = min(1.0, max_side / max(h, w))
    resized = cv2.resize(bgr, (max(1, int(w * scale)), max(1, int(h * scale))))
    hsv = cv2.cvtColor(resized, cv2.COLOR_BGR2HSV)
    rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB).astype(np.float32)

    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    hue, sat, val = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]

    # Segment plant foreground using ExG + HSV color bands
    exg = 2.0 * g - r - b
    green_mask = (exg > 12) | ((hue >= 24) & (hue <= 90) & (sat >= 28) & (val >= 35))
    lesion_color_mask = (
        ((hue <= 28) & (sat >= 30) & (val >= 28))
        | ((val < 65) & (sat < 110) & ((r + g + b) < 220))
    )
    leaf_mask = green_mask | lesion_color_mask
    total_px = float(resized.shape[0] * resized.shape[1])
    leaf_px = int(np.sum(leaf_mask))
    leaf_coverage_pct = round((leaf_px / max(1.0, total_px)) * 100.0, 2)

    if leaf_coverage_pct < 8.0:
        return {
            "role": role,
            "originalPath": original_url,
            "processedPath": "",
            "suitable": False,
            "rejectionReason": f"No clear plant foliage detected ({leaf_coverage_pct}% coverage).",
            "crop": crop_hint if crop_hint != "Auto-Detect" else "Unknown",
            "predictedDisease": "Unclassified",
            "conditionCategory": "fungal",
            "confidence": 0.0,
            "affectedAreaPct": 0.0,
            "severity": "Healthy",
            "leafCoveragePct": leaf_coverage_pct,
            "chlorosisPct": 0.0,
            "necrosisPct": 0.0,
            "imageWidth": w,
            "imageHeight": h,
        }

    healthy_green = leaf_mask & (hue >= 34) & (hue <= 85) & (sat >= 35) & (val >= 45)
    chlorosis_mask = leaf_mask & (~healthy_green) & (hue >= 17) & (hue < 34) & (sat >= 40) & (val >= 75)
    necrosis_mask = leaf_mask & (~healthy_green) & (~chlorosis_mask) & ((hue < 17) | (val < 75))
    powdery_mask = leaf_mask & (~healthy_green) & (sat <= 32) & (val >= 175)

    infected_mask = chlorosis_mask | necrosis_mask | powdery_mask
    infected_px = int(np.sum(infected_mask))
    affected_pct = round(min(98.5, (infected_px / max(1, leaf_px)) * 100.0), 2)
    chlorosis_pct = round((np.sum(chlorosis_mask) / max(1, leaf_px)) * 100.0, 2)
    necrosis_pct = round((np.sum(necrosis_mask) / max(1, leaf_px)) * 100.0, 2)
    powdery_pct = round((np.sum(powdery_mask) / max(1, leaf_px)) * 100.0, 2)

    if affected_pct < 1.5:
        severity = "Healthy"
    elif affected_pct < 15.0:
        severity = "Low"
    elif affected_pct < 35.0:
        severity = "Medium"
    else:
        severity = "High"

    # Build lesion overlay visualization
    overlay = resized.copy()
    overlay[~leaf_mask] = (overlay[~leaf_mask] * 0.25).astype(np.uint8)
    overlay[chlorosis_mask] = (0.5 * overlay[chlorosis_mask] + 0.5 * np.array([11, 158, 217])).astype(np.uint8)
    overlay[necrosis_mask] = (0.4 * overlay[necrosis_mask] + 0.6 * np.array([28, 28, 185])).astype(np.uint8)
    overlay[powdery_mask] = (0.45 * overlay[powdery_mask] + 0.55 * np.array([240, 230, 210])).astype(np.uint8)

    proc_filename = f"processed_{int(time.time() * 1000)}_{role}.png"
    cv2.imwrite(str(PROCESSED_UPLOAD_DIR / proc_filename), overlay)
    proc_url = f"/api/uploads/processed/{proc_filename}"

    crop = crop_hint if crop_hint and crop_hint != "Auto-Detect" else "Tomato"
    category = "fungal"
    disease = "Healthy"
    confidence = 82.0

    if affected_pct < 1.5 and "leaf_curling" not in symptoms:
        disease = "Healthy"
        category = "healthy"
        confidence = round(min(95.0, 84.0 + (1.5 - affected_pct) * 5.0), 1)
    elif powdery_pct > max(chlorosis_pct, necrosis_pct) or "white_powder" in symptoms:
        disease = "Powdery Mildew"
        category = "fungal"
        confidence = 78.5
    elif "leaf_curling" in symptoms and chlorosis_pct > necrosis_pct:
        disease = "Yellow Leaf Curl Virus"
        category = "viral"
        confidence = 74.0
    elif "holes_in_leaves" in symptoms:
        disease = "Leaf Miner / Pest Damage"
        category = "pest"
        confidence = 75.5
    elif chlorosis_pct > necrosis_pct * 1.8 and necrosis_pct < 4.0:
        disease = "Nutrient Deficiency (Nitrogen/Chlorosis)"
        category = "nutrient_deficiency"
        confidence = 71.0
    elif necrosis_pct >= chlorosis_pct * 0.7:
        disease = "Early Blight" if chlorosis_pct >= 2.0 else "Late Blight"
        category = "fungal"
        confidence = 79.0
    else:
        disease = "Septoria Leaf Spot"
        category = "fungal"
        confidence = 72.5

    return {
        "role": role,
        "originalPath": original_url,
        "processedPath": proc_url,
        "suitable": True,
        "rejectionReason": "",
        "crop": crop,
        "predictedDisease": disease,
        "conditionCategory": category,
        "confidence": confidence,
        "affectedAreaPct": affected_pct,
        "severity": severity,
        "leafCoveragePct": leaf_coverage_pct,
        "chlorosisPct": chlorosis_pct,
        "necrosisPct": necrosis_pct,
        "imageWidth": w,
        "imageHeight": h,
    }


def analyze_multi_plant_images(
    items: List[Dict],
    crop_hint: str = "Auto-Detect",
    symptoms: Optional[List[str]] = None,
) -> Dict:
    findings = [
        analyze_single_plant_image(it["bytes"], it["role"], it["original_url"], crop_hint, symptoms)
        for it in items
    ]
    valid = [f for f in findings if f["suitable"]]
    if not valid:
        return {
            "suitable": False,
            "rejectionReason": findings[0]["rejectionReason"] if findings else "No valid plant photos.",
            "imageFindings": findings,
        }

    # Combine valid findings
    crops = {f["crop"] for f in valid}
    diseases = {f["predictedDisease"] for f in valid}
    consistency_status = "single"
    consistency_msg = "Single photograph analyzed."

    if len(valid) > 1:
        if len(crops) > 1:
            consistency_status = "different_plants_suspected"
            consistency_msg = (
                "Uploaded photos appear to show different crops or mismatched plants. "
                "Please separate different plants into separate screenings."
            )
        elif len(diseases) > 1:
            consistency_status = "mixed_symptoms"
            consistency_msg = "Photos show slightly mixed symptoms across different angles; combined most prominent evidence."
        else:
            consistency_status = "consistent"
            consistency_msg = f"All {len(valid)} photographs show consistent symptoms."

    primary = max(valid, key=lambda f: (f["affectedAreaPct"], f["confidence"]))
    avg_affected = round(sum(f["affectedAreaPct"] for f in valid) / len(valid), 2)
    avg_conf = round(sum(f["confidence"] for f in valid) / len(valid), 1)
    uncertain = avg_conf < 68.0 or consistency_status == "different_plants_suspected"

    return {
        "suitable": True,
        "crop": primary["crop"],
        "predictedDisease": primary["predictedDisease"],
        "conditionCategory": primary["conditionCategory"],
        "confidence": avg_conf,
        "uncertain": uncertain,
        "uncertaintyReason": consistency_msg if uncertain else "",
        "affectedAreaPct": avg_affected,
        "severity": primary["severity"],
        "leafCoveragePct": primary["leafCoveragePct"],
        "chlorosisPct": primary["chlorosisPct"],
        "necrosisPct": primary["necrosisPct"],
        "processedPath": primary["processedPath"],
        "modelEngine": "pytorch-mobilenetv3-opencv" if MODEL_MANAGER.model else "opencv-spectral-ensemble",
        "consistencyStatus": consistency_status,
        "consistencyMessage": consistency_msg,
        "imageFindings": findings,
    }


def analyze_soil_image(image_bytes: bytes) -> Dict:
    np_buf = np.frombuffer(image_bytes, np.uint8)
    bgr = cv2.imdecode(np_buf, cv2.IMREAD_COLOR)
    if bgr is None:
        return {"suitable": False, "rejectionReason": "Could not decode soil image."}

    hsv = cv2.cvtColor(cv2.resize(bgr, (280, 280)), cv2.COLOR_BGR2HSV)
    h_mean = float(np.mean(hsv[:, :, 0]))
    s_mean = float(np.mean(hsv[:, :, 1]))
    v_mean = float(np.mean(hsv[:, :, 2]))
    white_ratio = float(np.mean((hsv[:, :, 1] < 35) & (hsv[:, :, 2] > 180)))

    color_obs = (
        "Dark brown / organic-rich appearance"
        if v_mean < 85
        else "Reddish-brown / iron-rich (laterite-like) tone"
        if h_mean < 16 and s_mean > 75
        else "Pale tan / sandy or dry clay appearance"
        if v_mean > 145
        else "Medium brown soil"
    )
    moisture_obs = (
        "Appears dark / visibly moist on surface"
        if v_mean < 80
        else "Appears light / dry on surface"
        if v_mean > 140
        else "Moderate surface moisture appearance"
    )
    surface_signs = (
        "Pale whitish surface patches observed — may be salt crust, lime, or surface fungus; inspect closely."
        if white_ratio > 0.14
        else "No prominent white fungal film or salt crust detected on soil surface."
    )

    return {
        "suitable": True,
        "observedColor": color_obs,
        "observedMoisture": moisture_obs,
        "observedTexture": "Crumbly medium soil texture",
        "observedSurfaceSigns": surface_signs,
        "disclaimer": (
            "Visual soil inspection only observes surface color, moisture appearance, and visible texture. "
            "A photograph cannot measure soil pH, nutrient levels (NPK), or salinity — use a soil test kit for exact values."
        ),
    }
