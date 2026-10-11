# ADAS-Plus Testing & Benchmarking

> [!NOTE]
> All test procedures below reflect empirical validation conducted on the working prototype hardware.

## 🧪 Validated Test Procedures & Results

### 1. Object Detection Accuracy & Model Metrics
- **Model**: YOLOv3-Tiny trained on custom road obstacle and animal dataset (14 classes) for 50 epochs.
- **Empirical Results**:
  - Detection Accuracy: **92.0%**
  - Recall: **91.7%**
  - Precision: **94.4%**
  - mAP@0.5: **95.0%** | mAP@0.5:0.95: **73.1%**
- **Inference Speed**: ~22–30 FPS on Raspberry Pi 4 / PC (192×192 input); ~1–2 FPS on Raspberry Pi Zero W with 1.5s detection polling interval.

### 2. Prototype Detection Range & Visual Gating Test
- **Range Tested**: **0.2–6 m** physical prototype detection window (minimum ~20 cm ultrasonic near-field limit up to 5–6 m optical/radar window).
- **Test Conditions**:
  - Low-speed vehicle approach tests and indoor/outdoor bench tests.
  - Obstacle targets: stray animals (cow, dog profiles), pedestrians, and stationary roadway obstacles.
  - Lighting conditions: Full daylight ambient illumination and night-time testing with automated 850 nm IR LED board (<55 grayscale threshold).
  - Validation: Obstacle classification gates the ultrasonic sensor un-gating and buzzer alert triggers.

### 3. Sensor Ranging Accuracy Test
- **Sensor**: HC-SR04 Ultrasonic Distance Sensor with 5-sample median noise filter.
- **Calibration**: Compared against laser distance measure at 0.5 m, 1.0 m, 2.0 m, and 3.0 m.
- **Result**: Accuracy within **±1 cm** up to 3.5 m. Road bounce noise successfully rejected by median filter.

### 4. Radar Velocity & Motion Trigger Test
- **Sensor**: HB100 24 GHz Microwave Doppler Radar.
- **Latency**: Binary motion trigger response under **100 ms**.
- **Environmental Resilience**: Unaffected by optical glare, shadows, or dust.

### 5. Acoustic Alert & Driver Warning Response
- **Actuator**: Active Buzzer (GPIO 18) and visual dashboard indicators.
- **Latency**: Alert triggered within **<100 ms** upon entering proximity threshold (<3.0 m caution, <1.5 m danger).
- **Hysteresis**: 2.5 s grace window eliminates alert flickering over road bumps.

### 6. Video Stream Latency & Stability
- **Node**: ESP32-CAM (OV2640) streaming MJPEG at 320×240.
- **Latency**: **<120 ms** end-to-end latency over 2.4 GHz local Wi-Fi.
- **Stability**: Tested over continuous multi-hour runs without frame buffer overflow.
