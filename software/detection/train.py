#!/usr/bin/env python3
"""
Model training script for ADAS+ obstacle detection.
Fine-tunes YOLOv3-Tiny on custom dataset and exports to ONNX format.
"""

import os
import torch
from ultralytics import YOLO

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def main():
    if torch.cuda.is_available():
        gpu_name = torch.cuda.get_device_name(0)
        device = 0
        print(f"[INFO] CUDA available. Using GPU: {gpu_name}")
    else:
        device = "cpu"
        print("[WARN] CUDA not available. Training will run on CPU.")

    model_path = os.path.join(BASE_DIR, "yolov3-tinyu.pt")
    if not os.path.isfile(model_path):
        print(f"[INFO] Pretrained weights not found locally at {model_path}. Ultralytics will download default weights.")
        model_path = "yolov3-tinyu.pt"

    print(f"[INFO] Loading model weights: {model_path}")
    model = YOLO(model_path)

    data_config = os.path.join(BASE_DIR, "data.yaml")
    print(f"[INFO] Starting model training using dataset config: {data_config}")

    model.train(
        data=data_config,
        epochs=50,
        imgsz=640,
        batch=16,
        device=device,
        workers=0,  # Prevent Windows multiprocessing spawn issues
        project=os.path.join(BASE_DIR, "runs"),
        name="ADAS_plus_yolov3_tiny"
    )

    best_weights = os.path.join(BASE_DIR, "runs", "ADAS_plus_yolov3_tiny", "weights", "best.pt")
    print(f"[INFO] Training finished. Best model saved at: {best_weights}")

    # Export model to ONNX for OpenCV DNN runtime compatibility
    try:
        model.export(format="onnx")
        print("[INFO] Model exported to ONNX format successfully.")
    except Exception as e:
        print(f"[WARN] ONNX export failed: {e}")


if __name__ == "__main__":
    main()
