# ADAS-Plus Results & Performance Metrics

> [!NOTE]
> Results come from the current prototype hardware and may change with future hardware.

## 📈 Performance Summary

- **Detection Accuracy**: 92% (evaluated on custom road hazard and animal dataset).
- **Prototype Detection Range**: About 5–6 m (tested under low-speed vehicle approach and bench testing on road obstacle and animal targets with day and IR night illumination).
- **Inference Speed**: ~22–30 FPS on Raspberry Pi 4 / PC (YOLOv3-Tiny at 192x192 resolution); ~1–2 FPS on Raspberry Pi Zero W with 1.5s detection polling interval (camera stream at 10–15 FPS).
- **Detection Precision**: >94% (mAP@0.5 is 95.0% on target obstacle classes).
- **Detection Recall**: 91.7% (evaluated on custom road hazard & animal validation dataset).
- **Sensor Range**: HC-SR04 ultrasonic sensor accurate up to 3.5 meters with ±1cm accuracy (5-sample median noise filtered).
- **Radar Motion Latency**: Binary microwave Doppler trigger response under 100 ms.
- **Stream Latency**: <120ms total end-to-end latency from ESP32-CAM to dashboard display.

