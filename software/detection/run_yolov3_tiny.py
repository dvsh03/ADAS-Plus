#!/usr/bin/env python3
"""
Quick test runner for YOLOv3-Tiny model on webcam or sample images.
"""

import os
import cv2
import numpy as np
from ultralytics import YOLO

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "yolov3-tinyu.pt")


def main():
    print("--- ADAS+ YOLOv3-Tiny Inference Test ---")

    if not os.path.isfile(MODEL_PATH):
        print(f"[ERROR] Model file not found: {MODEL_PATH}")
        return

    print(f"[INFO] Loading model: {MODEL_PATH}")
    model = YOLO(MODEL_PATH)

    print("\nSelect mode:")
    print("1. Live Webcam Stream")
    print("2. Test Image Input")

    choice = input("\nEnter choice (1 or 2, default=1): ").strip()

    if choice == "2":
        image_path = input("Enter path to test image (press Enter for synthetic sample): ").strip()
        if not image_path or not os.path.isfile(image_path):
            image_path = os.path.join(BASE_DIR, "test_sample.jpg")
            sample_img = np.zeros((480, 640, 3), dtype=np.uint8)
            cv2.putText(sample_img, "YOLOv3-Tiny Sample", (150, 240),
                        cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 0), 2)
            cv2.imwrite(image_path, sample_img)
            print(f"[INFO] Generated synthetic sample image at: {image_path}")

        print(f"[INFO] Running inference on: {image_path}")
        results = model.predict(source=image_path, save=True, conf=0.25)
        print("[INFO] Detection complete. Saved results under 'runs/detect/'.")

    else:
        print("[INFO] Opening webcam stream (index 0). Press 'q' to quit.")
        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            print("[ERROR] Could not open camera (index 0).")
            return

        try:
            while True:
                ret, frame = cap.read()
                if not ret or frame is None:
                    print("[WARN] Failed to read frame from webcam.")
                    break

                results = model.predict(source=frame, conf=0.25, verbose=False)
                annotated_frame = results[0].plot()

                cv2.imshow("YOLOv3-Tiny Detection", annotated_frame)

                if cv2.waitKey(1) & 0xFF == ord('q'):
                    break
        finally:
            cap.release()
            cv2.destroyAllWindows()
            print("[INFO] Webcam stream closed.")


if __name__ == "__main__":
    main()
