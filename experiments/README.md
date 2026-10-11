# ADAS+ Experiments & Model Benchmarks

This directory contains experimental benchmark artifacts, training evaluation logs, and reproducible performance comparisons for the ADAS+ detection models.

---

## Benchmark Summary (Custom Animal & Obstacle Dataset)

The primary edge vision model was trained using YOLOv3-tiny architecture optimized for low-latency inference on the Raspberry Pi 4 edge compute module.

| Metric | Measured Value | Notes |
|---|---|---|
| **Classes Evaluated** | 3 (`dogs`, `cats`, `cows`) | Roadway stray animals & low-lying obstacles |
| **Training Duration** | 50 Epochs | Transfer learning with AdamW optimizer |
| **Overall Detection Accuracy** | **92.0%** | Aggregate validation test set |
| **Precision (P)** | **94.4%** | Low false-alarm rate across classes |
| **Recall (R)** | **91.7%** | High sensitivity to roadway animal signatures |
| **mAP@50** | **95.0%** | Mean Average Precision at IoU = 0.50 |
| **mAP@50-95** | **68.2%** | Standard COCO evaluation across IoU thresholds |

---

## Empirical Benchmark Artifacts (`experiments/benchmarks/`)

Full training curves and validation outputs are archived in [`experiments/benchmarks/`](./benchmarks/):

- [`results.csv`](./benchmarks/results.csv) — Complete per-epoch telemetry (box_loss, cls_loss, dfl_loss, precision, recall, mAP50, mAP50-95).
- [`results.png`](./benchmarks/results.png) — Multi-panel training loss curves and convergence trajectories over 50 epochs.
- [`confusion_matrix.png`](./benchmarks/confusion_matrix.png) & [`confusion_matrix_normalized.png`](./benchmarks/confusion_matrix_normalized.png) — Class-level prediction confusion matrices.
- [`PR_curve.png`](./benchmarks/PR_curve.png) — Precision-Recall curve across varying confidence thresholds.
- [`F1_curve.png`](./benchmarks/F1_curve.png) — F1 Score vs Confidence score distribution (optimal confidence threshold ~0.45).
- [`val_batch0_pred.jpg`](./benchmarks/val_batch0_pred.jpg) — Validation batch ground-truth vs prediction overlay sample.

---

## Model Architecture Comparison

| Model | Weights File | Input Size | Edge FPS (Pi 4 CPU) | Target Use Case |
|---|---|---|---|---|
| **YOLOv3-tiny (Custom)** | `yolov3-tinyu.pt` | 640×640 | ~4–8 FPS (CPU) / ~18–25 FPS (with Coral TPU/NPU) | Active real-time prototype deployment |
| **YOLO26n (Experimental)** | `yolo26n.pt` | 640×640 | ~10–12 FPS (CPU) | Experimental nano-architecture for higher mAP |

---

## Reproducing Training & Evaluation

To rerun training or reproduce graphs on a machine with CUDA GPU:

```bash
# Verify dataset annotations & class paths
python software/detection/BatchChange.py

# Train 50 epochs with custom data config
python software/detection/train.py

# Regenerate loss and accuracy plots
python software/detection/generate_training_graphs.py
```
