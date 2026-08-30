# Software Detection Module

This directory contains the computer vision scripts, YOLO neural network configurations, model training pipeline, and evaluation tools for **ADAS-Plus**.

## 📄 Files Overview

- **`obstacle_detection.py`**: The primary inference engine and hardware control script. Interfaces with the ESP32-CAM stream, runs YOLO detection, reads sensor telemetry (HC-SR04 / HB100), and serves the Flask web dashboard stream.
- **`run_yolov3_tiny.py`**: Lightweight standalone detection launcher utilizing OpenCV DNN engine and Darknet weights (`yolov3-tiny.cfg`, `coco.names`).
- **`train.py`**: Custom YOLO training script powered by Ultralytics for dataset training and fine-tuning on ADAS custom obstacles.
- **`generate_training_graphs.py`**: Utility script for plotting training loss, precision, recall, and mAP@0.5 curve graphs.
- **`BatchChange.py`**: Dataset automation utility for batch renaming and bounding box format conversions.
- **`yolov3tiny/`**: Contains YOLOv3-Tiny configuration (`yolov3-tiny.cfg`) and COCO class labels (`coco.names`).

## 🛠️ Usage

### Run Detection Engine
```bash
python obstacle_detection.py
```

### Train Custom Model
```bash
python train.py
```
