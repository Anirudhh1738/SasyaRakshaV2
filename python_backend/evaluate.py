"""
AgriGuard AI - Real Model Evaluation Script
Computes Accuracy, Macro Precision, Macro Recall, Macro F1-Score, and Confusion Matrix
from an actual validation/test directory and outputs JSON for AgriGuard AI.
"""

import argparse
import json
from pathlib import Path

import torch
import torch.nn as nn
from sklearn.metrics import accuracy_score, confusion_matrix, precision_recall_fscore_support
from torch.utils.data import DataLoader
from torchvision import datasets, models, transforms


def evaluate(test_dir: Path, model_dir: Path, out_json: Path):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    with open(model_dir / "classes.json", "r", encoding="utf-8") as f:
        classes = json.load(f)

    tf = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])

    ds = datasets.ImageFolder(root=str(test_dir), transform=tf)
    loader = DataLoader(ds, batch_size=32, shuffle=False)

    model = models.mobilenet_v3_large(weights=None)
    model.classifier[3] = nn.Linear(model.classifier[3].in_features, len(classes))
    model.load_state_dict(torch.load(model_dir / "plantvillage_mobilenetv3.pth", map_location=device))
    model.to(device).eval()

    y_true, y_pred = [], []
    with torch.no_grad():
        for imgs, labels in loader:
            preds = model(imgs.to(device)).argmax(dim=1).cpu().tolist()
            y_pred.extend(preds)
            y_true.extend(labels.tolist())

    acc = float(accuracy_score(y_true, y_pred))
    prec, rec, f1, _ = precision_recall_fscore_support(y_true, y_pred, average="macro", zero_division=0)
    cm = confusion_matrix(y_true, y_pred).tolist()

    report = {
        "modelName": "MobileNetV3-Large (PlantVillage)",
        "datasetName": test_dir.name,
        "accuracy": round(acc * 100, 2),
        "precisionMacro": round(float(prec) * 100, 2),
        "recallMacro": round(float(rec) * 100, 2),
        "f1Macro": round(float(f1) * 100, 2),
        "classes": classes,
        "confusionMatrix": cm,
    }

    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    print(f"Saved real evaluation report to {out_json}: Acc={report['accuracy']}%, F1={report['f1Macro']}%")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--test_dir", type=Path, required=True)
    parser.add_argument("--model_dir", type=Path, default=Path("./models"))
    parser.add_argument("--out_json", type=Path, default=Path("./evaluation_report.json"))
    args = parser.parse_args()
    evaluate(args.test_dir, args.model_dir, args.out_json)
