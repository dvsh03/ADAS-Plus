# ADAS-Plus Results & Performance Metrics

> [!NOTE]
> Results come from the current prototype hardware and may change with future hardware.

## 📈 Performance Summary

- **Detection Accuracy**: 92% (evaluated on custom road hazard and animal dataset).
- **Prototype Detection Range**: About 5–6 m (system detection window for low-speed prototype demonstration) | `TODO: add test conditions for the range measurement`.
- **Inference Speed**: ~22-30 FPS on Raspberry Pi 4 (YOLOv3-Tiny at 192x192 resolution) | `TODO: add FPS for Raspberry Pi Zero W`.
- **Detection Precision**: >88% mAP@0.5 on target obstacle classes.
- **Recall**: `TODO: add recall`.
- **Sensor Range**: HC-SR04 ultrasonic sensor accurate up to 3.5 meters with ±1cm accuracy.
- **Radar Motion Latency**: Binary microwave Doppler trigger response under 100 ms.
- **Stream Latency**: <120ms total end-to-end latency from ESP32-CAM to dashboard display.
